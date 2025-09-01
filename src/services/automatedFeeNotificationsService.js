/**
 * Automated Fee Notifications Service
 * Handles automated fee reminders and payment confirmations
 */

const moment = require('moment-timezone');
const CoreMessagingService = require('./coreMessagingService');
const MessageTemplateService = require('./messageTemplateService');
const QueueService = require('./queueService');
const { db } = require('../config/firebase');
const logger = require('../utils/logger');

class AutomatedFeeNotificationsService {
  constructor() {
    this.messagingService = new CoreMessagingService();
    this.templateService = new MessageTemplateService();
    this.queueService = new QueueService();
    this.reminderSchedules = new Map(); // organizationId -> reminder schedule
    this.lastReminderCheck = new Map(); // organizationId -> last check timestamp
  }

  /**
   * Finds students who need reminders and queues the messages to be sent at a random time
   * within the organization's configured sending window.
   * Called by the cron job every 5 minutes.
   */
  async enqueueScheduledReminders() {
    try {
      logger.info('[AutomatedFeeNotificationsService] Starting reminder enqueue job');
      const organizations = await this.getOrganizationsWithWhatsApp();
      let totalQueued = 0;

      for (const organization of organizations) {
        const reminderConfig = await this.getReminderConfiguration(organization.id);
        if (!reminderConfig.enabled) {
          continue;
        }

        const studentsToRemind = await this.getStudentsForReminders(organization.id, reminderConfig);
        if (studentsToRemind.length === 0) {
          continue;
        }

        logger.info(`[AutomatedFeeNotificationsService] Found ${studentsToRemind.length} potential students for reminders in organization: ${organization.id}`);

        for (const student of studentsToRemind) {
          const reminderType = student.reminderType; // 'upcoming' or 'overdue'

          // 1. Check if already queued today to prevent duplicates
          const alreadyQueued = await this.checkIfQueuedToday(organization.id, student.id, reminderType);
          if (alreadyQueued) {
            logger.info(`[AutomatedFeeNotificationsService] Reminder for student ${student.id} already queued today.`);
            continue;
          }

          // 2. Generate message content from template
          const messageContent = await this.generateReminderMessage(organization.id, student, reminderConfig);
          if (!messageContent) {
            logger.error(`[AutomatedFeeNotificationsService] Could not generate message for student ${student.id}.`);
            continue;
          }

          // 3. Calculate random send time and delay
          const timezone = process.env.TZ || 'Asia/Karachi';
          const now = moment.tz(timezone);
          const sendWindowStart = moment.tz(reminderConfig.sendWindowStart, 'HH:mm', timezone);
          const sendWindowEnd = moment.tz(reminderConfig.sendWindowEnd, 'HH:mm', timezone);

          // Ensure the window is for the current day
          sendWindowStart.day(now.day());
          sendWindowEnd.day(now.day());

          // If the current time is already past the send window, do nothing for today
          if (now.isAfter(sendWindowEnd)) {
            logger.info(`[AutomatedFeeNotificationsService] Current time is past the sending window for organization ${organization.id}.`);
            continue;
          }

          // Set the earliest send time to be now() or the start of the window, whichever is later
          const earliestSendTime = moment.max(now, sendWindowStart);

          const randomSendTime = moment(earliestSendTime).add(Math.random() * (sendWindowEnd.diff(earliestSendTime)), 'ms');
          const delay = randomSendTime.diff(now);

          // 4. Schedule the job
          const jobData = {
            organizationId: organization.id,
            studentId: student.id,
            studentName: student.name,
            phoneNumber: student.whatsappNumber || student.phoneNumber,
            message: messageContent,
            type: 'automated_fee_reminder',
            reminderType: reminderType
          };

          await this.queueService.scheduleMessage(jobData, delay);
          totalQueued++;

          // 5. Log that the reminder has been queued
          await this.logReminderQueued(organization.id, student.id, reminderType);
        }
      }

      logger.info(`[AutomatedFeeNotificationsService] Enqueue job completed: ${totalQueued} reminders queued for ${organizations.length} organizations`);
      return { success: true, totalOrganizations: organizations.length, totalQueued };

    } catch (error) {
      logger.error('[AutomatedFeeNotificationsService] Failed to enqueue reminders:', error);
      return { success: false, error: error.message, totalQueued: 0 };
    }
  }

  /**
   * Generates the reminder message content using the template service.
   */
  async generateReminderMessage(organizationId, student, config) {
    const today = new Date();
    const dueDate = new Date(student.dueDate);
    const daysDifference = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

    const template = await this.templateService.getTemplateByCategory(organizationId, 'fee_reminder');
    if (!template) {
      logger.error(`[AutomatedFeeNotificationsService] No fee reminder template found for organization: ${organizationId}`);
      return null;
    }

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

    // This is a simplified version of message generation.
    // A more robust implementation would use a templating engine.
    let message = template.content;
    for (const key in variables) {
      message = message.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
    }
    return message;
  }

  /**
   * Checks if a reminder has already been queued for this student/type today.
   */
  async checkIfQueuedToday(organizationId, studentId, reminderType) {
    try {
      const timezone = process.env.TZ || 'Asia/Karachi';
      const todayStr = moment.tz(timezone).format('YYYY-MM-DD');
      const logId = `${organizationId}_${studentId}_${reminderType}_${todayStr}`;

      const doc = await db.collection('dailyQueueLog').doc(logId).get();
      return doc.exists;
    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Error checking if queued today:`, error);
      return false; // Fail open to allow queueing
    }
  }

  /**
   * Logs that a reminder has been queued for today.
   */
  async logReminderQueued(organizationId, studentId, reminderType) {
    try {
      const timezone = process.env.TZ || 'Asia/Karachi';
      const todayStr = moment.tz(timezone).format('YYYY-MM-DD');
      const logId = `${organizationId}_${studentId}_${reminderType}_${todayStr}`;

      const logEntry = {
        organizationId,
        studentId,
        reminderType,
        queuedAt: new Date(),
      };

      await db.collection('dailyQueueLog').doc(logId).set(logEntry);
    } catch (error) {
      logger.error(`[AutomatedFeeNotificationsService] Error logging reminder queue status:`, error);
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
        sendWindowStart: reminderConfig.sendWindowStart || '09:00',
        sendWindowEnd: reminderConfig.sendWindowEnd || '17:00',
        minDelaySeconds: reminderConfig.minDelaySeconds || 5,
        maxDelaySeconds: reminderConfig.maxDelaySeconds || 15,
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
      sendWindowStart: '09:00',
      sendWindowEnd: '17:00',
      minDelaySeconds: 5,
      maxDelaySeconds: 15,
      organizationName: 'School',
      contactInfo: ''
    };
  }

}

module.exports = AutomatedFeeNotificationsService;
