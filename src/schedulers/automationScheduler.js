const cron = require('node-cron');
const AutomationService = require('../services/automationService');
const AutomatedFeeNotificationsService = require('../services/automatedFeeNotificationsService');
const AutomatedAttendanceNotificationsService = require('../services/automatedAttendanceNotificationsService');
const WhatsAppService = require('../services/whatsappService');

class AutomationScheduler {
  constructor() {
    this.automationService = new AutomationService();
    this.feeNotificationsService = new AutomatedFeeNotificationsService();
    this.attendanceNotificationsService = new AutomatedAttendanceNotificationsService();
    this.whatsappService = new WhatsAppService();
    this.schedulerRunning = false;
    this.cronJobs = [];
  }

  /**
   * Start the automation scheduler
   */
  async start() {
    if (this.schedulerRunning) {
      console.log('⚠️ Automation scheduler is already running');
      return;
    }

    console.log('🚀 Starting automation scheduler...');

    try {
      // Start the automation service first
      await this.automationService.start();

      // Schedule legacy automation rule checks every minute
      this.scheduleAutomationChecks();

      // Schedule Phase 6 automation services
      this.scheduleFeeReminders();
      this.scheduleAttendanceNotifications();

      // Schedule health checks every 5 minutes
      this.scheduleHealthChecks();

      // Schedule cleanup tasks daily at 2 AM
      this.scheduleCleanupTasks();

      this.schedulerRunning = true;
      console.log('✅ Automation scheduler started successfully with Phase 6 services');

    } catch (error) {
      console.error('❌ Failed to start automation scheduler:', error.message);
      throw error;
    }
  }

  /**
   * Stop the automation scheduler
   */
  async stop() {
    if (!this.schedulerRunning) {
      console.log('⚠️ Automation scheduler is not running');
      return;
    }

    console.log('🛑 Stopping automation scheduler...');

    try {
      // Stop all cron jobs
      this.cronJobs.forEach(job => {
        if (job && job.stop) {
          job.stop();
        }
      });
      this.cronJobs = [];

      // Stop the automation service
      await this.automationService.stop();

      this.schedulerRunning = false;
      console.log('✅ Automation scheduler stopped successfully');

    } catch (error) {
      console.error('❌ Error stopping automation scheduler:', error.message);
    }
  }

  /**
   * Schedule automation rule checks (legacy)
   */
  scheduleAutomationChecks() {
    console.log('⏰ Scheduling legacy automation rule checks (every minute)...');

    const job = cron.schedule('* * * * *', async () => {
      try {
        await this.automationService.checkAndExecuteRules();
      } catch (error) {
        console.error('❌ Legacy automation check failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Asia/Karachi'
    });

    this.cronJobs.push(job);
    console.log('✅ Legacy automation rule checks scheduled');
  }

  /**
   * Schedule fee reminder checks
   */
  scheduleFeeReminders() {
    console.log('💰 Scheduling fee reminder checks (every hour at minute 5)...');

    const job = cron.schedule('5 * * * *', async () => {
      try {
        console.log('🔔 Running automated fee reminder check...');
        const result = await this.feeNotificationsService.checkAndSendDueDateReminders();
        console.log(`📊 Fee reminders completed: ${result.totalReminders} reminders sent to ${result.totalOrganizations} organizations`);
      } catch (error) {
        console.error('❌ Fee reminder check failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Asia/Karachi'
    });

    this.cronJobs.push(job);
    console.log('✅ Fee reminder checks scheduled');
  }

  /**
   * Schedule attendance notification checks
   */
  scheduleAttendanceNotifications() {
    console.log('📚 Scheduling attendance notification checks (every 15 minutes during school hours)...');

    const job = cron.schedule('*/15 * * * *', async () => {
      try {
        // Only run during typical school hours (8 AM to 6 PM)
        const now = new Date();
        const hour = now.getHours();
        
        if (hour >= 8 && hour <= 18) {
          console.log('🎓 Running automated attendance notification check...');
          const result = await this.attendanceNotificationsService.checkAndProcessAttendanceNotifications();
          console.log(`📊 Attendance notifications completed: ${result.totalNotifications} notifications sent to ${result.totalOrganizations} organizations`);
        } else {
          console.log('🌙 Outside school hours, skipping attendance notifications');
        }
      } catch (error) {
        console.error('❌ Attendance notification check failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Asia/Karachi'
    });

    this.cronJobs.push(job);
    console.log('✅ Attendance notification checks scheduled');
  }

  /**
   * Schedule health checks
   */
  scheduleHealthChecks() {
    console.log('🏥 Scheduling health checks (every 5 minutes)...');

    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('❌ Health check failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Asia/Karachi'
    });

    this.cronJobs.push(job);
    console.log('✅ Health checks scheduled');
  }

  /**
   * Schedule cleanup tasks
   */
  scheduleCleanupTasks() {
    console.log('🧹 Scheduling cleanup tasks (daily at 2 AM)...');

    const job = cron.schedule('0 2 * * *', async () => {
      try {
        await this.performCleanupTasks();
      } catch (error) {
        console.error('❌ Cleanup tasks failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Asia/Karachi'
    });

    this.cronJobs.push(job);
    console.log('✅ Cleanup tasks scheduled');
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      console.log('🏥 Performing comprehensive health check...');

      const status = await this.automationService.getStatus();
      const whatsappHealth = await this.whatsappService.healthCheck();
      
      // Log health status
      console.log('📊 Health Check Results:');
      console.log(`  - Legacy Automation Service: ${status.running ? '✅ Running' : '❌ Stopped'}`);
      console.log(`  - WhatsApp Service: ${whatsappHealth.status === 'healthy' ? '✅ Healthy' : whatsappHealth.status === 'degraded' ? '⚠️ Degraded' : '❌ Unhealthy'}`);
      console.log(`  - WPPConnect: ${status.wppconnect?.connected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`  - Firebase: ${status.firebase?.connected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`  - Redis Queue: ${status.queue?.connected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`  - Rate Limiting: ${status.rateLimit?.connected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`  - Active WhatsApp Sessions: ${whatsappHealth.activeSessions || 0}`);

      // Phase 6 services health
      console.log('📊 Phase 6 Services Status:');
      console.log(`  - Fee Notifications Service: ✅ Loaded`);
      console.log(`  - Attendance Notifications Service: ✅ Loaded`);

      // Check for critical issues
      if (!status.running) {
        console.warn('⚠️ Legacy automation service is not running - attempting restart...');
        await this.restartAutomationService();
      }

      if (whatsappHealth.status === 'unhealthy') {
        console.warn('⚠️ WhatsApp service is unhealthy:', whatsappHealth.error);
      }

      if (!status.wppconnect?.connected) {
        console.warn('⚠️ WPPConnect is not connected - this may affect message delivery');
      }

      if (!status.firebase?.connected) {
        console.warn('⚠️ Firebase is not connected - this may affect data operations');
      }

      console.log('✅ Health check completed');

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
  }

  /**
   * Perform cleanup tasks
   */
  async performCleanupTasks() {
    try {
      console.log('🧹 Performing cleanup tasks...');

      // Get automation service status
      const status = await this.automationService.getStatus();

      // Log cleanup summary
      console.log('📊 Cleanup Summary:');
      if (status.queue?.stats) {
        console.log(`  - Queue Stats: ${JSON.stringify(status.queue.stats)}`);
      }
      if (status.rateLimit?.stats) {
        console.log(`  - Rate Limit Stats: ${JSON.stringify(status.rateLimit.stats)}`);
      }

      // You can add more cleanup tasks here:
      // - Clear old logs
      // - Archive old message logs
      // - Reset counters if needed
      // - Backup data

      console.log('✅ Cleanup tasks completed');

    } catch (error) {
      console.error('❌ Cleanup tasks failed:', error.message);
    }
  }

  /**
   * Restart automation service
   */
  async restartAutomationService() {
    try {
      console.log('🔄 Restarting automation service...');
      
      await this.automationService.stop();
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      await this.automationService.start();
      
      console.log('✅ Automation service restarted successfully');
      
    } catch (error) {
      console.error('❌ Failed to restart automation service:', error.message);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      scheduler: 'automation-scheduler',
      running: this.schedulerRunning,
      cronJobs: this.cronJobs.length,
      timezone: process.env.TZ || 'Asia/Karachi',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Manually trigger automation check (legacy)
   */
  async triggerManualCheck() {
    try {
      console.log('🔧 Manually triggering legacy automation check...');
      await this.automationService.checkAndExecuteRules();
      console.log('✅ Manual legacy automation check completed');
    } catch (error) {
      console.error('❌ Manual legacy automation check failed:', error.message);
      throw error;
    }
  }

  /**
   * Manually trigger fee reminders check
   */
  async triggerFeeRemindersCheck() {
    try {
      console.log('💰 Manually triggering fee reminders check...');
      const result = await this.feeNotificationsService.checkAndSendDueDateReminders();
      console.log(`📊 Fee reminders completed: ${result.totalReminders} reminders sent to ${result.totalOrganizations} organizations`);
      return result;
    } catch (error) {
      console.error('❌ Manual fee reminders check failed:', error.message);
      throw error;
    }
  }

  /**
   * Manually trigger attendance notifications check
   */
  async triggerAttendanceNotificationsCheck() {
    try {
      console.log('🎓 Manually triggering attendance notifications check...');
      const result = await this.attendanceNotificationsService.checkAndProcessAttendanceNotifications();
      console.log(`📊 Attendance notifications completed: ${result.totalNotifications} notifications sent to ${result.totalOrganizations} organizations`);
      return result;
    } catch (error) {
      console.error('❌ Manual attendance notifications check failed:', error.message);
      throw error;
    }
  }

  /**
   * Process immediate attendance update
   */
  async processImmediateAttendanceUpdate(organizationId, attendanceUpdate) {
    try {
      console.log(`📝 Processing immediate attendance update for organization ${organizationId}, student ${attendanceUpdate.studentId}`);
      const result = await this.attendanceNotificationsService.processImmediateAttendanceUpdate(organizationId, attendanceUpdate);
      console.log(`📊 Immediate attendance notification result: ${result.success ? 'Success' : 'Failed'}`);
      return result;
    } catch (error) {
      console.error('❌ Failed to process immediate attendance update:', error.message);
      throw error;
    }
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(organizationId, paymentData) {
    try {
      console.log(`💳 Sending payment confirmation for organization ${organizationId}, student ${paymentData.studentId}`);
      const result = await this.feeNotificationsService.sendPaymentConfirmation(organizationId, paymentData);
      console.log(`📊 Payment confirmation result: ${result.success ? 'Success' : 'Failed'}`);
      return result;
    } catch (error) {
      console.error('❌ Failed to send payment confirmation:', error.message);
      throw error;
    }
  }

  /**
   * Get all scheduled jobs
   */
  getScheduledJobs() {
    return this.cronJobs.map((job, index) => ({
      id: index,
      running: job.running || false,
      nextDate: job.nextDate ? job.nextDate() : null
    }));
  }
}

module.exports = AutomationScheduler;
