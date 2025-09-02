const WPPConnectClient = require('./wppconnectClient');
const FirebaseService = require('./firebaseService');
const QueueService = require('./queueService');
const RateLimitService = require('./rateLimitService');
const { globalTimeConfigService } = require('./globalTimeConfigService');

class AutomationService {
  constructor() {
    this.wppconnectClient = new WPPConnectClient();
    this.firebaseService = new FirebaseService();
    this.queueService = new QueueService();
    this.rateLimitService = new RateLimitService();
    this.timeConfig = globalTimeConfigService;
    this.isRunning = false;
    this.lastRulesCheck = null;
  }

  /**
   * Start the automation service
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Automation service is already running');
      return;
    }

    console.log('🚀 Starting automation service...');

    try {
      // Check WhatsApp connection (if enabled)
      if (process.env.WHATSAPP_ENABLED === 'true') {
        const isConnected = await this.wppconnectClient.checkConnection();
        if (!isConnected) {
          throw new Error('WPPConnect server is not connected');
        }
      } else {
        console.log('📱 WhatsApp services disabled in development mode');
      }

      // Check Firebase connection (if enabled)
      if (process.env.FIREBASE_ENABLED === 'true') {
        const firebaseHealth = await this.firebaseService.healthCheck();
        if (!firebaseHealth.connected) {
          throw new Error('Firebase connection failed');
        }
      } else {
        console.log('🔥 Firebase services disabled in development mode');
      }

      this.isRunning = true;
      console.log('✅ Automation service started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start automation service:', error.message);
      throw error;
    }
  }

  /**
   * Stop the automation service
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Automation service is not running');
      return;
    }

    console.log('🛑 Stopping automation service...');
    this.isRunning = false;
    
    try {
      await this.queueService.close();
      await this.rateLimitService.close();
      console.log('✅ Automation service stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping automation service:', error.message);
    }
  }

  /**
   * Check and execute automation rules
   */
  async checkAndExecuteRules() {
    if (!this.isRunning) {
      console.log('⚠️ Automation service is not running');
      return;
    }

    try {
      console.log('🔍 Checking automation rules...');
      
      // Get automation rules from Firebase
      const rules = await this.firebaseService.getAutomationRules();
      if (rules.length === 0) {
        console.log('ℹ️ No active automation rules found');
        return;
      }

      // Get rate limiting rules
      const rateRules = await this.firebaseService.getRateLimitingRules();
      
      // Get students
      const students = await this.firebaseService.getStudents();
      if (students.length === 0) {
        console.log('ℹ️ No students found');
        return;
      }

      const now = new Date();
      let executedRules = 0;

      // Process each rule
      for (const rule of rules) {
        try {
          if (await this.shouldExecuteRule(rule, now)) {
            await this.executeRule(rule, students, rateRules);
            executedRules++;
          }
        } catch (error) {
          console.error(`❌ Error processing rule ${rule.id}:`, error.message);
        }
      }

      console.log(`✅ Processed ${executedRules} rules out of ${rules.length} total rules`);
      this.lastRulesCheck = now;
      
    } catch (error) {
      console.error('❌ Error checking automation rules:', error.message);
    }
  }

  /**
   * Check if a rule should be executed
   * @param {Object} rule - Automation rule
   * @param {Date} now - Current time
   * @returns {Promise<boolean>} - Whether rule should execute
   */
  async shouldExecuteRule(rule, now) {
    if (!rule.enabled) {
      console.log(`❌ Rule ${rule.id} is disabled`);
      return false;
    }

    // Check schedule
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const ruleTime = rule.schedule.time;
    
    console.log(`🕒 Checking rule ${rule.id}: Current time ${currentTime}, Rule time ${ruleTime}`);
    
    // Exact time match
    if (currentTime === ruleTime) {
      console.log(`✅ Rule ${rule.id} exact time match!`);
      return this.checkFrequency(rule, now);
    }
    
    // Grace period: use centralized configuration
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [ruleHour, ruleMinute] = ruleTime.split(':').map(Number);
    const ruleMinutes = ruleHour * 60 + ruleMinute;
    
    const timeDifference = Math.abs(currentMinutes - ruleMinutes);
    const config = this.timeConfig.getConfig();
    const gracePeriodMinutes = config.automationRules.gracePeriodMinutes;
    
    console.log(`⏱️ Rule ${rule.id} time difference: ${timeDifference} minutes (grace period: ${gracePeriodMinutes} minutes)`);
    
    if (timeDifference <= gracePeriodMinutes) {
      console.log(`⏰ Rule ${rule.id} triggered within grace period (${timeDifference} min difference)`);
      return this.checkFrequency(rule, now);
    }
    
    console.log(`❌ Rule ${rule.id} outside grace period`);
    return false;
  }

  /**
   * Check frequency conditions for a rule
   * @param {Object} rule - Automation rule
   * @param {Date} now - Current time
   * @returns {boolean} - Whether frequency conditions are met
   */
  checkFrequency(rule, now) {
    console.log(`📅 Checking frequency for rule ${rule.id}: ${rule.schedule.frequency}`);
    
    if (rule.schedule.frequency === 'daily') {
      console.log(`✅ Rule ${rule.id} frequency check passed (daily)`);
      return true;
    } else if (rule.schedule.frequency === 'weekly') {
      const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const allowed = rule.schedule.daysOfWeek?.includes(dayOfWeek) || false;
      console.log(`📅 Rule ${rule.id} weekly check: today=${dayOfWeek}, allowed days=${rule.schedule.daysOfWeek?.join(',') || 'none'}, result=${allowed}`);
      return allowed;
    }
    
    console.log(`❌ Rule ${rule.id} unknown frequency: ${rule.schedule.frequency}`);
    return false;
  }

  /**
   * Execute an automation rule
   * @param {Object} rule - Automation rule
   * @param {Array} students - Array of students
   * @param {Array} rateRules - Rate limiting rules
   */
  async executeRule(rule, students, rateRules) {
    try {
      console.log(`🎯 Executing rule: ${rule.name} (${rule.id})`);
      
      // Check rate limits before processing
      const rateCheck = await this.rateLimitService.checkRateLimits(rateRules);
      if (!rateCheck.allowed) {
        console.log(`⏸️ Rate limit check failed for rule ${rule.id}: ${rateCheck.reason}`);
        return;
      }

      // Get message template
      if (!rule.templateId) {
        console.log(`⚠️ Rule ${rule.id} has no templateId defined, skipping...`);
        return;
      }
      
      // Try to get template from Firebase, fallback to default templates
      let template;
      try {
        template = await this.firebaseService.getTemplate(rule.templateId);
      } catch (error) {
        console.log(`⚠️ Template ${rule.templateId} not found in Firebase, checking default templates...`);
        template = this.getDefaultTemplate(rule.templateId);
        if (!template) {
          console.log(`❌ Template ${rule.templateId} not found in defaults either, skipping rule...`);
          return;
        }
        console.log(`✅ Using default template: ${template.name}`);
      }
      
      // Filter students based on rule criteria
      console.log(`🔍 Filtering ${students.length} students for rule ${rule.id} criteria...`);
      console.log(`📋 Rule criteria:`, JSON.stringify(rule.criteria, null, 2));
      
      const matchingStudents = students.filter(student => 
        this.studentMatchesRule(student, rule)
      );

      if (matchingStudents.length === 0) {
        console.log(`ℹ️ No students match criteria for rule ${rule.id}`);
        console.log(`📊 Sample student for debugging:`, students[0] ? {
          id: students[0].id,
          name: students[0].name,
          feeStatus: students[0].feeStatus,
          dueDate: students[0].dueDate,
          whatsappNumber: students[0].whatsappNumber
        } : 'No students available');
        await this.firebaseService.updateRuleLastRun(rule.id, rule.userId);
        return;
      }

      console.log(`👥 Found ${matchingStudents.length} students matching rule ${rule.id}`);

      // Queue messages for each matching student
      let queuedMessages = 0;
      for (const student of matchingStudents) {
        try {
          const message = this.formatMessage(template.content, student);
          
          await this.queueService.addMessage({
            phoneNumber: student.whatsappNumber,
            message: message,
            ruleId: rule.id,
            studentId: student.id,
            studentName: student.name
          });

          queuedMessages++;
          
        } catch (error) {
          console.error(`❌ Failed to queue message for ${student.name}:`, error.message);
        }
      }

      console.log(`📥 Queued ${queuedMessages} messages for rule ${rule.id}`);
      
      // Update rule last run time
      await this.firebaseService.updateRuleLastRun(rule.id, rule.userId);
      
    } catch (error) {
      console.error(`❌ Error executing rule ${rule.id}:`, error.message);
    }
  }

  /**
   * Check if a student matches the rule criteria
   * @param {Object} student - Student object
   * @param {Object} rule - Automation rule
   * @returns {boolean} - Whether student matches
   */
  studentMatchesRule(student, rule) {
    try {
      console.log(`🔍 Checking student ${student.name || student.id} against rule ${rule.id}:`);
      
      // Check if student has WhatsApp number
      if (!student.whatsappNumber) {
        console.log(`   ❌ No WhatsApp number for ${student.name}`);
        return false;
      }
      console.log(`   ✅ Has WhatsApp number: ${student.whatsappNumber}`);

      // Check payment status if specified
      if (rule.criteria && rule.criteria.paymentStatus) {
        if (student.paymentStatus !== rule.criteria.paymentStatus) {
          console.log(`   ❌ Payment status mismatch: student=${student.paymentStatus}, rule=${rule.criteria.paymentStatus}`);
          return false;
        }
        console.log(`   ✅ Payment status matches: ${student.paymentStatus}`);
      }

      // Check due date criteria
      if (rule.criteria && rule.criteria.dueDate) {
        const dueDate = new Date(student.dueDate);
        const now = new Date();
        const daysDifference = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
        
        console.log(`   📅 Due date check: student due=${dueDate.toISOString().split('T')[0]}, days difference=${daysDifference}, condition=${rule.criteria.dueDate.condition}, required days=${rule.criteria.dueDate.days}`);
        
        if (rule.criteria.dueDate.condition === 'overdue' && daysDifference >= 0) {
          console.log(`   ❌ Not overdue (days difference: ${daysDifference})`);
          return false;
        }
        
        if (rule.criteria.dueDate.condition === 'before' && daysDifference > rule.criteria.dueDate.days) {
          console.log(`   ❌ Not within before range (${daysDifference} > ${rule.criteria.dueDate.days})`);
          return false;
        }
        
        if (rule.criteria.dueDate.condition === 'after' && daysDifference < rule.criteria.dueDate.days) {
          console.log(`   ❌ Not within after range (${daysDifference} < ${rule.criteria.dueDate.days})`);
          return false;
        }
        
        console.log(`   ✅ Due date criteria satisfied`);
      }

      // Check class/course criteria
      if (rule.criteria && rule.criteria.classId && student.classId !== rule.criteria.classId) {
        console.log(`   ❌ Class ID mismatch: student=${student.classId}, rule=${rule.criteria.classId}`);
        return false;
      }

      console.log(`   ✅ Student ${student.name} matches all criteria for rule ${rule.id}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error checking student ${student.name || student.id} against rule ${rule.id}:`, error.message);
      return false;
    }
  }

  /**
   * Format message with student data
   * @param {string} template - Message template
   * @param {Object} student - Student object
   * @returns {string} - Formatted message
   */
  formatMessage(template, student) {
    try {
      let message = template;
      
      // Replace placeholders with student data
      const placeholders = {
        '{name}': student.name || 'Student',
        '{class}': student.className || 'Class',
        '{course}': student.courseName || 'Course',
        '{dueDate}': student.dueDate ? new Date(student.dueDate).toLocaleDateString() : 'Due Date',
        '{amount}': student.amount || 'Amount',
        '{phone}': student.phone || 'Phone',
        '{email}': student.email || 'Email'
      };

      for (const [placeholder, value] of Object.entries(placeholders)) {
        message = message.replace(new RegExp(placeholder, 'g'), value);
      }

      return message;
      
    } catch (error) {
      console.error(`❌ Error formatting message for ${student.name}:`, error.message);
      return template; // Return original template if formatting fails
    }
  }

  /**
   * Get service status
   * @returns {Promise<Object>} - Service status
   */
  async getStatus() {
    try {
      const wppconnectHealth = await this.wppconnectClient.healthCheck();
      const firebaseHealth = await this.firebaseService.healthCheck();
      const queueHealth = await this.queueService.healthCheck();
      const rateLimitHealth = await this.rateLimitService.healthCheck();

      return {
        service: 'automation',
        running: this.isRunning,
        lastRulesCheck: this.lastRulesCheck,
        wppconnect: wppconnectHealth,
        firebase: firebaseHealth,
        queue: queueHealth,
        rateLimit: rateLimitHealth,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        service: 'automation',
        running: this.isRunning,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Test message sending
   * @param {string} phoneNumber - Phone number to test
   * @param {string} message - Test message
   * @returns {Promise<Object>} - Test result
   */
  async testMessage(phoneNumber, message) {
    try {
      console.log(`🧪 Testing message sending to ${phoneNumber}`);
      
      const result = await this.wppconnectClient.sendMessageWithRetry(phoneNumber, message);
      
      console.log(`✅ Test message sent successfully to ${phoneNumber}`);
      return { success: true, result };
      
    } catch (error) {
      console.error(`❌ Test message failed for ${phoneNumber}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get default template by ID (fallback for when Firebase templates don't exist)
   * @param {string} templateId - Template ID
   * @returns {Object|null} - Default template or null
   */
  getDefaultTemplate(templateId) {
    const defaultTemplates = {
      'fee-reminder': {
        id: 'fee-reminder',
        name: 'Fee Reminder',
        content: 'Dear {studentName}, this is a reminder that your fee of {feeAmount} is due on {dueDate}. Please make the payment to avoid any late fees. Thank you!',
        variables: ['studentName', 'feeAmount', 'dueDate'],
        category: 'fee'
      },
      'overdue-notice': {
        id: 'overdue-notice',
        name: 'Overdue Notice',
        content: 'Dear {studentName}, your fee of {feeAmount} was due on {dueDate} and is now {daysOverdue} days overdue. Please make the payment immediately to avoid further penalties.',
        variables: ['studentName', 'feeAmount', 'dueDate', 'daysOverdue'],
        category: 'fee'
      },
      'payment-confirmation': {
        id: 'payment-confirmation',
        name: 'Payment Confirmation',
        content: 'Dear {studentName}, thank you for your payment of {feeAmount}. Your payment has been received and processed successfully. Thank you for your prompt payment!',
        variables: ['studentName', 'feeAmount'],
        category: 'fee'
      },
      'general-template': {
        id: 'general-template',
        name: 'General Template',
        content: 'Hello {studentName}, this is a general message from {instituteName}. We hope this message finds you well. If you have any questions, please don\'t hesitate to contact us at {contactNumber}.',
        variables: ['studentName', 'instituteName', 'contactNumber'],
        category: 'general'
      }
    };

    return defaultTemplates[templateId] || null;
  }
}

module.exports = AutomationService;
