/**
 * Duplicate Prevention Service
 * Prevents duplicate messages based on content, business hours, and daily limits
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

class DuplicatePreventionService {
  constructor(redisClient) {
    this.client = redisClient;
    this.defaultDuplicateWindow = 24 * 60 * 60 * 1000; // 24 hours
    this.defaultBusinessHoursLimit = 2; // Max 2 messages of same type per day
  }

  /**
   * Generate content hash for duplicate detection
   * @param {Object} messageData - Message data
   * @returns {string} - Content hash
   */
  generateContentHash(messageData) {
    const content = `${messageData.phoneNumber}:${messageData.content}:${messageData.templateId || 'manual'}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Check for content-based duplicates
   * @param {string} organizationId - Organization ID
   * @param {Object} messageData - Message data
   * @param {number} duplicateWindow - Time window in milliseconds
   * @returns {Promise<Object>} - Duplicate check result
   */
  async checkContentDuplicate(organizationId, messageData, duplicateWindow = this.defaultDuplicateWindow) {
    try {
      const contentHash = this.generateContentHash(messageData);
      const duplicateKey = `duplicate:${organizationId}:${messageData.phoneNumber}:${contentHash}`;
      
      const existingMessage = await this.client.get(duplicateKey);
      
      if (existingMessage) {
        const existing = JSON.parse(existingMessage);
        const timeDiff = Date.now() - existing.timestamp;
        
        if (timeDiff < duplicateWindow) {
          logger.warn(`[DuplicatePreventionService] Content duplicate detected for ${messageData.phoneNumber}, skipping`);
          return {
            isDuplicate: true,
            reason: 'content_duplicate',
            originalMessageId: existing.messageId,
            timeSinceOriginal: timeDiff,
            duplicateWindow
          };
        }
      }
      
      // Store message hash for duplicate prevention
      await this.client.setEx(duplicateKey, Math.floor(duplicateWindow / 1000), JSON.stringify({
        messageId: messageData.id,
        timestamp: Date.now(),
        content: messageData.content,
        phoneNumber: messageData.phoneNumber
      }));
      
      return {
        isDuplicate: false,
        contentHash
      };
      
    } catch (error) {
      logger.error('[DuplicatePreventionService] Content duplicate check failed:', error);
      return {
        isDuplicate: false,
        error: error.message
      };
    }
  }

  /**
   * Check for business hours duplicates
   * @param {string} organizationId - Organization ID
   * @param {string} phoneNumber - Phone number
   * @param {string} messageType - Message type (fee_reminder, attendance_reminder, etc.)
   * @param {number} dailyLimit - Maximum messages per day
   * @returns {Promise<Object>} - Business hours duplicate check result
   */
  async checkBusinessHoursDuplicate(organizationId, phoneNumber, messageType, dailyLimit = this.defaultBusinessHoursLimit) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const duplicateKey = `business_hours:${organizationId}:${phoneNumber}:${messageType}:${today}`;
      
      const existingCount = await this.client.get(duplicateKey) || '0';
      const currentCount = parseInt(existingCount);
      
      // Check if limit exceeded
      if (currentCount >= dailyLimit) {
        logger.warn(`[DuplicatePreventionService] Business hours limit exceeded for ${phoneNumber}, type: ${messageType}`);
        return {
          isDuplicate: true,
          reason: 'business_hours_limit_exceeded',
          dailyCount: currentCount,
          dailyLimit,
          messageType
        };
      }
      
      // Increment counter
      await this.client.incr(duplicateKey);
      await this.client.expire(duplicateKey, 24 * 60 * 60); // Expire at midnight
      
      return {
        isDuplicate: false,
        dailyCount: currentCount + 1,
        dailyLimit,
        messageType
      };
      
    } catch (error) {
      logger.error('[DuplicatePreventionService] Business hours duplicate check failed:', error);
      return {
        isDuplicate: false,
        error: error.message
      };
    }
  }

  /**
   * Comprehensive duplicate check
   * @param {string} organizationId - Organization ID
   * @param {Object} messageData - Message data
   * @param {Object} options - Options for duplicate checking
   * @returns {Promise<Object>} - Complete duplicate check result
   */
  async checkDuplicate(organizationId, messageData, options = {}) {
    try {
      const {
        checkContent = true,
        checkBusinessHours = true,
        duplicateWindow = this.defaultDuplicateWindow,
        businessHoursLimit = this.defaultBusinessHoursLimit,
        messageType = 'manual'
      } = options;

      const results = {
        isDuplicate: false,
        checks: {},
        preventionActions: []
      };

      // Content-based duplicate check
      if (checkContent) {
        const contentCheck = await this.checkContentDuplicate(organizationId, messageData, duplicateWindow);
        results.checks.content = contentCheck;
        
        if (contentCheck.isDuplicate) {
          results.isDuplicate = true;
          results.reason = contentCheck.reason;
          results.preventionActions.push('content_duplicate_prevented');
          return results;
        }
      }

      // Business hours duplicate check
      if (checkBusinessHours) {
        const businessHoursCheck = await this.checkBusinessHoursDuplicate(
          organizationId, 
          messageData.phoneNumber, 
          messageType, 
          businessHoursLimit
        );
        results.checks.businessHours = businessHoursCheck;
        
        if (businessHoursCheck.isDuplicate) {
          results.isDuplicate = true;
          results.reason = businessHoursCheck.reason;
          results.preventionActions.push('business_hours_limit_prevented');
          return results;
        }
      }

      logger.debug(`[DuplicatePreventionService] No duplicates detected for ${messageData.phoneNumber}`);
      return results;

    } catch (error) {
      logger.error('[DuplicatePreventionService] Comprehensive duplicate check failed:', error);
      return {
        isDuplicate: false,
        error: error.message
      };
    }
  }

  /**
   * Get duplicate prevention statistics
   * @param {string} organizationId - Organization ID
   * @param {string} period - Time period (today, week, month)
   * @returns {Promise<Object>} - Statistics
   */
  async getPreventionStats(organizationId, period = 'today') {
    try {
      const today = new Date().toISOString().split('T')[0];
      let keyPattern;
      
      switch (period) {
        case 'today':
          keyPattern = `business_hours:${organizationId}:*:*:${today}`;
          break;
        case 'week':
          // Get last 7 days
          const dates = [];
          for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
          }
          keyPattern = `business_hours:${organizationId}:*:*:{${dates.join(',')}}`;
          break;
        default:
          keyPattern = `business_hours:${organizationId}:*:*:${today}`;
      }

      const keys = await this.client.keys(keyPattern);
      const stats = {
        totalPrevented: 0,
        byType: {},
        byPhoneNumber: {},
        period
      };

      for (const key of keys) {
        const count = await this.client.get(key);
        if (count && parseInt(count) >= this.defaultBusinessHoursLimit) {
          const parts = key.split(':');
          const phoneNumber = parts[2];
          const messageType = parts[3];
          
          stats.totalPrevented += parseInt(count) - this.defaultBusinessHoursLimit + 1;
          stats.byType[messageType] = (stats.byType[messageType] || 0) + 1;
          stats.byPhoneNumber[phoneNumber] = (stats.byPhoneNumber[phoneNumber] || 0) + 1;
        }
      }

      return stats;

    } catch (error) {
      logger.error('[DuplicatePreventionService] Get prevention stats failed:', error);
      return {
        totalPrevented: 0,
        byType: {},
        byPhoneNumber: {},
        error: error.message
      };
    }
  }

  /**
   * Clear duplicate prevention data for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<boolean>} - Success status
   */
  async clearPreventionData(organizationId) {
    try {
      const duplicateKeys = await this.client.keys(`duplicate:${organizationId}:*`);
      const businessHoursKeys = await this.client.keys(`business_hours:${organizationId}:*`);
      
      const allKeys = [...duplicateKeys, ...businessHoursKeys];
      
      if (allKeys.length > 0) {
        await this.client.del(allKeys);
        logger.info(`[DuplicatePreventionService] Cleared ${allKeys.length} prevention records for organization: ${organizationId}`);
      }
      
      return true;
      
    } catch (error) {
      logger.error('[DuplicatePreventionService] Clear prevention data failed:', error);
      return false;
    }
  }

  /**
   * Override duplicate protection for specific message
   * @param {string} organizationId - Organization ID
   * @param {Object} messageData - Message data
   * @param {string} reason - Override reason
   * @returns {Promise<boolean>} - Success status
   */
  async overrideDuplicateProtection(organizationId, messageData, reason = 'manual_override') {
    try {
      const contentHash = this.generateContentHash(messageData);
      const duplicateKey = `duplicate:${organizationId}:${messageData.phoneNumber}:${contentHash}`;
      const overrideKey = `override:${duplicateKey}`;
      
      // Store override record
      await this.client.setEx(overrideKey, 60 * 60, JSON.stringify({
        reason,
        timestamp: Date.now(),
        messageId: messageData.id
      }));
      
      logger.info(`[DuplicatePreventionService] Duplicate protection overridden for ${messageData.phoneNumber}, reason: ${reason}`);
      return true;
      
    } catch (error) {
      logger.error('[DuplicatePreventionService] Override duplicate protection failed:', error);
      return false;
    }
  }
}

module.exports = DuplicatePreventionService;
