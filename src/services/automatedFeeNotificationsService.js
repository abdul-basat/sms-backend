/**
 * Automated Fee Notifications Service
 * Handles automated fee reminders and payment confirmations
 */

const CoreMessagingService = require('./coreMessagingService');
const MessageTemplateService = require('./messageTemplateService');
const { db } = require('../config/firebase');
const logger = require('../utils/logger');

class AutomatedFeeNotificationsService {
  constructor() {
    this.messagingService = new CoreMessagingService();
    this.templateService = new MessageTemplateService();
    this.reminderSchedules = new Map(); // organizationId -> reminder schedule
    this.lastReminderCheck = new Map(); // organizationId -> last check timestamp
  }

  /**
   * Check and send due date reminders for all organizations
   * Called by cron job every hour
   */
  async checkAndSendDueDateReminders() {
    try {
      logger.info('[AutomatedFeeNotificationsService] Starting due date reminder check');

      // Get all organizations with WhatsApp enabled
      const organizations = await this.getOrganizationsWithWhatsApp();
      
      let totalReminders = 0;
      let totalOrganizations = organizations.length;

      for (const organization of organizations) {
        try {
          const reminderCount = await this.processOrganizationReminders(organization.id);
          totalReminders += reminderCount;
          
          // Update last check timestamp
          this.lastReminderCheck.set(organization.id, Date.now());

        } catch (error) {
          logger.error(`[AutomatedFeeNotificationsService] Failed to process reminders for organization ${organization.id}:`, error);
        }
      }

      logger.info(`[AutomatedFeeNotificationsService] Due date reminder check completed: ${totalReminders} reminders sent across ${totalOrganizations} organizations`);

      return {
        success: true,
        totalOrganizations,
        totalReminders,
        processedAt: new Date()
      };

    } catch (error) {
      logger.error('[AutomatedFeeNotificationsService] Failed to check due date reminders:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process reminders for a specific organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} - Number of reminders sent
   */
  async processOrganizationReminders(organizationId) {
    try {
      logger.info(`[AutomatedFeeNotificationsService] Processing reminders for organization: ${organizationId}`);

      // Get organization reminder configuration
      const reminderConfig = await this.getReminderConfiguration(organizationId);
      if (!reminderConfig.enabled) {
        logger.info(`[AutomatedFeeNotificationsService] Reminders disabled for organization: ${organizationId}`);
        return 0;
      }

      // Check business hours
      if (!this.isWithinBusinessHours(reminderConfig.businessHours)) {
        logger.info(`[AutomatedFeeNotificationsService] Outside business hours for organization: ${organizationId}`);
        return 0;
      }

      // Get students with upcoming or overdue fees
      const studentsToRemind = await this.getStudentsForReminders(organizationId, reminderConfig);
      
      if (studentsToRemind.length === 0) {
        logger.info(`[AutomatedFeeNotificationsService] No students need reminders for organization: ${organizationId}`);
        return 0;
      }

      logger.info(`[AutomatedFeeNotificationsService] Found ${studentsToRemind.length} students needing reminders for organization: ${organizationId}`);

      let sentCount = 0;

      // Send reminders with rate limiting
      for (const student of studentsToRemind) {
        try {
          const reminderSent = await this.sendFeeReminder(organizationId, student, reminderConfig);
          if (reminderSent.success) {
            sentCount++;
          }

          // Add delay between messages to respect rate limits
          if (reminderConfig.delayBetweenMessages > 0) {
            await this.delay(reminderConfig.delayBetweenMessages);
          }

        } catch (error) {
          logger.error(`[AutomatedFeeNotificationsService] Failed to send reminder for student ${student.id}:`, error);
        }
      }

      logger.info(`[AutomatedFeeNotificationsService] Sent ${sentCount}/${studentsToRemind.length} reminders for organization: ${organizationId}`);
      
      return sentCount;

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to process reminders for organization ${organizationId}:`, error);
      return 0;
    }
  }

  /**
   * Send individual fee reminder
   * @param {string} organizationId - Organization ID
   * @param {Object} student - Student data
   * @param {Object} config - Reminder configuration
   * @returns {Promise<Object>} - Send result
   */
  async sendFeeReminder(organizationId, student, config) {
    try {
      // Determine reminder type based on due date
      const today = new Date();
      const dueDate = new Date(student.dueDate);
      const daysDifference = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

      let reminderType = 'fee_reminder';
      if (daysDifference < 0) {
        reminderType = 'fee_overdue';
      } else if (daysDifference <= 1) {
        reminderType = 'fee_urgent';
      }

      // Get appropriate template
      const template = await this.templateService.getTemplateByCategory(organizationId, 'fee_reminder');
      if (!template) {
        logger.error(`[AutomatedFeeNotificationsService] No fee reminder template found for organization: ${organizationId}`);
        return { success: false, error: 'No reminder template found' };
      }

      // Prepare template variables
      const variables = {
        studentName: student.name,
        parentName: student.parentName || student.name,
        feeAmount: student.feeAmount || 'N/A',
        dueDate: this.formatDate(dueDate),
        className: student.className || student.class || 'N/A',
        daysDue: daysDifference < 0 ? Math.abs(daysDifference) : 0,
        daysRemaining: daysDifference > 0 ? daysDifference : 0,
        organizationName: config.organizationName || 'School',
        contactInfo: config.contactInfo || ''
      };

      // Check if reminder was already sent recently
      const recentReminder = await this.checkRecentReminder(organizationId, student.id, reminderType);
      if (recentReminder) {
        logger.info(`[AutomatedFeeNotificationsService] Reminder already sent recently for student ${student.id}`);
        return { success: false, error: 'Reminder already sent recently' };
      }

      // Send message
      const messageData = {
        recipientId: student.id,
        phoneNumber: student.whatsappNumber || student.phoneNumber,
        templateId: template.id,
        variables,
        type: 'automated_fee_reminder',
        priority: daysDifference < 0 ? 'high' : 'normal'
      };

      const result = await this.messagingService.sendMessage(organizationId, messageData);

      if (result.success) {
        // Log the reminder
        await this.logReminderSent(organizationId, student.id, reminderType, result.messageId);
        
        logger.info(`[AutomatedFeeNotificationsService] Fee reminder sent to student ${student.id} (${student.name})`);
      }

      return result;

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to send fee reminder for student ${student.id}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send payment confirmation (called when payment is received)
   * @param {string} organizationId - Organization ID
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} - Send result
   */
  async sendPaymentConfirmation(organizationId, paymentData) {
    try {
      logger.info(`[AutomatedFeeNotificationsService] Sending payment confirmation for student ${paymentData.studentId}`);

      // Get payment confirmation template
      const template = await this.templateService.getTemplateByCategory(organizationId, 'payment_confirmation');
      if (!template) {
        logger.error(`[AutomatedFeeNotificationsService] No payment confirmation template found for organization: ${organizationId}`);
        return { success: false, error: 'No payment confirmation template found' };
      }

      // Get student data
      const student = await this.getStudentData(organizationId, paymentData.studentId);
      if (!student) {
        return { success: false, error: 'Student not found' };
      }

      // Prepare template variables
      const variables = {
        studentName: student.name,
        parentName: student.parentName || student.name,
        paidAmount: paymentData.amount,
        paymentDate: this.formatDate(new Date(paymentData.paymentDate)),
        paymentMethod: paymentData.method || 'Cash',
        receiptNumber: paymentData.receiptNumber || 'N/A',
        className: student.className || student.class || 'N/A',
        remainingBalance: paymentData.remainingBalance || '0',
        organizationName: paymentData.organizationName || 'School'
      };

      // Send message
      const messageData = {
        recipientId: student.id,
        phoneNumber: student.whatsappNumber || student.phoneNumber,
        templateId: template.id,
        variables,
        type: 'automated_payment_confirmation',
        priority: 'normal'
      };

      const result = await this.messagingService.sendMessage(organizationId, messageData);

      if (result.success) {
        logger.info(`[AutomatedFeeNotificationsService] Payment confirmation sent to student ${student.id} (${student.name})`);
        
        // Log the confirmation
        await this.logPaymentConfirmationSent(organizationId, paymentData.studentId, result.messageId, paymentData);
      }

      return result;

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to send payment confirmation:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organizations with WhatsApp enabled
   * @returns {Promise<Array>} - Organizations
   */
  async getOrganizationsWithWhatsApp() {
    try {
      const snapshot = await db.collection('organizations')
        .where('whatsappConfig.enabled', '==', true)
        .where('whatsappConfig.automatedReminders', '==', true)
        .get();

      const organizations = [];
      snapshot.forEach(doc => {
        organizations.push({ id: doc.id, ...doc.data() });
      });

      return organizations;

    } catch (error) {
      logger.error('[AutomatedFeeNotificationsService] Failed to get organizations with WhatsApp:', error);
      return [];
    }
  }

  /**
   * Get reminder configuration for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Reminder configuration
   */
  async getReminderConfiguration(organizationId) {
    try {
      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      
      if (!orgDoc.exists) {
        return this.getDefaultReminderConfig();
      }

      const orgData = orgDoc.data();
      const reminderConfig = orgData.reminderConfig || {};

      return {
        enabled: reminderConfig.enabled !== false,
        reminderDays: reminderConfig.reminderDays || [3, 1, 0], // 3 days before, 1 day before, on due date
        overdueReminderDays: reminderConfig.overdueReminderDays || [1, 3, 7], // 1, 3, 7 days after due date
        businessHours: reminderConfig.businessHours || { start: '09:00', end: '17:00' },
        delayBetweenMessages: reminderConfig.delayBetweenMessages || 5000, // 5 seconds
        organizationName: orgData.name || 'School',
        contactInfo: orgData.contactInfo || ''
      };

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to get reminder config for organization ${organizationId}:`, error);
      return this.getDefaultReminderConfig();
    }
  }

  /**
   * Get students that need reminders
   * @param {string} organizationId - Organization ID
   * @param {Object} config - Reminder configuration
   * @returns {Promise<Array>} - Students needing reminders
   */
  async getStudentsForReminders(organizationId, config) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of day

      // Calculate target dates for reminders
      const targetDates = [];
      
      // Before due date reminders
      config.reminderDays.forEach(days => {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);
        targetDates.push({
          date: targetDate,
          type: 'upcoming',
          days: days
        });
      });

      // Overdue reminders
      config.overdueReminderDays.forEach(days => {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - days);
        targetDates.push({
          date: targetDate,
          type: 'overdue',
          days: days
        });
      });

      const studentsToRemind = [];

      // Query students for each target date
      for (const target of targetDates) {
        const students = await this.getStudentsByDueDate(organizationId, target.date);
        
        for (const student of students) {
          // Only include unpaid students
          if (student.paymentStatus !== 'paid' && student.whatsappNumber) {
            studentsToRemind.push({
              ...student,
              reminderType: target.type,
              daysDifference: target.days
            });
          }
        }
      }

      // Remove duplicates
      const uniqueStudents = studentsToRemind.filter((student, index, self) =>
        index === self.findIndex(s => s.id === student.id)
      );

      return uniqueStudents;

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to get students for reminders:`, error);
      return [];
    }
  }

  /**
   * Get students by due date
   * @param {string} organizationId - Organization ID
   * @param {Date} dueDate - Due date
   * @returns {Promise<Array>} - Students
   */
  async getStudentsByDueDate(organizationId, dueDate) {
    try {
      const startOfDay = new Date(dueDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(dueDate);
      endOfDay.setHours(23, 59, 59, 999);

      const snapshot = await db.collection(`organizationData/${organizationId}/students`)
        .where('dueDate', '>=', startOfDay)
        .where('dueDate', '<=', endOfDay)
        .where('paymentStatus', '!=', 'paid')
        .get();

      const students = [];
      snapshot.forEach(doc => {
        const studentData = doc.data();
        if (studentData.whatsappNumber) {
          students.push({ id: doc.id, ...studentData });
        }
      });

      return students;

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to get students by due date:`, error);
      return [];
    }
  }

  /**
   * Check if reminder was sent recently
   * @param {string} organizationId - Organization ID
   * @param {string} studentId - Student ID
   * @param {string} reminderType - Reminder type
   * @returns {Promise<boolean>} - True if reminder was sent recently
   */
  async checkRecentReminder(organizationId, studentId, reminderType) {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const snapshot = await db.collection('reminderLogs')
        .where('organizationId', '==', organizationId)
        .where('studentId', '==', studentId)
        .where('reminderType', '==', reminderType)
        .where('sentAt', '>=', twentyFourHoursAgo)
        .limit(1)
        .get();

      return !snapshot.empty;

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to check recent reminders:`, error);
      return false; // Allow sending on error
    }
  }

  /**
   * Log reminder sent
   * @param {string} organizationId - Organization ID
   * @param {string} studentId - Student ID
   * @param {string} reminderType - Reminder type
   * @param {string} messageId - Message ID
   */
  async logReminderSent(organizationId, studentId, reminderType, messageId) {
    try {
      const logEntry = {
        organizationId,
        studentId,
        reminderType,
        messageId,
        sentAt: new Date(),
        id: `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      await db.collection('reminderLogs').doc(logEntry.id).set(logEntry);

    } catch (error) {
      logger.error('[AutomatedFeeNotificationsService] Failed to log reminder:', error);
    }
  }

  /**
   * Log payment confirmation sent
   * @param {string} organizationId - Organization ID
   * @param {string} studentId - Student ID
   * @param {string} messageId - Message ID
   * @param {Object} paymentData - Payment data
   */
  async logPaymentConfirmationSent(organizationId, studentId, messageId, paymentData) {
    try {
      const logEntry = {
        organizationId,
        studentId,
        messageId,
        paymentAmount: paymentData.amount,
        paymentDate: paymentData.paymentDate,
        sentAt: new Date(),
        id: `payment_confirmation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      await db.collection('paymentConfirmationLogs').doc(logEntry.id).set(logEntry);

    } catch (error) {
      logger.error('[AutomatedFeeNotificationsService] Failed to log payment confirmation:', error);
    }
  }

  /**
   * Get student data
   * @param {string} organizationId - Organization ID
   * @param {string} studentId - Student ID
   * @returns {Promise<Object|null>} - Student data
   */
  async getStudentData(organizationId, studentId) {
    try {
      const doc = await db.collection(`organizationData/${organizationId}/students`).doc(studentId).get();
      
      if (!doc.exists) {
        return null;
      }

      return { id: doc.id, ...doc.data() };

    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Failed to get student data for ${studentId}:`, error);
      return null;
    }
  }

  /**
   * Check if current time is within business hours
   * @param {Object} businessHours - Business hours configuration
   * @returns {boolean} - True if within business hours
   */
  isWithinBusinessHours(businessHours) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = businessHours.start.split(':').map(Number);
    const [endHour, endMinute] = businessHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Format date for display
   * @param {Date} date - Date to format
   * @returns {string} - Formatted date
   */
  formatDate(date) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Get default reminder configuration
   * @returns {Object} - Default configuration
   */
  getDefaultReminderConfig() {
    return {
      enabled: true,
      reminderDays: [3, 1, 0],
      overdueReminderDays: [1, 3, 7],
      businessHours: { start: '09:00', end: '17:00' },
      delayBetweenMessages: 5000,
      organizationName: 'School',
      contactInfo: ''
    };
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutomatedFeeNotificationsService;
