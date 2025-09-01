/**
 * Automated Attendance Notifications Service
 * Handles automated attendance reports, daily summaries, weekly and monthly reports
 */

const CoreMessagingService = require('./coreMessagingService');
const MessageTemplateService = require('./messageTemplateService');
const HumanBehaviorService = require('./humanBehaviorService');
const EnhancedMessageQueueService = require('./enhancedMessageQueueService');
const { db } = require('../config/firebase');
const logger = require('../utils/logger');

class AutomatedAttendanceNotificationsService {
  constructor() {
    this.messagingService = new CoreMessagingService();
    this.templateService = new MessageTemplateService();
    this.humanBehavior = new HumanBehaviorService();
    this.messageQueue = new EnhancedMessageQueueService();
    this.attendanceSchedules = new Map(); // organizationId -> attendance notification schedule
    this.lastNotificationCheck = new Map(); // organizationId -> last check timestamp
  }

  /**
   * Check and send daily attendance notifications for all organizations
   * Called by cron job every 15 minutes during school hours
   */
  async checkAndSendDailyAttendanceNotifications() {
    try {
      logger.info('[AutomatedAttendanceNotificationsService] Starting daily attendance notification check');

      // Get all organizations with attendance notifications enabled
      const organizations = await this.getOrganizationsWithAttendanceNotifications();
      
      let totalNotifications = 0;
      let totalOrganizations = organizations.length;

      for (const organization of organizations) {
        try {
          const notificationCount = await this.processDailyAttendanceNotifications(organization.id);
          totalNotifications += notificationCount;
          
          // Update last check timestamp
          this.lastNotificationCheck.set(organization.id, Date.now());

        } catch (error) {
          logger.error(`[AutomatedAttendanceNotificationsService] Failed to process daily attendance for organization ${organization.id}:`, error);
        }
      }

      logger.info(`[AutomatedAttendanceNotificationsService] Daily attendance check completed: ${totalNotifications} notifications sent across ${totalOrganizations} organizations`);

      return {
        success: true,
        totalOrganizations,
        totalNotifications,
        processedAt: new Date()
      };

    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to check daily attendance notifications:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate and send weekly attendance reports
   * Called by cron job every Sunday at 8 PM
   */
  async generateWeeklyAttendanceReports() {
    try {
      logger.info('[AutomatedAttendanceNotificationsService] Starting weekly attendance report generation');

      const organizations = await this.getOrganizationsWithWeeklyReports();
      let totalReports = 0;

      for (const organization of organizations) {
        try {
          const reportCount = await this.processWeeklyAttendanceReport(organization.id);
          totalReports += reportCount;
        } catch (error) {
          logger.error(`[AutomatedAttendanceNotificationsService] Failed to generate weekly report for organization ${organization.id}:`, error);
        }
      }

      logger.info(`[AutomatedAttendanceNotificationsService] Weekly reports completed: ${totalReports} reports sent`);

      return {
        success: true,
        totalReports,
        reportType: 'weekly',
        processedAt: new Date()
      };

    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to generate weekly reports:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate and send monthly attendance reports
   * Called by cron job on the last day of each month at 7 PM
   */
  async generateMonthlyAttendanceReports() {
    try {
      logger.info('[AutomatedAttendanceNotificationsService] Starting monthly attendance report generation');

      const organizations = await this.getOrganizationsWithMonthlyReports();
      let totalReports = 0;

      for (const organization of organizations) {
        try {
          const reportCount = await this.processMonthlyAttendanceReport(organization.id);
          totalReports += reportCount;
        } catch (error) {
          logger.error(`[AutomatedAttendanceNotificationsService] Failed to generate monthly report for organization ${organization.id}:`, error);
        }
      }

      logger.info(`[AutomatedAttendanceNotificationsService] Monthly reports completed: ${totalReports} reports sent`);

      return {
        success: true,
        totalReports,
        reportType: 'monthly',
        processedAt: new Date()
      };

    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to generate monthly reports:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process daily attendance notifications for a specific organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} - Number of notifications sent
   */
  async processDailyAttendanceNotifications(organizationId) {
    try {
      logger.info(`[AutomatedAttendanceNotificationsService] Processing daily attendance for organization: ${organizationId}`);

      // Get organization attendance notification configuration
      const attendanceConfig = await this.getAttendanceConfiguration(organizationId);
      if (!attendanceConfig.enabled || !attendanceConfig.dailyNotifications) {
        logger.info(`[AutomatedAttendanceNotificationsService] Daily notifications disabled for organization: ${organizationId}`);
        return 0;
      }

      // Check business hours with timezone awareness (more conservative for attendance)
      if (!this.isWithinSchoolHours(attendanceConfig)) {
        logger.info(`[AutomatedAttendanceNotificationsService] Outside school hours for organization: ${organizationId}`);
        return 0;
      }

      // Get students with attendance requiring notifications
      const studentsToNotify = await this.getStudentsForAttendanceNotifications(organizationId, attendanceConfig);
      
      if (studentsToNotify.length === 0) {
        logger.info(`[AutomatedAttendanceNotificationsService] No students need attendance notifications for organization: ${organizationId}`);
        return 0;
      }

      logger.info(`[AutomatedAttendanceNotificationsService] Found ${studentsToNotify.length} students needing attendance notifications for organization: ${organizationId}`);

      // Use conservative behavior for school communications
      const behaviorConfig = {
        pattern: 'conservative', // Always conservative for attendance
        typingSpeed: 'normal',
        enableTypingIndicator: true,
        enableJitter: true,
        timezone: attendanceConfig.timezone || 'Asia/Karachi',
        businessHours: {
          startTime: attendanceConfig.schoolStartTime || '08:00',
          endTime: attendanceConfig.schoolEndTime || '16:00',
          daysOfWeek: attendanceConfig.schoolDays || [1, 2, 3, 4, 5] // Monday to Friday
        },
        batchSize: 5, // Smaller batches for attendance
        burstPrevention: {
          enabled: true,
          maxMessagesPerMinute: 8, // Very conservative
          cooldownMinutes: 10
        },
        dailyLimits: {
          enabled: true,
          maxMessagesPerDay: 50 // Conservative daily limit
        }
      };

      // Prepare messages for queue
      const messages = studentsToNotify.map(student => ({
        phoneNumber: student.phoneNumber,
        content: this.formatAttendanceMessage(student, attendanceConfig),
        templateId: attendanceConfig.templateId,
        recipientId: student.id,
        type: 'attendance_notification',
        priority: this.determineAttendancePriority(student),
        variables: {
          studentName: student.name,
          attendanceStatus: student.attendanceStatus,
          date: student.attendanceDate,
          className: student.className,
          schoolName: attendanceConfig.schoolName || 'Your School'
        }
      }));

      // Add to enhanced queue with human behavior
      const queueResult = await this.messageQueue.addBulkToQueue(organizationId, messages, behaviorConfig);
      
      if (queueResult.success) {
        logger.info(`[AutomatedAttendanceNotificationsService] ${queueResult.successCount}/${studentsToNotify.length} attendance notifications queued successfully for organization: ${organizationId}`);
        logger.info(`[AutomatedAttendanceNotificationsService] Estimated total processing time: ${Math.round(queueResult.estimatedTotalDelay / 1000)}s across ${queueResult.batches} batches`);
      } else {
        logger.error(`[AutomatedAttendanceNotificationsService] Failed to queue attendance notifications: ${queueResult.error}`);
      }

      return queueResult.successCount || 0;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to process daily attendance for organization ${organizationId}:`, error);
      return 0;
    }
  }

  /**
   * Process weekly attendance report for a specific organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} - Number of reports sent
   */
  async processWeeklyAttendanceReport(organizationId) {
    try {
      logger.info(`[AutomatedAttendanceNotificationsService] Processing weekly attendance report for organization: ${organizationId}`);

      const attendanceConfig = await this.getAttendanceConfiguration(organizationId);
      if (!attendanceConfig.enabled || !attendanceConfig.weeklyReports) {
        return 0;
      }

      // Get attendance data for the past week
      const weeklyData = await this.getWeeklyAttendanceData(organizationId);
      if (!weeklyData || weeklyData.length === 0) {
        logger.info(`[AutomatedAttendanceNotificationsService] No weekly attendance data for organization: ${organizationId}`);
        return 0;
      }

      // Group data by parent/guardian
      const reportsByParent = this.groupAttendanceByParent(weeklyData);

      // Use very conservative behavior for weekly reports
      const behaviorConfig = {
        pattern: 'conservative',
        typingSpeed: 'slow', // Slower for longer reports
        enableTypingIndicator: true,
        enableJitter: true,
        timezone: attendanceConfig.timezone || 'Asia/Karachi',
        businessHours: {
          startTime: '18:00', // Evening time for reports
          endTime: '20:00',
          daysOfWeek: [0, 6, 7] // Weekends for reports
        },
        batchSize: 3, // Very small batches for reports
        burstPrevention: {
          enabled: true,
          maxMessagesPerMinute: 5,
          cooldownMinutes: 15
        }
      };

      // Prepare weekly report messages
      const messages = Object.entries(reportsByParent).map(([phoneNumber, studentData]) => ({
        phoneNumber,
        content: this.formatWeeklyReport(studentData, attendanceConfig),
        templateId: attendanceConfig.weeklyReportTemplateId,
        recipientId: studentData.parentId,
        type: 'weekly_attendance_report',
        priority: 'low',
        variables: {
          weekRange: this.getWeekRange(),
          studentsData: studentData,
          schoolName: attendanceConfig.schoolName || 'Your School'
        }
      }));

      // Add to enhanced queue
      const queueResult = await this.messageQueue.addBulkToQueue(organizationId, messages, behaviorConfig);
      
      logger.info(`[AutomatedAttendanceNotificationsService] Weekly report queuing completed: ${queueResult.successCount}/${messages.length} reports queued`);

      return queueResult.successCount || 0;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to process weekly report for organization ${organizationId}:`, error);
      return 0;
    }
  }

  /**
   * Process monthly attendance report for a specific organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} - Number of reports sent
   */
  async processMonthlyAttendanceReport(organizationId) {
    try {
      logger.info(`[AutomatedAttendanceNotificationsService] Processing monthly attendance report for organization: ${organizationId}`);

      const attendanceConfig = await this.getAttendanceConfiguration(organizationId);
      if (!attendanceConfig.enabled || !attendanceConfig.monthlyReports) {
        return 0;
      }

      // Get attendance data for the past month
      const monthlyData = await this.getMonthlyAttendanceData(organizationId);
      if (!monthlyData || monthlyData.length === 0) {
        logger.info(`[AutomatedAttendanceNotificationsService] No monthly attendance data for organization: ${organizationId}`);
        return 0;
      }

      // Group data by parent/guardian
      const reportsByParent = this.groupAttendanceByParent(monthlyData);

      // Ultra-conservative behavior for monthly reports
      const behaviorConfig = {
        pattern: 'conservative',
        typingSpeed: 'slow',
        enableTypingIndicator: true,
        enableJitter: true,
        timezone: attendanceConfig.timezone || 'Asia/Karachi',
        businessHours: {
          startTime: '19:00', // Evening time for monthly reports
          endTime: '21:00',
          daysOfWeek: [0, 6] // Weekends only
        },
        batchSize: 2, // Very small batches
        burstPrevention: {
          enabled: true,
          maxMessagesPerMinute: 3,
          cooldownMinutes: 20
        }
      };

      // Prepare monthly report messages
      const messages = Object.entries(reportsByParent).map(([phoneNumber, studentData]) => ({
        phoneNumber,
        content: this.formatMonthlyReport(studentData, attendanceConfig),
        templateId: attendanceConfig.monthlyReportTemplateId,
        recipientId: studentData.parentId,
        type: 'monthly_attendance_report',
        priority: 'low',
        variables: {
          monthName: this.getCurrentMonthName(),
          studentsData: studentData,
          schoolName: attendanceConfig.schoolName || 'Your School',
          attendanceStatistics: this.calculateAttendanceStatistics(studentData)
        }
      }));

      // Add to enhanced queue
      const queueResult = await this.messageQueue.addBulkToQueue(organizationId, messages, behaviorConfig);
      
      logger.info(`[AutomatedAttendanceNotificationsService] Monthly report queuing completed: ${queueResult.successCount}/${messages.length} reports queued`);

      return queueResult.successCount || 0;

    } catch (error) {
      logger.error(`[AutomatedAttendanceNotificationsService] Failed to process monthly report for organization ${organizationId}:`, error);
      return 0;
    }
  }

  // Helper methods for attendance functionality
  
  async getOrganizationsWithAttendanceNotifications() {
    try {
      const snapshot = await db.collection('organizations')
        .where('whatsapp.enabled', '==', true)
        .where('whatsapp.attendanceNotifications.enabled', '==', true)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to get organizations with attendance notifications:', error);
      return [];
    }
  }

  async getOrganizationsWithWeeklyReports() {
    try {
      const snapshot = await db.collection('organizations')
        .where('whatsapp.attendanceNotifications.weeklyReports', '==', true)
        .get();

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to get organizations with weekly reports:', error);
      return [];
    }
  }

  async getOrganizationsWithMonthlyReports() {
    try {
      const snapshot = await db.collection('organizations')
        .where('whatsapp.attendanceNotifications.monthlyReports', '==', true)
        .get();

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      logger.error('[AutomatedAttendanceNotificationsService] Failed to get organizations with monthly reports:', error);
      return [];
    }
  }

  isWithinSchoolHours(config) {
    // More conservative school hours check
    const now = new Date();
    const timezone = config.timezone || 'Asia/Karachi';
    
    // Convert to school timezone
    const schoolTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    
    const currentHour = schoolTime.getHours();
    const currentMinute = schoolTime.getMinutes();
    const currentDay = schoolTime.getDay();
    
    // Check if it's a school day
    const schoolDays = config.schoolDays || [1, 2, 3, 4, 5]; // Monday to Friday
    if (!schoolDays.includes(currentDay)) {
      return false;
    }
    
    // Check if within school hours (more restrictive)
    const startTime = config.schoolStartTime || '08:00';
    const endTime = config.schoolEndTime || '16:00';
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    const startTimeMinutes = startHour * 60 + startMin;
    const endTimeMinutes = endHour * 60 + endMin;
    
    return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
  }

  formatAttendanceMessage(student, config) {
    const templates = {
      absent: `Dear Parent, ${student.name} was absent from school today (${student.attendanceDate}). Please ensure regular attendance. - ${config.schoolName}`,
      late: `Dear Parent, ${student.name} arrived late to school today (${student.attendanceDate}). School starts at ${config.schoolStartTime}. - ${config.schoolName}`,
      present: `Dear Parent, ${student.name} attended school today (${student.attendanceDate}). Thank you for ensuring regular attendance. - ${config.schoolName}`
    };

    return templates[student.attendanceStatus] || templates.absent;
  }

  formatWeeklyReport(studentData, config) {
    const weekRange = this.getWeekRange();
    let report = `Weekly Attendance Report (${weekRange})\n\n`;
    
    studentData.students.forEach(student => {
      const attendance = student.weeklyAttendance;
      report += `${student.name}: ${attendance.present}/${attendance.total} days present (${Math.round((attendance.present/attendance.total)*100)}%)\n`;
    });
    
    report += `\n- ${config.schoolName}`;
    return report;
  }

  formatMonthlyReport(studentData, config) {
    const monthName = this.getCurrentMonthName();
    let report = `Monthly Attendance Report - ${monthName}\n\n`;
    
    studentData.students.forEach(student => {
      const attendance = student.monthlyAttendance;
      const percentage = Math.round((attendance.present/attendance.total)*100);
      report += `${student.name}:\n`;
      report += `• Present: ${attendance.present} days\n`;
      report += `• Absent: ${attendance.absent} days\n`;
      report += `• Percentage: ${percentage}%\n\n`;
    });
    
    report += `Thank you for your cooperation.\n- ${config.schoolName}`;
    return report;
  }

  getWeekRange() {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(startOfWeek.getDate() + 6));
    
    return `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
  }

  getCurrentMonthName() {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // Additional helper methods would be implemented here...
  async getAttendanceConfiguration(organizationId) {
    // Implementation for getting attendance configuration
    return {
      enabled: true,
      dailyNotifications: true,
      weeklyReports: true,
      monthlyReports: true,
      timezone: 'Asia/Karachi',
      schoolStartTime: '08:00',
      schoolEndTime: '16:00',
      schoolDays: [1, 2, 3, 4, 5],
      schoolName: 'Demo School'
    };
  }

  async getStudentsForAttendanceNotifications(organizationId, config) {
    // Implementation for getting students needing notifications
    return [];
  }

  async getWeeklyAttendanceData(organizationId) {
    // Implementation for getting weekly data
    return [];
  }

  async getMonthlyAttendanceData(organizationId) {
    // Implementation for getting monthly data
    return [];
  }

  groupAttendanceByParent(attendanceData) {
    // Implementation for grouping by parent
    return {};
  }

  determineAttendancePriority(student) {
    // Conservative priority for attendance
    return student.attendanceStatus === 'absent' ? 'normal' : 'low';
  }

  calculateAttendanceStatistics(studentData) {
    // Implementation for calculating statistics
    return {};
  }
}

module.exports = AutomatedAttendanceNotificationsService;