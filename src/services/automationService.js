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
      if (process.env.WHATSAPP_ENABLED !== 'false') {
        const isConnected = await this.wppconnectClient.checkConnection();
        if (!isConnected) {
          throw new Error('WPPConnect server is not connected');
        }
      } else {
        console.log('📱 WhatsApp services disabled in development mode');
      }

      // Check Firebase connection (if enabled)
      if (process.env.FIREBASE_ENABLED !== 'false') {
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
      return false;
    }

    // Check schedule
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const ruleTime = rule.schedule.time;
    
    // Exact time match
    if (currentTime === ruleTime) {
      return this.checkFrequency(rule, now);
    }
    
    // Grace period: use centralized configuration
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [ruleHour, ruleMinute] = ruleTime.split(':').map(Number);
    const ruleMinutes = ruleHour * 60 + ruleMinute;
    
    const timeDifference = Math.abs(currentMinutes - ruleMinutes);
    const config = this.timeConfig.getConfig();
    const gracePeriodMinutes = config.automationRules.gracePeriodMinutes;
    
    if (timeDifference <= gracePeriodMinutes) {
      console.log(`⏰ Rule ${rule.id} triggered within grace period (${timeDifference} min difference)`);
      return this.checkFrequency(rule, now);
    }
    
    return false;
  }

  /**
   * Check frequency conditions for a rule
   * @param {Object} rule - Automation rule
   * @param {Date} now - Current time
   * @returns {boolean} - Whether frequency conditions are met
   */
  checkFrequency(rule, now) {
    if (rule.schedule.frequency === 'daily') {
      return true;
    } else if (rule.schedule.frequency === 'weekly') {
      const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      return rule.schedule.daysOfWeek?.includes(dayOfWeek) || false;
    }
    
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
      const template = await this.firebaseService.getTemplate(rule.templateId);
      
      // Filter students based on rule criteria
      const matchingStudents = students.filter(student => 
        this.studentMatchesRule(student, rule)
      );

      if (matchingStudents.length === 0) {
        console.log(`ℹ️ No students match criteria for rule ${rule.id}`);
        await this.firebaseService.updateRuleLastRun(rule.id);
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
      await this.firebaseService.updateRuleLastRun(rule.id);
      
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
      // Check if student has WhatsApp number
      if (!student.whatsappNumber) {
        return false;
      }

      // Check payment status if specified
      if (rule.criteria && rule.criteria.paymentStatus) {
        if (student.paymentStatus !== rule.criteria.paymentStatus) {
          return false;
        }
      }

      // Check due date criteria
      if (rule.criteria && rule.criteria.dueDate) {
        const dueDate = new Date(student.dueDate);
        const now = new Date();
        const daysDifference = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
        
        if (rule.criteria.dueDate.condition === 'overdue' && daysDifference >= 0) {
          return false;
        }
        
        if (rule.criteria.dueDate.condition === 'before' && daysDifference > rule.criteria.dueDate.days) {
          return false;
        }
        
        if (rule.criteria.dueDate.condition === 'after' && daysDifference < rule.criteria.dueDate.days) {
          return false;
        }
      }

      // Check class/course criteria
      if (rule.criteria && rule.criteria.classId && student.classId !== rule.criteria.classId) {
        return false;
      }

      return true;
      
    } catch (error) {
      console.error(`❌ Error checking student match for ${student.name}:`, error.message);
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
}

module.exports = AutomationService;
