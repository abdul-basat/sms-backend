#!/usr/bin/env node

/**
 * Fees Manager WhatsApp Automation Scheduler
 * Main application entry point
 */

require('dotenv').config();
const AutomationScheduler = require('./schedulers/automationScheduler');
const logger = require('./utils/logger');

class FeesManagerAutomation {
  constructor() {
    this.scheduler = new AutomationScheduler();
    this.isRunning = false;
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      logger.info('🚀 Initializing Fees Manager WhatsApp Automation...');
      
      // Log startup information
      this.logStartupInfo();
      
      // Validate environment
      await this.validateEnvironment();
      
      logger.info('✅ Application initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize application:', error.message);
      throw error;
    }
  }

  /**
   * Start the application
   */
  async start() {
    if (this.isRunning) {
      logger.warn('⚠️ Application is already running');
      return;
    }

    try {
      logger.info('🚀 Starting Fees Manager WhatsApp Automation...');
      
      // Initialize first
      await this.initialize();
      
      // Start the scheduler
      await this.scheduler.start();
      
      this.isRunning = true;
      logger.info('✅ Application started successfully');
      
      // Set up graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('❌ Failed to start application:', error.message);
      process.exit(1);
    }
  }

  /**
   * Stop the application
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('⚠️ Application is not running');
      return;
    }

    try {
      logger.info('🛑 Stopping Fees Manager WhatsApp Automation...');
      
      // Stop the scheduler
      await this.scheduler.stop();
      
      this.isRunning = false;
      logger.info('✅ Application stopped successfully');
      
    } catch (error) {
      logger.error('❌ Error stopping application:', error.message);
    }
  }

  /**
   * Log startup information
   */
  logStartupInfo() {
    logger.info('📋 Startup Information:');
    logger.info(`  - Node.js Version: ${process.version}`);
    logger.info(`  - Platform: ${process.platform}`);
    logger.info(`  - Architecture: ${process.arch}`);
    logger.info(`  - PID: ${process.pid}`);
    logger.info(`  - Working Directory: ${process.cwd()}`);
    logger.info(`  - Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`  - Timezone: ${process.env.TZ || 'UTC'}`);
    
    // Log configuration summaries
    this.logConfigurationSummaries();
  }

  /**
   * Log configuration summaries
   */
  logConfigurationSummaries() {
    try {
      const wppconnectConfig = require('./config/wppconnect');
      const firebaseConfig = require('./config/firebase');
      const redisConfig = require('./config/redis');

      logger.info('⚙️ Configuration Summaries:');
      
      // WPPConnect config
      const wppSummary = wppconnectConfig.getSummary();
      logger.info(`  - WPPConnect Server: ${wppSummary.serverUrl}`);
      logger.info(`  - WPPConnect Session: ${wppSummary.sessionId}`);
      
      // Firebase config
      const firebaseSummary = firebaseConfig.getSummary();
      logger.info(`  - Firebase Project: ${firebaseSummary.projectId}`);
      logger.info(`  - Firebase Collections: ${Object.keys(firebaseSummary.collections).length}`);
      
      // Redis config
      const redisSummary = redisConfig.getSummary();
      logger.info(`  - Redis Server: ${redisSummary.url}`);
      logger.info(`  - Redis Queue: ${redisSummary.queue.name}`);
      
    } catch (error) {
      logger.warn('⚠️ Could not log configuration summaries:', error.message);
    }
  }

  /**
   * Validate environment configuration
   */
  async validateEnvironment() {
    logger.info('🔍 Validating environment configuration...');
    
    const errors = [];
    
    try {
      // Validate WPPConnect configuration
      const wppconnectConfig = require('./config/wppconnect');
      const wppValidation = wppconnectConfig.validate();
      if (!wppValidation.valid) {
        errors.push(`WPPConnect: ${wppValidation.errors.join(', ')}`);
      }
      
      // Validate Firebase configuration
      const firebaseConfig = require('./config/firebase');
      const firebaseValidation = firebaseConfig.validate();
      if (!firebaseValidation.valid) {
        errors.push(`Firebase: ${firebaseValidation.errors.join(', ')}`);
      }
      
      // Validate Redis configuration
      const redisConfig = require('./config/redis');
      const redisValidation = redisConfig.validate();
      if (!redisValidation.valid) {
        errors.push(`Redis: ${redisValidation.errors.join(', ')}`);
      }
      
    } catch (error) {
      errors.push(`Configuration loading: ${error.message}`);
    }
    
    if (errors.length > 0) {
      const errorMessage = `Environment validation failed:\n${errors.map(err => `  - ${err}`).join('\n')}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
    
    logger.info('✅ Environment validation passed');
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`📡 Received ${signal}, initiating graceful shutdown...`);
      
      try {
        await this.stop();
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during graceful shutdown:', error.message);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });

    logger.info('🛡️ Graceful shutdown handlers configured');
  }

  /**
   * Get application status
   */
  getStatus() {
    return {
      application: 'fees-manager-automation',
      version: '1.0.0',
      running: this.isRunning,
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      scheduler: this.scheduler.getStatus(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health check endpoint
   */
  async healthCheck() {
    try {
      const status = this.getStatus();
      const schedulerStatus = await this.scheduler.automationService.getStatus();
      
      return {
        status: 'healthy',
        application: status,
        services: schedulerStatus,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create application instance
const app = new FeesManagerAutomation();

// Handle command line arguments
const command = process.argv[2];

switch (command) {
  case 'start':
    app.start().catch(error => {
      logger.error('❌ Failed to start application:', error.message);
      process.exit(1);
    });
    break;
    
  case 'stop':
    app.stop().then(() => {
      logger.info('✅ Application stopped');
      process.exit(0);
    }).catch(error => {
      logger.error('❌ Failed to stop application:', error.message);
      process.exit(1);
    });
    break;
    
  case 'status':
    console.log(JSON.stringify(app.getStatus(), null, 2));
    process.exit(0);
    break;
    
  case 'health':
    app.healthCheck().then(health => {
      console.log(JSON.stringify(health, null, 2));
      process.exit(health.status === 'healthy' ? 0 : 1);
    }).catch(error => {
      console.log(JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
      process.exit(1);
    });
    break;
    
  case 'test':
    logger.info('🧪 Running in test mode...');
    app.start().then(() => {
      logger.info('✅ Test completed successfully');
      return app.stop();
    }).then(() => {
      logger.info('✅ Test cleanup completed');
      process.exit(0);
    }).catch(error => {
      logger.error('❌ Test failed:', error.message);
      process.exit(1);
    });
    break;
    
  default:
    if (!command) {
      // Default: start the application
      app.start().catch(error => {
        logger.error('❌ Failed to start application:', error.message);
        process.exit(1);
      });
    } else {
      console.log(`
Fees Manager WhatsApp Automation

Usage: node scheduler.js [command]

Commands:
  start     Start the automation scheduler (default)
  stop      Stop the automation scheduler
  status    Show application status
  health    Run health check
  test      Run in test mode

Examples:
  node scheduler.js start
  node scheduler.js status
  node scheduler.js health
      `);
      process.exit(1);
    }
}

// Export for testing
module.exports = FeesManagerAutomation;
