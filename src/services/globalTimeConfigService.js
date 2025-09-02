/**
 * Global Time Configuration Service
 * Centralized time management for all app features
 * Eliminates redundant business hours across different services
 */

const logger = require('../utils/logger');

class GlobalTimeConfigService {
  constructor() {
    this.timeConfig = null;
    this.defaultConfig = {
      timezone: 'Asia/Karachi',
      businessHours: {
        enabled: true,
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
        timezone: 'Asia/Karachi'
      },
      rateLimiting: {
        inheritBusinessHours: true,
        customBusinessHours: null, // Override if needed
        hourlyLimit: 50,
        dailyLimit: 500,
        delayBetweenMessages: 2000 // milliseconds
      },
      humanBehavior: {
        inheritBusinessHours: true,
        customBusinessHours: null, // Override if needed
        enableNaturalDelays: true,
        enableTypingSimulation: true
      },
      automationRules: {
        inheritBusinessHours: true,
        gracePeriodMinutes: 2,
        maxExecutionDelay: 300000 // 5 minutes max delay
      }
    };
  }

  /**
   * Initialize time configuration
   * @param {Object} customConfig - Custom configuration overrides
   */
  async initialize(customConfig = {}) {
    try {
      this.timeConfig = {
        ...this.defaultConfig,
        ...customConfig
      };

      // Validate configuration
      this.validateConfiguration();
      
      logger.info('[GlobalTimeConfig] Time configuration initialized successfully');
      return this.timeConfig;
    } catch (error) {
      logger.error('[GlobalTimeConfig] Failed to initialize:', error);
      this.timeConfig = this.defaultConfig;
      return this.defaultConfig;
    }
  }

  /**
   * Get current time configuration
   */
  getConfig() {
    if (!this.timeConfig) {
      return this.defaultConfig;
    }
    return this.timeConfig;
  }

  /**
   * Update global business hours
   * @param {Object} businessHours - New business hours configuration
   */
  async updateBusinessHours(businessHours) {
    try {
      this.timeConfig.businessHours = {
        ...this.timeConfig.businessHours,
        ...businessHours
      };

      this.validateBusinessHours(this.timeConfig.businessHours);
      
      // Notify all dependent services
      await this.notifyConfigUpdate('businessHours', this.timeConfig.businessHours);
      
      logger.info('[GlobalTimeConfig] Business hours updated successfully');
      return true;
    } catch (error) {
      logger.error('[GlobalTimeConfig] Failed to update business hours:', error);
      return false;
    }
  }

  /**
   * Get effective business hours for a specific service
   * @param {string} serviceName - Service name (rateLimiting, humanBehavior, etc.)
   */
  getEffectiveBusinessHours(serviceName) {
    const serviceConfig = this.timeConfig[serviceName];
    
    if (!serviceConfig) {
      return this.timeConfig.businessHours;
    }

    // Return custom business hours if inheritance is disabled
    if (!serviceConfig.inheritBusinessHours && serviceConfig.customBusinessHours) {
      return serviceConfig.customBusinessHours;
    }

    // Return global business hours
    return this.timeConfig.businessHours;
  }

  /**
   * Check if current time is within business hours for a service
   * @param {string} serviceName - Service name
   * @param {Date} date - Date to check (defaults to now)
   */
  isWithinBusinessHours(serviceName, date = new Date()) {
    const businessHours = this.getEffectiveBusinessHours(serviceName);
    
    if (!businessHours.enabled) {
      return true;
    }

    try {
      // Convert to specified timezone
      const localDate = new Date(date.toLocaleString('en-US', { 
        timeZone: businessHours.timezone 
      }));
      
      const currentHour = localDate.getHours();
      const currentMinute = localDate.getMinutes();
      const currentDay = localDate.getDay();

      // Check if current day is allowed
      if (!businessHours.daysOfWeek.includes(currentDay)) {
        return false;
      }

      // Convert time to minutes for easier comparison
      const currentTimeMinutes = currentHour * 60 + currentMinute;
      const startTimeMinutes = this.timeToMinutes(businessHours.startTime);
      const endTimeMinutes = this.timeToMinutes(businessHours.endTime);

      // Handle overnight business hours (e.g., 22:00 to 06:00)
      if (startTimeMinutes > endTimeMinutes) {
        return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes;
      } else {
        return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
      }
    } catch (error) {
      logger.error('[GlobalTimeConfig] Error checking business hours:', error);
      return true; // Default to allowing operation if error
    }
  }

  /**
   * Get time until next business hours window
   * @param {string} serviceName - Service name
   */
  getTimeUntilNextBusinessHours(serviceName) {
    const businessHours = this.getEffectiveBusinessHours(serviceName);
    
    if (!businessHours.enabled || this.isWithinBusinessHours(serviceName)) {
      return 0;
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Find next allowed day
    let nextBusinessDay = tomorrow;
    while (!businessHours.daysOfWeek.includes(nextBusinessDay.getDay())) {
      nextBusinessDay.setDate(nextBusinessDay.getDate() + 1);
    }

    // Set to start time
    const [startHour, startMinute] = businessHours.startTime.split(':').map(Number);
    nextBusinessDay.setHours(startHour, startMinute, 0, 0);

    return nextBusinessDay.getTime() - now.getTime();
  }

  /**
   * Get business hours summary for UI display
   */
  getBusinessHoursSummary() {
    const businessHours = this.timeConfig.businessHours;
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDays = businessHours.daysOfWeek.map(day => dayNames[day]).join(', ');
    
    return {
      enabled: businessHours.enabled,
      timeRange: `${businessHours.startTime} - ${businessHours.endTime}`,
      days: activeDays,
      timezone: businessHours.timezone,
      isCurrentlyActive: this.isWithinBusinessHours('global'),
      nextActiveTime: this.getTimeUntilNextBusinessHours('global')
    };
  }

  /**
   * Validate entire configuration
   */
  validateConfiguration() {
    this.validateBusinessHours(this.timeConfig.businessHours);
    this.validateRateLimitingConfig(this.timeConfig.rateLimiting);
    this.validateHumanBehaviorConfig(this.timeConfig.humanBehavior);
    this.validateAutomationRulesConfig(this.timeConfig.automationRules);
  }

  /**
   * Validate business hours configuration
   */
  validateBusinessHours(businessHours) {
    if (!businessHours.startTime || !businessHours.endTime) {
      throw new Error('Start time and end time are required');
    }

    if (!Array.isArray(businessHours.daysOfWeek) || businessHours.daysOfWeek.length === 0) {
      throw new Error('At least one day of week must be specified');
    }

    const validDays = [0, 1, 2, 3, 4, 5, 6];
    const invalidDays = businessHours.daysOfWeek.filter(day => !validDays.includes(day));
    if (invalidDays.length > 0) {
      throw new Error(`Invalid days of week: ${invalidDays.join(', ')}`);
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(businessHours.startTime)) {
      throw new Error('Invalid start time format. Use HH:MM');
    }
    if (!timeRegex.test(businessHours.endTime)) {
      throw new Error('Invalid end time format. Use HH:MM');
    }
  }

  /**
   * Validate rate limiting configuration
   */
  validateRateLimitingConfig(rateLimiting) {
    if (rateLimiting.hourlyLimit < 1 || rateLimiting.dailyLimit < 1) {
      throw new Error('Rate limits must be positive numbers');
    }

    if (rateLimiting.delayBetweenMessages < 0) {
      throw new Error('Delay between messages cannot be negative');
    }
  }

  /**
   * Validate human behavior configuration
   */
  validateHumanBehaviorConfig(humanBehavior) {
    // Validate custom business hours if not inheriting
    if (!humanBehavior.inheritBusinessHours && humanBehavior.customBusinessHours) {
      this.validateBusinessHours(humanBehavior.customBusinessHours);
    }
  }

  /**
   * Validate automation rules configuration
   */
  validateAutomationRulesConfig(automationRules) {
    if (automationRules.gracePeriodMinutes < 0) {
      throw new Error('Grace period cannot be negative');
    }

    if (automationRules.maxExecutionDelay < 0) {
      throw new Error('Max execution delay cannot be negative');
    }
  }

  /**
   * Notify dependent services of configuration updates
   */
  async notifyConfigUpdate(configType, newConfig) {
    try {
      // Emit event for other services to listen to
      process.emit('globalTimeConfigUpdate', {
        type: configType,
        config: newConfig,
        timestamp: new Date()
      });

      logger.debug(`[GlobalTimeConfig] Notified services of ${configType} update`);
    } catch (error) {
      logger.error('[GlobalTimeConfig] Failed to notify services:', error);
    }
  }

  /**
   * Utility function to convert time string to minutes
   */
  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Utility function to format minutes to time string
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Get configuration for a specific organization
   * @param {string} organizationId - Organization ID
   */
  async getOrganizationConfig(organizationId) {
    // TODO: Implement organization-specific overrides
    // For now, return global config
    return this.getConfig();
  }

  /**
   * Update configuration for a specific organization
   * @param {string} organizationId - Organization ID
   * @param {Object} config - Configuration updates
   */
  async updateOrganizationConfig(organizationId, config) {
    // TODO: Implement organization-specific overrides
    // For now, update global config
    return this.updateBusinessHours(config.businessHours);
  }
}

// Create singleton instance
const globalTimeConfigService = new GlobalTimeConfigService();

module.exports = {
  GlobalTimeConfigService,
  globalTimeConfigService
};
