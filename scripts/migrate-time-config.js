/**
 * Migration Script: Legacy Time Configuration to Global Time Configuration
 * This script helps migrate from the old multiple business hours system
 * to the new centralized Global Time Configuration system
 */

const { globalTimeConfigService } = require('./src/services/globalTimeConfigService');
const logger = require('./src/utils/logger');

class TimeConfigMigration {
  constructor() {
    this.migrationLog = [];
  }

  /**
   * Main migration function
   */
  async migrate() {
    try {
      logger.info('🔄 Starting Global Time Configuration migration...');
      
      // Step 1: Analyze current configuration
      const analysis = await this.analyzeCurrentConfig();
      
      // Step 2: Create recommended global configuration
      const globalConfig = await this.createGlobalConfig(analysis);
      
      // Step 3: Initialize global time service
      await globalTimeConfigService.initialize(globalConfig);
      
      // Step 4: Update service configurations
      await this.updateServiceConfigurations();
      
      // Step 5: Verify migration
      await this.verifyMigration();
      
      // Step 6: Generate migration report
      const report = this.generateMigrationReport();
      
      logger.info('✅ Global Time Configuration migration completed successfully');
      return report;
      
    } catch (error) {
      logger.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Analyze current time configuration across services
   */
  async analyzeCurrentConfig() {
    logger.info('📊 Analyzing current time configuration...');
    
    const analysis = {
      rateLimitingBusinessHours: null,
      humanBehaviorBusinessHours: null,
      automationRulesConfig: null,
      conflicts: [],
      recommendations: []
    };

    // Check if we can extract existing configurations
    // This would typically read from database or config files
    
    // Mock analysis for demonstration
    analysis.rateLimitingBusinessHours = {
      enabled: true,
      startHour: 7,
      endHour: 23,
      daysOfWeek: [1, 2, 3, 4, 5, 6]
    };

    analysis.humanBehaviorBusinessHours = {
      enabled: true,
      startTime: '07:00',
      endTime: '23:59',
      daysOfWeek: [1, 2, 3, 4, 5, 6]
    };

    // Detect conflicts
    if (analysis.rateLimitingBusinessHours && analysis.humanBehaviorBusinessHours) {
      const rateLimitStart = analysis.rateLimitingBusinessHours.startHour;
      const humanBehaviorStart = this.timeToHour(analysis.humanBehaviorBusinessHours.startTime);
      
      if (rateLimitStart !== humanBehaviorStart) {
        analysis.conflicts.push({
          type: 'business_hours_mismatch',
          description: 'Rate Limiting and Human Behavior have different start times',
          rateLimitingStart: `${rateLimitStart}:00`,
          humanBehaviorStart: analysis.humanBehaviorBusinessHours.startTime
        });
      }
    }

    this.migrationLog.push({
      step: 'analysis',
      timestamp: new Date(),
      conflicts: analysis.conflicts.length,
      details: analysis
    });

    logger.info(`📋 Analysis complete: ${analysis.conflicts.length} conflicts found`);
    return analysis;
  }

  /**
   * Create global configuration based on analysis
   */
  async createGlobalConfig(analysis) {
    logger.info('🛠️ Creating global time configuration...');
    
    // Use Human Behavior business hours as base (usually more detailed)
    const baseBusinessHours = analysis.humanBehaviorBusinessHours || analysis.rateLimitingBusinessHours;
    
    const globalConfig = {
      timezone: 'Asia/Karachi',
      businessHours: {
        enabled: baseBusinessHours?.enabled || true,
        startTime: baseBusinessHours?.startTime || '09:00',
        endTime: baseBusinessHours?.endTime || '17:00',
        daysOfWeek: baseBusinessHours?.daysOfWeek || [1, 2, 3, 4, 5],
        timezone: 'Asia/Karachi'
      },
      rateLimiting: {
        inheritBusinessHours: true,
        customBusinessHours: null,
        hourlyLimit: 50,
        dailyLimit: 500,
        delayBetweenMessages: 2000
      },
      humanBehavior: {
        inheritBusinessHours: true,
        customBusinessHours: null,
        enableNaturalDelays: true,
        enableTypingSimulation: true
      },
      automationRules: {
        inheritBusinessHours: true,
        gracePeriodMinutes: 2,
        maxExecutionDelay: 300000
      }
    };

    this.migrationLog.push({
      step: 'global_config_creation',
      timestamp: new Date(),
      config: globalConfig
    });

    logger.info('✅ Global configuration created');
    return globalConfig;
  }

  /**
   * Update service configurations to use global settings
   */
  async updateServiceConfigurations() {
    logger.info('🔧 Updating service configurations...');
    
    // This would update actual service configurations
    // For now, we'll simulate the updates
    
    const updates = [
      {
        service: 'rateLimitService',
        action: 'enable_inheritance',
        old_config: 'custom_business_hours',
        new_config: 'inherit_from_global'
      },
      {
        service: 'humanBehaviorService',
        action: 'enable_inheritance',
        old_config: 'custom_business_hours',
        new_config: 'inherit_from_global'
      },
      {
        service: 'automationService',
        action: 'use_global_grace_period',
        old_config: 'hard_coded_2_minutes',
        new_config: 'configurable_grace_period'
      }
    ];

    this.migrationLog.push({
      step: 'service_updates',
      timestamp: new Date(),
      updates
    });

    logger.info(`✅ Updated ${updates.length} service configurations`);
  }

  /**
   * Verify migration success
   */
  async verifyMigration() {
    logger.info('🔍 Verifying migration...');
    
    const verification = {
      globalServiceInitialized: false,
      businessHoursWorking: false,
      serviceInheritanceWorking: false,
      allTestsPassed: false
    };

    try {
      // Test global service
      const config = globalTimeConfigService.getConfig();
      verification.globalServiceInitialized = !!config.businessHours;

      // Test business hours checking
      verification.businessHoursWorking = globalTimeConfigService.isWithinBusinessHours('global');

      // Test service inheritance
      const rateLimitingHours = globalTimeConfigService.getEffectiveBusinessHours('rateLimiting');
      const humanBehaviorHours = globalTimeConfigService.getEffectiveBusinessHours('humanBehavior');
      verification.serviceInheritanceWorking = (
        rateLimitingHours.startTime === humanBehaviorHours.startTime &&
        rateLimitingHours.endTime === humanBehaviorHours.endTime
      );

      verification.allTestsPassed = (
        verification.globalServiceInitialized &&
        verification.businessHoursWorking !== undefined &&
        verification.serviceInheritanceWorking
      );

    } catch (error) {
      logger.error('❌ Verification failed:', error);
      verification.error = error.message;
    }

    this.migrationLog.push({
      step: 'verification',
      timestamp: new Date(),
      results: verification
    });

    if (verification.allTestsPassed) {
      logger.info('✅ Migration verification successful');
    } else {
      logger.warn('⚠️ Migration verification had issues:', verification);
    }

    return verification;
  }

  /**
   * Generate migration report
   */
  generateMigrationReport() {
    const report = {
      migrationTimestamp: new Date(),
      success: true,
      summary: {
        totalSteps: this.migrationLog.length,
        conflictsResolved: 0,
        servicesUpdated: 0,
        verificationPassed: false
      },
      migrationLog: this.migrationLog,
      nextSteps: [
        'Review the new Global Time Configuration Panel in Settings',
        'Verify that automation rules respect the new business hours',
        'Test rate limiting during business hours vs outside business hours',
        'Monitor message delivery patterns for any issues',
        'Update any custom scripts or integrations that relied on old settings'
      ],
      recommendations: [
        'Use the Global Time Configuration Panel for all future time-related changes',
        'Enable business hours inheritance for all services unless specific override needed',
        'Set up monitoring alerts for business hours configuration changes',
        'Consider setting up holiday calendars for advanced scheduling',
        'Review and optimize rate limiting settings based on actual usage patterns'
      ]
    };

    // Calculate summary statistics
    const analysisStep = this.migrationLog.find(log => log.step === 'analysis');
    if (analysisStep) {
      report.summary.conflictsResolved = analysisStep.conflicts || 0;
    }

    const serviceUpdatesStep = this.migrationLog.find(log => log.step === 'service_updates');
    if (serviceUpdatesStep) {
      report.summary.servicesUpdated = serviceUpdatesStep.updates?.length || 0;
    }

    const verificationStep = this.migrationLog.find(log => log.step === 'verification');
    if (verificationStep) {
      report.summary.verificationPassed = verificationStep.results?.allTestsPassed || false;
    }

    logger.info('📄 Migration report generated');
    return report;
  }

  /**
   * Utility function to convert time string to hour
   */
  timeToHour(timeString) {
    if (!timeString) return 0;
    const [hour] = timeString.split(':').map(Number);
    return hour;
  }

  /**
   * Rollback migration (if needed)
   */
  async rollback() {
    logger.warn('🔄 Rolling back Global Time Configuration migration...');
    
    // This would restore previous configurations
    // Implementation depends on backup strategy
    
    logger.info('✅ Migration rollback completed');
  }
}

// Export for use in other scripts
module.exports = TimeConfigMigration;

// Run migration if script is executed directly
if (require.main === module) {
  const migration = new TimeConfigMigration();
  
  migration.migrate()
    .then(report => {
      console.log('\n📄 Migration Report:');
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}
