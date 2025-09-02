const logger = require('../utils/logger');
const { globalTimeConfigService } = require('../services/globalTimeConfigService');

/**
 * Global Time Configuration Controller
 * Handles centralized time management API endpoints
 */
class GlobalTimeConfigController {
  constructor() {
    this.timeConfigService = globalTimeConfigService;
  }

  /**
   * Get organization's time configuration
   * GET /api/organization/:organizationId/time-config
   */
  async getTimeConfig(req, res) {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      // Initialize service if not already done
      if (!this.timeConfigService.getConfig().businessHours) {
        await this.timeConfigService.initialize();
      }

      const config = await this.timeConfigService.getOrganizationConfig(organizationId);
      const summary = this.timeConfigService.getBusinessHoursSummary();

      res.json({
        success: true,
        data: {
          ...config,
          summary
        }
      });

    } catch (error) {
      logger.error('[GlobalTimeConfigController] Get config failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Update organization's time configuration
   * PUT /api/organization/:organizationId/time-config
   */
  async updateTimeConfig(req, res) {
    try {
      const { organizationId } = req.params;
      const configUpdates = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      // Validate configuration
      try {
        this.validateTimeConfig(configUpdates);
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid configuration',
          error: validationError.message
        });
      }

      // Update configuration
      const success = await this.timeConfigService.updateOrganizationConfig(organizationId, configUpdates);

      if (success) {
        const updatedConfig = await this.timeConfigService.getOrganizationConfig(organizationId);
        const summary = this.timeConfigService.getBusinessHoursSummary();

        res.json({
          success: true,
          message: 'Time configuration updated successfully',
          data: {
            ...updatedConfig,
            summary
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to update configuration'
        });
      }

    } catch (error) {
      logger.error('[GlobalTimeConfigController] Update config failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get current business hours status
   * GET /api/organization/:organizationId/business-hours-status
   */
  async getBusinessHoursStatus(req, res) {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      const summary = this.timeConfigService.getBusinessHoursSummary();
      const isActive = this.timeConfigService.isWithinBusinessHours('global');
      const timeUntilNext = this.timeConfigService.getTimeUntilNextBusinessHours('global');

      res.json({
        success: true,
        data: {
          ...summary,
          isActive,
          timeUntilNext,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('[GlobalTimeConfigController] Get status failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Test business hours for different services
   * POST /api/organization/:organizationId/test-business-hours
   */
  async testBusinessHours(req, res) {
    try {
      const { organizationId } = req.params;
      const { serviceName, testTime } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      const testDate = testTime ? new Date(testTime) : new Date();
      const services = serviceName ? [serviceName] : ['rateLimiting', 'humanBehavior', 'automationRules'];
      
      const results = {};
      
      for (const service of services) {
        const isWithin = this.timeConfigService.isWithinBusinessHours(service, testDate);
        const effectiveHours = this.timeConfigService.getEffectiveBusinessHours(service);
        
        results[service] = {
          isWithinBusinessHours: isWithin,
          effectiveBusinessHours: effectiveHours,
          testTime: testDate.toISOString()
        };
      }

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('[GlobalTimeConfigController] Test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get time configuration conflicts and recommendations
   * GET /api/organization/:organizationId/time-config/analysis
   */
  async analyzeTimeConfig(req, res) {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      const config = await this.timeConfigService.getOrganizationConfig(organizationId);
      const analysis = this.analyzeConfiguration(config);

      res.json({
        success: true,
        data: analysis
      });

    } catch (error) {
      logger.error('[GlobalTimeConfigController] Analysis failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Validate time configuration
   */
  validateTimeConfig(config) {
    if (!config) {
      throw new Error('Configuration is required');
    }

    // Validate business hours
    if (config.businessHours) {
      this.validateBusinessHours(config.businessHours);
    }

    // Validate rate limiting
    if (config.rateLimiting) {
      this.validateRateLimiting(config.rateLimiting);
    }

    // Validate human behavior
    if (config.humanBehavior) {
      this.validateHumanBehavior(config.humanBehavior);
    }

    // Validate automation rules
    if (config.automationRules) {
      this.validateAutomationRules(config.automationRules);
    }
  }

  /**
   * Validate business hours configuration
   */
  validateBusinessHours(businessHours) {
    if (businessHours.enabled === undefined) {
      throw new Error('Business hours enabled status is required');
    }

    if (businessHours.enabled) {
      if (!businessHours.startTime || !businessHours.endTime) {
        throw new Error('Start time and end time are required when business hours are enabled');
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(businessHours.startTime)) {
        throw new Error('Invalid start time format. Use HH:MM (24-hour format)');
      }
      if (!timeRegex.test(businessHours.endTime)) {
        throw new Error('Invalid end time format. Use HH:MM (24-hour format)');
      }

      if (!Array.isArray(businessHours.daysOfWeek) || businessHours.daysOfWeek.length === 0) {
        throw new Error('At least one day of the week must be selected');
      }

      const validDays = [0, 1, 2, 3, 4, 5, 6];
      const invalidDays = businessHours.daysOfWeek.filter(day => !validDays.includes(day));
      if (invalidDays.length > 0) {
        throw new Error(`Invalid days of week: ${invalidDays.join(', ')}. Valid values: 0-6 (Sunday-Saturday)`);
      }
    }
  }

  /**
   * Validate rate limiting configuration
   */
  validateRateLimiting(rateLimiting) {
    if (rateLimiting.hourlyLimit !== undefined) {
      if (!Number.isInteger(rateLimiting.hourlyLimit) || rateLimiting.hourlyLimit < 1) {
        throw new Error('Hourly limit must be a positive integer');
      }
    }

    if (rateLimiting.dailyLimit !== undefined) {
      if (!Number.isInteger(rateLimiting.dailyLimit) || rateLimiting.dailyLimit < 1) {
        throw new Error('Daily limit must be a positive integer');
      }
    }

    if (rateLimiting.delayBetweenMessages !== undefined) {
      if (!Number.isInteger(rateLimiting.delayBetweenMessages) || rateLimiting.delayBetweenMessages < 0) {
        throw new Error('Delay between messages must be a non-negative integer');
      }
    }

    // Validate custom business hours if not inheriting
    if (!rateLimiting.inheritBusinessHours && rateLimiting.customBusinessHours) {
      this.validateBusinessHours(rateLimiting.customBusinessHours);
    }
  }

  /**
   * Validate human behavior configuration
   */
  validateHumanBehavior(humanBehavior) {
    // Validate custom business hours if not inheriting
    if (!humanBehavior.inheritBusinessHours && humanBehavior.customBusinessHours) {
      this.validateBusinessHours(humanBehavior.customBusinessHours);
    }
  }

  /**
   * Validate automation rules configuration
   */
  validateAutomationRules(automationRules) {
    if (automationRules.gracePeriodMinutes !== undefined) {
      if (!Number.isInteger(automationRules.gracePeriodMinutes) || automationRules.gracePeriodMinutes < 0) {
        throw new Error('Grace period must be a non-negative integer');
      }
    }

    if (automationRules.maxExecutionDelay !== undefined) {
      if (!Number.isInteger(automationRules.maxExecutionDelay) || automationRules.maxExecutionDelay < 0) {
        throw new Error('Max execution delay must be a non-negative integer');
      }
    }
  }

  /**
   * Analyze configuration for conflicts and recommendations
   */
  analyzeConfiguration(config) {
    const issues = [];
    const recommendations = [];
    const summary = {
      hasConflicts: false,
      hasRecommendations: false,
      overallScore: 100
    };

    // Check for business hours conflicts
    if (config.businessHours.enabled) {
      const startMinutes = this.timeToMinutes(config.businessHours.startTime);
      const endMinutes = this.timeToMinutes(config.businessHours.endTime);
      
      if (startMinutes >= endMinutes) {
        issues.push({
          type: 'conflict',
          severity: 'high',
          message: 'Business hours start time must be before end time',
          suggestion: 'Adjust your start or end time to create a valid time range'
        });
        summary.hasConflicts = true;
        summary.overallScore -= 30;
      }

      if (config.businessHours.daysOfWeek.length < 5) {
        recommendations.push({
          type: 'recommendation',
          severity: 'low',
          message: 'Consider extending business hours to more days',
          suggestion: 'Adding more active days can improve message delivery rates'
        });
        summary.hasRecommendations = true;
        summary.overallScore -= 5;
      }
    }

    // Check rate limiting configuration
    if (config.rateLimiting.hourlyLimit > 100) {
      recommendations.push({
        type: 'recommendation',
        severity: 'medium',
        message: 'High hourly limit may trigger WhatsApp rate limiting',
        suggestion: 'Consider reducing hourly limit to 50-100 messages for better deliverability'
      });
      summary.hasRecommendations = true;
      summary.overallScore -= 10;
    }

    if (config.rateLimiting.delayBetweenMessages < 1000) {
      recommendations.push({
        type: 'recommendation',
        severity: 'medium',
        message: 'Very short delay between messages may appear robotic',
        suggestion: 'Consider increasing delay to 2-5 seconds for more natural sending patterns'
      });
      summary.hasRecommendations = true;
      summary.overallScore -= 10;
    }

    // Check inheritance conflicts
    const nonInheritingServices = [];
    if (!config.rateLimiting.inheritBusinessHours) nonInheritingServices.push('Rate Limiting');
    if (!config.humanBehavior.inheritBusinessHours) nonInheritingServices.push('Human Behavior');
    if (!config.automationRules.inheritBusinessHours) nonInheritingServices.push('Automation Rules');

    if (nonInheritingServices.length > 0) {
      recommendations.push({
        type: 'recommendation',
        severity: 'low',
        message: `${nonInheritingServices.join(', ')} not using global business hours`,
        suggestion: 'Consider enabling inheritance for consistent time management across all services'
      });
      summary.hasRecommendations = true;
      summary.overallScore -= 5;
    }

    return {
      summary,
      issues,
      recommendations,
      analysisTimestamp: new Date().toISOString()
    };
  }

  /**
   * Utility function to convert time string to minutes
   */
  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

module.exports = GlobalTimeConfigController;
