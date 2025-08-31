/**
 * Automated Attendance Notifications Service
 * Handles automated attendance-based messaging (absent, sick leave, casual leave)
 */

const CoreMessagingService = require('./coreMessagingService');
const MessageTemplateService = require('./messageTemplateService');
const { db } = require('../config/firebase');
const logger = require('../utils/logger');

class AutomatedAttendanceNotificationsService {
  constructor() {
    this.messagingService = new CoreMessagingService();
    this.templateService = new MessageTemplateService();
    this.processedAttendance = new Map(); // attendanceId -> processed timestamp
    this.lastAttendanceCheck = new Map(); // organizationId -> last check timestamp
  }

  /**
   * Check and process attendance notifications for all organizations
   * Called by cron job every 15 minutes during school hours
   */
  async checkAndProcessAttendanceNotifications() {
    try {
      logger.info('[AutomatedAttendanceNotificationsService] Starting attendance notification check');

      // Get all organizations with attendance automation enabled
      const organizations = await this.getOrganizationsWithAttendanceAutomation();
      
      let totalNotifications = 0;
      let totalOrganizations = organizations.length;

      for (const organization of organizations) {
        try {
          const notificationCount = await this.processOrganizationAttendance(organization.id);
          totalNotifications += notificationCount;
          
          // Update last check timestamp
          this.lastAttendanceCheck.set(organization.id, Date.now());

        } catch (error) {
          logger.error(`[AutomatedAttendanceNotificationsService] Failed to process attendance for organization ${organization.id}:`, error);
        }
      }

      logger.info(`[AutomatedAttendanceNotificationsService] Attendance notification check completed: ${totalNotifications} notifications sent across ${totalOrganizations} organizations`);

      return {
        success: true,
        totalOrganizations,
        totalNotifications,
        processedAt: new Date()
      };

    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to check attendance notifications:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process attendance notifications for a specific organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} - Number of notifications sent
   */
  async processOrganizationAttendance(organizationId) {
    try {
      logger.info(`[AutomatedAttendanceNotificationsService] Processing attendance for organization: ${organizationId}`);

      // Get organization attendance notification configuration
      const attendanceConfig = await this.getAttendanceConfiguration(organizationId);
      if (!attendanceConfig.enabled) {
        logger.info(`[AutomatedAttendanceNotificationsService] Attendance notifications disabled for organization: ${organizationId}`);
        return 0;
      }

      // Check business hours
      if (!this.isWithinSchoolHours(attendanceConfig.schoolHours)) {
        logger.info(`[AutomatedAttendanceNotificationsService] Outside school hours for organization: ${organizationId}`);
        return 0;
      }

      // Get recent attendance records that need notifications
      const attendanceRecords = await this.getAttendanceRecordsForNotification(organizationId, attendanceConfig);
      
      if (attendanceRecords.length === 0) {
        logger.info(`[AutomatedAttendanceNotificationsService] No attendance records need notifications for organization: ${organizationId}`);
        return 0;
      }

      logger.info(`[AutomatedAttendanceNotificationsService] Found ${attendanceRecords.length} attendance records needing notifications for organization: ${organizationId}`);

      let sentCount = 0;

      // Send notifications with rate limiting
      for (const attendanceRecord of attendanceRecords) {
        try {
          const notificationSent = await this.sendAttendanceNotification(organizationId, attendanceRecord, attendanceConfig);
          if (notificationSent.success) {
            sentCount++;
            
            // Mark as processed
            this.markAttendanceAsProcessed(attendanceRecord.id);
          }

          // Add delay between messages to respect rate limits
          if (attendanceConfig.delayBetweenMessages > 0) {
            await this.delay(attendanceConfig.delayBetweenMessages);
          }

        } catch (error) {
          logger.error(`[AutomatedAttendanceNotificationsService] Failed to send notification for attendance record ${attendanceRecord.id}:`, error);
        }
      }

      logger.info(`[AutomatedAttendanceNotificationsService] Sent ${sentCount}/${attendanceRecords.length} attendance notifications for organization: ${organizationId}`);
      
      return sentCount;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to process attendance for organization ${organizationId}:`, error);
      return 0;
    }
  }

  /**
   * Send individual attendance notification
   * @param {string} organizationId - Organization ID
   * @param {Object} attendanceRecord - Attendance record
   * @param {Object} config - Attendance configuration
   * @returns {Promise<Object>} - Send result
   */
  async sendAttendanceNotification(organizationId, attendanceRecord, config) {
    try {
      const { studentId, attendanceStatus, date, className } = attendanceRecord;

      // Get student data
      const student = await this.getStudentData(organizationId, studentId);
      if (!student || !student.whatsappNumber) {
        logger.warn(`[AutomatedAttendanceNotificationsService] Student ${studentId} not found or no WhatsApp number`);
        return { success: false, error: 'Student not found or no WhatsApp number' };
      }

      // Check if this notification type is enabled
      const notificationType = this.getNotificationType(attendanceStatus);
      if (!config.notifications[notificationType]) {
        logger.info(`[AutomatedAttendanceNotificationsService] ${notificationType} notifications disabled for organization: ${organizationId}`);
        return { success: false, error: `${notificationType} notifications disabled` };
      }

      // Get appropriate template
      const templateCategory = this.getTemplateCategory(attendanceStatus);
      const template = await this.templateService.getTemplateByCategory(organizationId, templateCategory);
      
      if (!template) {
        logger.error(`[AutomatedAttendanceNotificationsService] No ${templateCategory} template found for organization: ${organizationId}`);
        return { success: false, error: `No ${templateCategory} template found` };
      }

      // Prepare template variables
      const variables = {
        studentName: student.name,
        parentName: student.parentName || student.name,
        className: className || student.className || student.class || 'N/A',
        date: this.formatDate(new Date(date)),
        attendanceStatus: this.formatAttendanceStatus(attendanceStatus),
        organizationName: config.organizationName || 'School',
        contactInfo: config.contactInfo || '',
        teacherName: attendanceRecord.teacherName || 'Teacher',
        time: this.formatTime(new Date(attendanceRecord.timestamp || date))
      };

      // Check if notification was already sent for this record
      const alreadySent = await this.checkNotificationAlreadySent(organizationId, attendanceRecord.id);
      if (alreadySent) {
        logger.info(`[AutomatedAttendanceNotificationsService] Notification already sent for attendance record ${attendanceRecord.id}`);
        return { success: false, error: 'Notification already sent' };
      }

      // Send message
      const messageData = {
        recipientId: studentId,
        phoneNumber: student.whatsappNumber,
        templateId: template.id,
        variables,
        type: 'automated_attendance_notification',
        priority: attendanceStatus === 'absent' ? 'high' : 'normal',
        metadata: {
          attendanceRecordId: attendanceRecord.id,
          attendanceStatus,
          date: date
        }
      };

      const result = await this.messagingService.sendMessage(organizationId, messageData);

      if (result.success) {
        // Log the notification
        await this.logAttendanceNotificationSent(organizationId, attendanceRecord, result.messageId);
        
        logger.info(`[AutomatedAttendanceNotificationsService] Attendance notification sent for student ${student.id} (${student.name}) - ${attendanceStatus}`);
      }

      return result;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to send attendance notification for record ${attendanceRecord.id}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process immediate attendance update (called from frontend)
   * @param {string} organizationId - Organization ID
   * @param {Object} attendanceUpdate - Attendance update data
   * @returns {Promise<Object>} - Process result
   */
  async processImmediateAttendanceUpdate(organizationId, attendanceUpdate) {
    try {
      logger.info(`[AutomatedAttendanceNotificationsService] Processing immediate attendance update for student ${attendanceUpdate.studentId}`);

      // Get configuration
      const config = await this.getAttendanceConfiguration(organizationId);
      if (!config.enabled || !config.immediateNotifications) {
        logger.info(`[AutomatedAttendanceNotificationsService] Immediate notifications disabled for organization: ${organizationId}`);
        return { success: false, error: 'Immediate notifications disabled' };
      }

      // Check if this type of notification should be sent immediately
      const notificationType = this.getNotificationType(attendanceUpdate.attendanceStatus);
      if (!config.notifications[notificationType] || !config.immediateTypes.includes(notificationType)) {
        logger.info(`[AutomatedAttendanceNotificationsService] Immediate ${notificationType} notifications not configured`);
        return { success: false, error: `Immediate ${notificationType} notifications not configured` };
      }

      // Create attendance record object
      const attendanceRecord = {
        id: attendanceUpdate.id || `attendance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        studentId: attendanceUpdate.studentId,
        attendanceStatus: attendanceUpdate.attendanceStatus,
        date: attendanceUpdate.date || new Date().toISOString().split('T')[0],
        className: attendanceUpdate.className,
        teacherName: attendanceUpdate.teacherName,
        timestamp: new Date()
      };

      // Send notification
      const result = await this.sendAttendanceNotification(organizationId, attendanceRecord, config);

      return result;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to process immediate attendance update:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organizations with attendance automation enabled
   * @returns {Promise<Array>} - Organizations
   */
  async getOrganizationsWithAttendanceAutomation() {
    try {
      const snapshot = await db.collection('organizations')
        .where('whatsappConfig.enabled', '==', true)
        .where('attendanceNotificationConfig.enabled', '==', true)
        .get();

      const organizations = [];
      snapshot.forEach(doc => {
        organizations.push({ id: doc.id, ...doc.data() });
      });

      return organizations;

    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to get organizations with attendance automation:', error);
      return [];
    }
  }

  /**
   * Get attendance configuration for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Attendance configuration
   */
  async getAttendanceConfiguration(organizationId) {
    try {
      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      
      if (!orgDoc.exists) {
        return this.getDefaultAttendanceConfig();
      }

      const orgData = orgDoc.data();
      const attendanceConfig = orgData.attendanceNotificationConfig || {};

      return {
        enabled: attendanceConfig.enabled !== false,
        immediateNotifications: attendanceConfig.immediateNotifications !== false,
        notifications: {
          absent: attendanceConfig.notifications?.absent !== false,
          sick_leave: attendanceConfig.notifications?.sick_leave !== false,
          casual_leave: attendanceConfig.notifications?.casual_leave !== false
        },
        immediateTypes: attendanceConfig.immediateTypes || ['absent'],
        schoolHours: attendanceConfig.schoolHours || { start: '08:00', end: '16:00' },
        delayBetweenMessages: attendanceConfig.delayBetweenMessages || 3000, // 3 seconds
        organizationName: orgData.name || 'School',
        contactInfo: orgData.contactInfo || ''
      };

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to get attendance config for organization ${organizationId}:`, error);
      return this.getDefaultAttendanceConfig();
    }
  }

  /**
   * Get attendance records that need notifications
   * @param {string} organizationId - Organization ID
   * @param {Object} config - Attendance configuration
   * @returns {Promise<Array>} - Attendance records
   */
  async getAttendanceRecordsForNotification(organizationId, config) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // Get today's attendance records
      const snapshot = await db.collection(`organizationData/${organizationId}/attendance`)
        .where('date', '>=', today.toISOString().split('T')[0])
        .where('date', '<=', endOfDay.toISOString().split('T')[0])
        .where('notificationSent', '!=', true)
        .get();

      const records = [];
      snapshot.forEach(doc => {
        const recordData = doc.data();
        
        // Check if this type of record should trigger notification
        const notificationType = this.getNotificationType(recordData.attendanceStatus);
        if (config.notifications[notificationType] && !this.isAttendanceProcessed(doc.id)) {
          records.push({ id: doc.id, ...recordData });
        }
      });

      return records;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to get attendance records:`, error);
      return [];
    }
  }

  /**
   * Check if notification was already sent for attendance record
   * @param {string} organizationId - Organization ID
   * @param {string} attendanceRecordId - Attendance record ID
   * @returns {Promise<boolean>} - True if already sent
   */
  async checkNotificationAlreadySent(organizationId, attendanceRecordId) {
    try {
      const snapshot = await db.collection('attendanceNotificationLogs')
        .where('organizationId', '==', organizationId)
        .where('attendanceRecordId', '==', attendanceRecordId)
        .limit(1)
        .get();

      return !snapshot.empty;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to check notification status:`, error);
      return false; // Allow sending on error
    }
  }

  /**
   * Log attendance notification sent
   * @param {string} organizationId - Organization ID
   * @param {Object} attendanceRecord - Attendance record
   * @param {string} messageId - Message ID
   */
  async logAttendanceNotificationSent(organizationId, attendanceRecord, messageId) {
    try {
      const logEntry = {
        organizationId,
        attendanceRecordId: attendanceRecord.id,
        studentId: attendanceRecord.studentId,
        attendanceStatus: attendanceRecord.attendanceStatus,
        messageId,
        date: attendanceRecord.date,
        sentAt: new Date(),
        id: `attendance_notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      await db.collection('attendanceNotificationLogs').doc(logEntry.id).set(logEntry);

      // Mark the attendance record as notification sent
      await db.collection(`organizationData/${organizationId}/attendance`)
        .doc(attendanceRecord.id)
        .update({ notificationSent: true, notificationSentAt: new Date() });

    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to log attendance notification:', error);
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
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to get student data for ${studentId}:`, error);
      return null;
    }
  }

  /**
   * Get notification type from attendance status
   * @param {string} attendanceStatus - Attendance status
   * @returns {string} - Notification type
   */
  getNotificationType(attendanceStatus) {
    const statusMap = {
      'absent': 'absent',
      'sick_leave': 'sick_leave',
      'casual_leave': 'casual_leave'
    };
    
    return statusMap[attendanceStatus] || 'absent';
  }

  /**
   * Get template category from attendance status
   * @param {string} attendanceStatus - Attendance status
   * @returns {string} - Template category
   */
  getTemplateCategory(attendanceStatus) {
    const categoryMap = {
      'absent': 'attendance_absent',
      'sick_leave': 'attendance_sick_leave',
      'casual_leave': 'attendance_casual_leave'
    };
    
    return categoryMap[attendanceStatus] || 'attendance_absent';
  }

  /**
   * Format attendance status for display
   * @param {string} status - Attendance status
   * @returns {string} - Formatted status
   */
  formatAttendanceStatus(status) {
    const statusMap = {
      'absent': 'Absent',
      'sick_leave': 'Sick Leave',
      'casual_leave': 'Casual Leave'
    };
    
    return statusMap[status] || status;
  }

  /**
   * Check if current time is within school hours
   * @param {Object} schoolHours - School hours configuration
   * @returns {boolean} - True if within school hours
   */
  isWithinSchoolHours(schoolHours) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = schoolHours.start.split(':').map(Number);
    const [endHour, endMinute] = schoolHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Mark attendance as processed
   * @param {string} attendanceId - Attendance ID
   */
  markAttendanceAsProcessed(attendanceId) {
    this.processedAttendance.set(attendanceId, Date.now());
    
    // Clean up old processed records (older than 24 hours)
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, timestamp] of this.processedAttendance.entries()) {
      if (timestamp < twentyFourHoursAgo) {
        this.processedAttendance.delete(id);
      }
    }
  }

  /**
   * Check if attendance is already processed
   * @param {string} attendanceId - Attendance ID
   * @returns {boolean} - True if processed
   */
  isAttendanceProcessed(attendanceId) {
    return this.processedAttendance.has(attendanceId);
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
   * Format time for display
   * @param {Date} date - Date to format
   * @returns {string} - Formatted time
   */
  formatTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Get default attendance configuration
   * @returns {Object} - Default configuration
   */
  getDefaultAttendanceConfig() {
    return {
      enabled: true,
      immediateNotifications: true,
      notifications: {
        absent: true,
        sick_leave: true,
        casual_leave: true
      },
      immediateTypes: ['absent'],
      schoolHours: { start: '08:00', end: '16:00' },
      delayBetweenMessages: 3000,
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

module.exports = AutomatedAttendanceNotificationsService;
