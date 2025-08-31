/**
 * Core Messaging Service
 * Handles message sending, queuing, and delivery tracking
 */

const WhatsAppService = require('./whatsappService');
const MessageTemplateService = require('./messageTemplateService');
const { db } = require('../config/firebase');
const logger = require('../utils/logger');

class CoreMessagingService {
  constructor() {
    this.whatsappService = new WhatsAppService();
    this.templateService = new MessageTemplateService();
    this.messageQueue = new Map(); // organizationId -> queue
    this.rateLimits = new Map(); // organizationId -> rate limit info
    this.deliveryTracking = new Map(); // messageId -> tracking info
  }

  /**
   * Send individual message
   * @param {string} organizationId - Organization ID
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} - Send result
   */
  async sendMessage(organizationId, messageData) {
    try {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info(`[CoreMessagingService] Sending message ${messageId} for organization: ${organizationId}`);

      // Check rate limits
      const rateLimitCheck = await this.checkRateLimit(organizationId);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. ${rateLimitCheck.message}`,
          messageId
        };
      }

      // Prepare message
      let messageContent = messageData.content;
      
      // If template is specified, render it
      if (messageData.templateId) {
        const template = await this.templateService.getTemplate(messageData.templateId, organizationId);
        if (template) {
          messageContent = this.templateService.renderTemplate(template, messageData.variables || {});
        } else {
          logger.warn(`[CoreMessagingService] Template ${messageData.templateId} not found, using raw content`);
        }
      }

      // Create message log entry
      const messageLog = {
        id: messageId,
        organizationId,
        recipientId: messageData.recipientId,
        recipientPhone: messageData.phoneNumber,
        templateId: messageData.templateId || null,
        content: messageContent,
        originalContent: messageData.content,
        variables: messageData.variables || {},
        channel: 'whatsapp',
        status: 'pending',
        type: messageData.type || 'manual',
        priority: messageData.priority || 'normal',
        scheduledAt: messageData.scheduledAt || new Date(),
        createdAt: new Date(),
        attempts: 0,
        maxAttempts: messageData.maxAttempts || 3
      };

      // Save to database
      await this.saveMessageLog(messageLog);

      // Start delivery tracking
      this.deliveryTracking.set(messageId, {
        messageId,
        organizationId,
        status: 'pending',
        startTime: Date.now()
      });

      // Send message
      const sendResult = await this.deliverMessage(messageLog);

      // Update tracking
      this.updateDeliveryTracking(messageId, sendResult);

      // Update rate limit counter
      await this.updateRateLimit(organizationId);

      return {
        success: sendResult.success,
        messageId,
        deliveredAt: sendResult.success ? new Date() : null,
        error: sendResult.error || null,
        result: sendResult.result || null
      };

    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to send message for organization ${organizationId}:`, error);
      return {
        success: false,
        error: error.message,
        messageId: messageData.messageId || null
      };
    }
  }

  /**
   * Send bulk messages
   * @param {string} organizationId - Organization ID
   * @param {Array} messages - Array of message data
   * @param {Object} options - Bulk sending options
   * @returns {Promise<Object>} - Bulk send result
   */
  async sendBulkMessages(organizationId, messages, options = {}) {
    try {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info(`[CoreMessagingService] Sending bulk messages ${batchId} for organization: ${organizationId} (${messages.length} messages)`);

      // Check bulk rate limits
      const bulkRateLimitCheck = await this.checkBulkRateLimit(organizationId, messages.length);
      if (!bulkRateLimitCheck.allowed) {
        return {
          success: false,
          error: `Bulk rate limit exceeded. ${bulkRateLimitCheck.message}`,
          batchId
        };
      }

      const results = [];
      const delayBetweenMessages = options.delayBetweenMessages || 2000; // 2 seconds default
      const maxConcurrency = options.maxConcurrency || 1; // Sequential by default

      // Process messages
      if (maxConcurrency === 1) {
        // Sequential processing
        for (let i = 0; i < messages.length; i++) {
          const messageData = {
            ...messages[i],
            type: 'bulk',
            batchId
          };

          const result = await this.sendMessage(organizationId, messageData);
          results.push({
            index: i,
            phoneNumber: messages[i].phoneNumber,
            ...result
          });

          // Add delay between messages (except for last message)
          if (i < messages.length - 1 && delayBetweenMessages > 0) {
            await this.delay(delayBetweenMessages);
          }
        }
      } else {
        // Concurrent processing with batches
        const batches = this.createBatches(messages, maxConcurrency);
        
        for (const batch of batches) {
          const batchPromises = batch.map(async (messageData, index) => {
            const result = await this.sendMessage(organizationId, {
              ...messageData,
              type: 'bulk',
              batchId
            });
            
            return {
              index: messageData.originalIndex,
              phoneNumber: messageData.phoneNumber,
              ...result
            };
          });

          const batchResults = await Promise.all(batchPromises);
          results.push(...batchResults);

          // Add delay between batches
          if (delayBetweenMessages > 0) {
            await this.delay(delayBetweenMessages);
          }
        }
      }

      // Calculate statistics
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.length - successCount;

      // Save bulk operation log
      await this.saveBulkOperationLog({
        batchId,
        organizationId,
        totalMessages: messages.length,
        successCount,
        failedCount,
        startedAt: new Date(),
        completedAt: new Date(),
        options
      });

      logger.info(`[CoreMessagingService] Bulk message sending completed for ${batchId}: ${successCount} sent, ${failedCount} failed`);

      return {
        success: true,
        batchId,
        total: messages.length,
        successful: successCount,
        failed: failedCount,
        results
      };

    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to send bulk messages for organization ${organizationId}:`, error);
      return {
        success: false,
        error: error.message,
        batchId: null
      };
    }
  }

  /**
   * Schedule message for later delivery
   * @param {string} organizationId - Organization ID
   * @param {Object} messageData - Message data
   * @param {Date} scheduledAt - When to send the message
   * @returns {Promise<Object>} - Schedule result
   */
  async scheduleMessage(organizationId, messageData, scheduledAt) {
    try {
      const messageId = `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info(`[CoreMessagingService] Scheduling message ${messageId} for organization: ${organizationId} at ${scheduledAt}`);

      const messageLog = {
        id: messageId,
        organizationId,
        recipientId: messageData.recipientId,
        recipientPhone: messageData.phoneNumber,
        templateId: messageData.templateId || null,
        content: messageData.content,
        variables: messageData.variables || {},
        channel: 'whatsapp',
        status: 'scheduled',
        type: messageData.type || 'scheduled',
        priority: messageData.priority || 'normal',
        scheduledAt: scheduledAt,
        createdAt: new Date(),
        attempts: 0,
        maxAttempts: messageData.maxAttempts || 3
      };

      // Save to database
      await this.saveMessageLog(messageLog);

      return {
        success: true,
        messageId,
        scheduledAt,
        status: 'scheduled'
      };

    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to schedule message for organization ${organizationId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get message status
   * @param {string} messageId - Message ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object|null>} - Message status
   */
  async getMessageStatus(messageId, organizationId) {
    try {
      const doc = await db.collection('communicationLogs').doc(messageId).get();
      
      if (!doc.exists) {
        return null;
      }

      const messageLog = { id: doc.id, ...doc.data() };
      
      // Verify organization ownership
      if (messageLog.organizationId !== organizationId) {
        logger.warn(`[CoreMessagingService] Unauthorized access attempt to message ${messageId} by organization ${organizationId}`);
        return null;
      }

      // Get delivery tracking info if available
      const trackingInfo = this.deliveryTracking.get(messageId);
      
      return {
        ...messageLog,
        trackingInfo: trackingInfo || null
      };

    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to get message status for ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Retry failed message
   * @param {string} messageId - Message ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Retry result
   */
  async retryMessage(messageId, organizationId) {
    try {
      const messageLog = await this.getMessageStatus(messageId, organizationId);
      
      if (!messageLog) {
        return { success: false, error: 'Message not found or access denied' };
      }

      if (messageLog.status === 'delivered') {
        return { success: false, error: 'Message already delivered' };
      }

      if (messageLog.attempts >= messageLog.maxAttempts) {
        return { success: false, error: 'Maximum retry attempts exceeded' };
      }

      logger.info(`[CoreMessagingService] Retrying message ${messageId} (attempt ${messageLog.attempts + 1})`);

      // Update attempt count
      await db.collection('communicationLogs').doc(messageId).update({
        attempts: messageLog.attempts + 1,
        status: 'retrying',
        lastRetryAt: new Date()
      });

      // Attempt delivery
      const sendResult = await this.deliverMessage({
        ...messageLog,
        attempts: messageLog.attempts + 1
      });

      return {
        success: sendResult.success,
        attempt: messageLog.attempts + 1,
        error: sendResult.error || null
      };

    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to retry message ${messageId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deliver message via WhatsApp
   * @param {Object} messageLog - Message log object
   * @returns {Promise<Object>} - Delivery result
   */
  async deliverMessage(messageLog) {
    try {
      const result = await this.whatsappService.sendMessage(
        messageLog.organizationId,
        messageLog.recipientPhone,
        messageLog.content
      );

      // Update message log with result
      const updateData = {
        status: result.success ? 'delivered' : 'failed',
        deliveredAt: result.success ? new Date() : null,
        failureReason: result.success ? null : result.error,
        lastAttemptAt: new Date()
      };

      await db.collection('communicationLogs').doc(messageLog.id).update(updateData);

      return result;

    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to deliver message ${messageLog.id}:`, error);
      
      // Update message log with failure
      await db.collection('communicationLogs').doc(messageLog.id).update({
        status: 'failed',
        failureReason: error.message,
        lastAttemptAt: new Date()
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Check rate limit for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Rate limit check result
   */
  async checkRateLimit(organizationId) {
    try {
      const now = Date.now();
      const hourWindow = 60 * 60 * 1000; // 1 hour
      const maxMessagesPerHour = 100; // Default limit

      let rateLimitInfo = this.rateLimits.get(organizationId);
      
      if (!rateLimitInfo) {
        rateLimitInfo = {
          organizationId,
          windowStart: now,
          messageCount: 0,
          maxMessages: maxMessagesPerHour
        };
        this.rateLimits.set(organizationId, rateLimitInfo);
      }

      // Reset window if expired
      if ((now - rateLimitInfo.windowStart) >= hourWindow) {
        rateLimitInfo.windowStart = now;
        rateLimitInfo.messageCount = 0;
      }

      // Check if limit exceeded
      if (rateLimitInfo.messageCount >= rateLimitInfo.maxMessages) {
        const resetTime = new Date(rateLimitInfo.windowStart + hourWindow);
        return {
          allowed: false,
          message: `Rate limit exceeded. Resets at ${resetTime.toISOString()}`,
          resetTime
        };
      }

      return { allowed: true };

    } catch (error) {
      logger.error(`[CoreMessagingService] Rate limit check failed for organization ${organizationId}:`, error);
      return { allowed: true }; // Allow on error to prevent blocking
    }
  }

  /**
   * Check bulk rate limit
   * @param {string} organizationId - Organization ID
   * @param {number} messageCount - Number of messages
   * @returns {Promise<Object>} - Bulk rate limit check result
   */
  async checkBulkRateLimit(organizationId, messageCount) {
    try {
      const rateLimitCheck = await this.checkRateLimit(organizationId);
      
      if (!rateLimitCheck.allowed) {
        return rateLimitCheck;
      }

      const rateLimitInfo = this.rateLimits.get(organizationId);
      const remainingMessages = rateLimitInfo.maxMessages - rateLimitInfo.messageCount;

      if (messageCount > remainingMessages) {
        return {
          allowed: false,
          message: `Bulk message count (${messageCount}) exceeds remaining limit (${remainingMessages})`
        };
      }

      return { allowed: true };

    } catch (error) {
      logger.error(`[CoreMessagingService] Bulk rate limit check failed for organization ${organizationId}:`, error);
      return { allowed: true }; // Allow on error to prevent blocking
    }
  }

  /**
   * Update rate limit counter
   * @param {string} organizationId - Organization ID
   */
  async updateRateLimit(organizationId) {
    const rateLimitInfo = this.rateLimits.get(organizationId);
    if (rateLimitInfo) {
      rateLimitInfo.messageCount++;
    }
  }

  /**
   * Update delivery tracking
   * @param {string} messageId - Message ID
   * @param {Object} result - Delivery result
   */
  updateDeliveryTracking(messageId, result) {
    const tracking = this.deliveryTracking.get(messageId);
    if (tracking) {
      tracking.status = result.success ? 'delivered' : 'failed';
      tracking.endTime = Date.now();
      tracking.duration = tracking.endTime - tracking.startTime;
      tracking.error = result.error || null;
    }
  }

  /**
   * Save message log to database
   * @param {Object} messageLog - Message log object
   */
  async saveMessageLog(messageLog) {
    try {
      await db.collection('communicationLogs').doc(messageLog.id).set(messageLog);
    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to save message log ${messageLog.id}:`, error);
    }
  }

  /**
   * Save bulk operation log
   * @param {Object} bulkLog - Bulk operation log
   */
  async saveBulkOperationLog(bulkLog) {
    try {
      await db.collection('bulkOperationLogs').doc(bulkLog.batchId).set(bulkLog);
    } catch (error) {
      logger.error(`[CoreMessagingService] Failed to save bulk operation log ${bulkLog.batchId}:`, error);
    }
  }

  /**
   * Create batches for concurrent processing
   * @param {Array} items - Items to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array} - Array of batches
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize).map((item, index) => ({
        ...item,
        originalIndex: i + index
      }));
      batches.push(batch);
    }
    return batches;
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

module.exports = CoreMessagingService;
