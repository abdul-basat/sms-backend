/**
 * Enhanced Message Queue Service with Human Behavior Simulation
 * Handles intelligent message queuing with anti-detection features
 */

const HumanBehaviorService = require('./humanBehaviorService');
const DuplicatePreventionService = require('./duplicatePreventionService');
const WhatsAppService = require('./whatsappService');
const InMemoryQueueService = require('./inMemoryQueueService');
const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class EnhancedMessageQueueService {
  constructor() {
    this.humanBehavior = new HumanBehaviorService();
    this.whatsappService = new WhatsAppService();
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = null;
    this.duplicatePrevention = null;
    this.processingQueues = new Map(); // organizationId -> processing status
    this.messageHistory = new Map(); // organizationId -> recent message timestamps
    this.isConnected = false;
    this.isInMemory = false;
    
    this.connect();
  }

  /**
   * Connect to Redis with fallback to in-memory
   */
  async connect() {
    try {
      // Check if Redis should be used
      if (process.env.NODE_ENV === 'development' && !process.env.REDIS_ENABLED) {
        logger.info('📱 Redis disabled in development, using in-memory queue');
        return this.fallbackToInMemory();
      }

      // Try Redis first with timeout
      this.client = Redis.createClient({ 
        url: this.redisUrl,
        socket: {
          connectTimeout: 5000,
          commandTimeout: 5000
        }
      });
      
      // Set up error handler to prevent spam
      this.client.on('error', (err) => {
        if (!this.isInMemory) {
          logger.error('❌ Redis Client Error:', err.message);
          // Fallback to in-memory on persistent errors
          this.fallbackToInMemory();
        }
      });

      // Set connection timeout
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      
      this.duplicatePrevention = new DuplicatePreventionService(this.client);
      this.isConnected = true;
      this.isInMemory = false;
      
      logger.info('✅ Enhanced Message Queue connected to Redis successfully');
      
      // Initialize cleanup job
      this.startCleanupJob();
      
    } catch (error) {
      logger.warn(`⚠️ Failed to connect to Redis: ${error.message}`);
      logger.info('🔄 Falling back to in-memory queue service...');
      
      // Fallback to in-memory service
      this.client = new InMemoryQueueService();
      await this.client.connect();
      
      this.duplicatePrevention = { 
        checkDuplicate: async () => false,
        markProcessed: async () => true 
      }; // Mock duplicate prevention
      
      this.isConnected = true;
      this.isInMemory = true;
      
      logger.info('✅ Enhanced Message Queue using in-memory fallback');
    }
  }

  /**
   * Fallback to in-memory queue service
   */
  async fallbackToInMemory() {
    try {
      // Clean up existing Redis client if it exists
      if (this.client && typeof this.client.disconnect === 'function') {
        try {
          await this.client.disconnect();
        } catch (err) {
          // Ignore disconnect errors
        }
      }

      // Switch to in-memory service
      this.client = new InMemoryQueueService();
      await this.client.connect();
      
      this.duplicatePrevention = { 
        checkDuplicate: async () => false,
        markProcessed: async () => true 
      }; // Mock duplicate prevention
      
      this.isConnected = true;
      this.isInMemory = true;
      
      logger.info('✅ Enhanced Message Queue using in-memory fallback');
      
    } catch (error) {
      logger.error('❌ Failed to initialize in-memory fallback:', error);
      throw error;
    }
  }

  /**
   * Add message to intelligent queue
   * @param {string} organizationId - Organization ID
   * @param {Object} messageData - Message data
   * @param {Object} behaviorConfig - Behavior configuration
   * @returns {Promise<Object>} - Queue result
   */
  async addToQueue(organizationId, messageData, behaviorConfig = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }

      const messageId = uuidv4();
      
      // Enhanced message object with behavior settings
      const enhancedMessage = {
        id: messageId,
        organizationId,
        ...messageData,
        behaviorConfig: {
          pattern: behaviorConfig.pattern || 'moderate',
          typingSpeed: behaviorConfig.typingSpeed || 'normal',
          enableTypingIndicator: behaviorConfig.enableTypingIndicator !== false,
          enableJitter: behaviorConfig.enableJitter !== false,
          timezone: behaviorConfig.timezone || 'UTC',
          businessHours: behaviorConfig.businessHours || {
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5] // Monday to Friday
          }
        },
        metadata: {
          addedAt: new Date().toISOString(),
          priority: messageData.priority || 'normal',
          attempts: 0,
          maxAttempts: messageData.maxAttempts || 3,
          estimatedLength: messageData.content?.length || 0
        },
        status: 'queued'
      };

      // Check for duplicates before adding to queue
      const duplicateCheck = await this.duplicatePrevention.checkDuplicate(organizationId, enhancedMessage, {
        checkContent: behaviorConfig.checkContentDuplicates !== false,
        checkBusinessHours: behaviorConfig.checkBusinessHoursDuplicates !== false,
        duplicateWindow: behaviorConfig.duplicateWindow || 24 * 60 * 60 * 1000, // 24 hours
        businessHoursLimit: behaviorConfig.businessHoursLimit || 2,
        messageType: messageData.templateId || messageData.type || 'manual'
      });

      // If duplicate detected, return early with prevention info
      if (duplicateCheck.isDuplicate) {
        logger.warn(`[EnhancedMessageQueueService] Duplicate prevented for ${messageData.phoneNumber}: ${duplicateCheck.reason}`);
        
        // Log duplicate prevention for analytics
        await this.logDuplicatePrevention(organizationId, enhancedMessage, duplicateCheck);
        
        return {
          success: false,
          messageId,
          prevented: true,
          reason: duplicateCheck.reason,
          duplicateCheck,
          message: 'Message prevented due to duplicate detection'
        };
      }

      const queueKey = `queue:messages:${organizationId}`;
      const priorityQueueKey = `queue:priority:${organizationId}`;
      
      // Add to appropriate queue based on priority
      const targetQueue = messageData.priority === 'high' ? priorityQueueKey : queueKey;
      
      await this.client.lPush(targetQueue, JSON.stringify(enhancedMessage));
      
      // Update queue statistics
      await this.updateQueueStats(organizationId);
      
      logger.info(`[EnhancedMessageQueueService] Message ${messageId} added to queue for organization: ${organizationId}`);
      
      // Start processing if not already running
      this.startQueueProcessing(organizationId);
      
      return {
        success: true,
        messageId,
        queuePosition: await this.getQueueLength(organizationId),
        estimatedDelay: await this.estimateDelay(organizationId, enhancedMessage),
        duplicateCheck
      };

    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error adding to queue:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add multiple messages with intelligent batching
   * @param {string} organizationId - Organization ID
   * @param {Array} messages - Array of messages
   * @param {Object} behaviorConfig - Behavior configuration
   * @returns {Promise<Object>} - Batch queue result
   */
  async addBulkToQueue(organizationId, messages, behaviorConfig = {}) {
    try {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Invalid messages array');
      }

      logger.info(`[EnhancedMessageQueueService] Adding ${messages.length} messages to bulk queue for organization: ${organizationId}`);

      // Analyze for burst patterns and optimize order
      const optimizedOrder = this.humanBehavior.generateOptimalQueueOrder(messages);
      
      // Process messages in batches to avoid overwhelming the queue
      const batchSize = behaviorConfig.batchSize || 10;
      const batches = [];
      
      for (let i = 0; i < optimizedOrder.length; i += batchSize) {
        batches.push(optimizedOrder.slice(i, i + batchSize));
      }

      const results = [];
      let totalEstimatedDelay = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        // Add delay between batches for large bulk operations
        if (batchIndex > 0) {
          const batchDelay = await this.humanBehavior.generateHumanDelay(
            behaviorConfig.pattern,
            100, // Average message length
            batchIndex,
            batches.length
          );
          totalEstimatedDelay += batchDelay;
        }

        // Add each message in the batch
        for (let msgIndex = 0; msgIndex < batch.length; msgIndex++) {
          const message = batch[msgIndex];
          
          const result = await this.addToQueue(organizationId, {
            ...message,
            metadata: {
              ...message.metadata,
              batchIndex,
              messageIndex: msgIndex,
              totalMessages: batch.length,
              isLastInBatch: msgIndex === batch.length - 1
            }
          }, behaviorConfig);
          
          results.push(result);

          // Small delay between adding messages to queue
          await this.delay(100 + Math.random() * 200);
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      return {
        success: successCount > 0,
        totalMessages: messages.length,
        successCount,
        failureCount: messages.length - successCount,
        results,
        estimatedTotalDelay: totalEstimatedDelay,
        batches: batches.length
      };

    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error adding bulk to queue:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start intelligent queue processing for an organization
   * @param {string} organizationId - Organization ID
   */
  async startQueueProcessing(organizationId) {
    try {
      // Check if already processing
      if (this.processingQueues.get(organizationId)) {
        logger.debug(`[EnhancedMessageQueueService] Queue already processing for organization: ${organizationId}`);
        return;
      }

      this.processingQueues.set(organizationId, true);
      logger.info(`[EnhancedMessageQueueService] Starting queue processing for organization: ${organizationId}`);

      await this.processQueue(organizationId);

    } catch (error) {
      logger.error(`[EnhancedMessageQueueService] Error starting queue processing for ${organizationId}:`, error);
    } finally {
      this.processingQueues.set(organizationId, false);
    }
  }

  /**
   * Process queue with human behavior simulation
   * @param {string} organizationId - Organization ID
   */
  async processQueue(organizationId) {
    const queueKey = `queue:messages:${organizationId}`;
    const priorityQueueKey = `queue:priority:${organizationId}`;
    
    try {
      while (true) {
        // Check priority queue first
        let rawMessage = await this.client.rPop(priorityQueueKey);
        
        // If no priority messages, check regular queue
        if (!rawMessage) {
          rawMessage = await this.client.rPop(queueKey);
        }
        
        // If no messages, stop processing
        if (!rawMessage) {
          logger.debug(`[EnhancedMessageQueueService] No more messages in queue for organization: ${organizationId}`);
          break;
        }

        try {
          const message = JSON.parse(rawMessage);
          
          // Check business hours before processing
          const isBusinessHours = this.humanBehavior.isWithinBusinessHours(
            message.behaviorConfig.timezone,
            message.behaviorConfig.businessHours
          );

          if (!isBusinessHours) {
            logger.info(`[EnhancedMessageQueueService] Outside business hours, postponing message ${message.id}`);
            
            // Calculate next business hours time
            const nextBusinessTime = this.calculateNextBusinessTime(
              message.behaviorConfig.timezone,
              message.behaviorConfig.businessHours
            );
            
            // Set retry timestamp
            message.retryAfter = nextBusinessTime;
            message.status = 'postponed';
            
            // Re-queue for later processing with delay
            await this.client.lPush(queueKey, JSON.stringify(message));
            
            // Wait before checking next message (don't process immediately)
            await this.delay(60 * 1000); // Wait 1 minute before checking again
            continue;
          }

          // Analyze burst patterns
          const messageHistory = this.getMessageHistory(organizationId);
          const burstAnalysis = this.humanBehavior.analyzeBurstPattern(messageHistory);
          
          if (burstAnalysis.isBurst && burstAnalysis.riskLevel === 'critical') {
            logger.warn(`[EnhancedMessageQueueService] Critical burst detected for ${organizationId}, applying extended delay`);
            await this.delay(burstAnalysis.recommendedDelay);
          }

          // Generate human-like delay
          const delay = await this.humanBehavior.generateHumanDelay(
            message.behaviorConfig.pattern,
            message.metadata.estimatedLength,
            message.metadata.messageIndex || 0,
            message.metadata.totalMessages || 1
          );

          logger.debug(`[EnhancedMessageQueueService] Processing message ${message.id} with ${delay}ms delay`);

          // Apply delay before sending
          if (delay > 0) {
            await this.delay(delay);
          }

          // Simulate typing if enabled
          if (message.behaviorConfig.enableTypingIndicator) {
            const typingTime = this.humanBehavior.calculateTypingTime(
              message.metadata.estimatedLength,
              message.behaviorConfig.typingSpeed
            );
            await this.humanBehavior.simulateTyping(message.phoneNumber, typingTime);
          }

          // Send the message (integrate with actual messaging service)
          const sendResult = await this.sendMessage(message);
          
          // Record message timestamp
          this.recordMessageSent(organizationId, Date.now());

          // Update message status
          await this.updateMessageStatus(message.id, sendResult.success ? 'sent' : 'failed', sendResult);

          // Log result
          if (sendResult.success) {
            logger.info(`[EnhancedMessageQueueService] Message ${message.id} sent successfully`);
          } else {
            logger.error(`[EnhancedMessageQueueService] Message ${message.id} failed:`, sendResult.error);
            
            // Retry logic
            if (message.metadata.attempts < message.metadata.maxAttempts) {
              message.metadata.attempts++;
              message.status = 'retrying';
              
              // Re-queue with exponential backoff
              const retryDelay = Math.pow(2, message.metadata.attempts) * 60000; // 2^n minutes
              setTimeout(async () => {
                await this.client.lPush(queueKey, JSON.stringify(message));
              }, retryDelay);
              
              logger.info(`[EnhancedMessageQueueService] Message ${message.id} re-queued for retry ${message.metadata.attempts}/${message.metadata.maxAttempts}`);
            }
          }

        } catch (messageError) {
          logger.error('[EnhancedMessageQueueService] Error processing individual message:', messageError);
        }
      }

    } catch (error) {
      logger.error(`[EnhancedMessageQueueService] Error in queue processing for ${organizationId}:`, error);
    }
  }

  /**
   * Send message through WhatsApp service
   * @param {Object} message - Message object
   * @returns {Promise<Object>} - Send result
   */
  async sendMessage(message) {
    try {
      logger.debug(`[EnhancedMessageQueueService] Sending message to ${message.phoneNumber}: ${message.content.substring(0, 50)}...`);
      
      // Extract organization ID from message metadata
      const organizationId = message.organizationId || 'default';
      
      // Use WhatsApp service to send message
      const result = await this.whatsappService.sendMessage(organizationId, {
        recipientId: message.recipientId,
        phoneNumber: message.phoneNumber,
        content: message.content,
        templateId: message.templateId,
        variables: message.variables,
        type: message.type || 'text'
      });
      
      if (result.success) {
        logger.info(`[EnhancedMessageQueueService] Message ${message.id} sent successfully to ${message.phoneNumber}`);
        return {
          success: true,
          messageId: result.messageId || message.id,
          timestamp: new Date(),
          whatsappMessageId: result.whatsappMessageId
        };
      } else {
        logger.error(`[EnhancedMessageQueueService] Failed to send message ${message.id}: ${result.error}`);
        return {
          success: false,
          error: result.error || 'Unknown WhatsApp service error'
        };
      }

    } catch (error) {
      logger.error(`[EnhancedMessageQueueService] Error sending message ${message.id}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Utility methods
   */
  async getQueueLength(organizationId) {
    const queueKey = `queue:messages:${organizationId}`;
    const priorityQueueKey = `queue:priority:${organizationId}`;
    
    const [normalLength, priorityLength] = await Promise.all([
      this.client.lLen(queueKey),
      this.client.lLen(priorityQueueKey)
    ]);
    
    return normalLength + priorityLength;
  }

  async estimateDelay(organizationId, message) {
    const queueLength = await this.getQueueLength(organizationId);
    const avgDelay = 10000; // 10 seconds average
    
    return queueLength * avgDelay;
  }

  getMessageHistory(organizationId) {
    return this.messageHistory.get(organizationId) || [];
  }

  recordMessageSent(organizationId, timestamp) {
    const history = this.getMessageHistory(organizationId);
    history.push(timestamp);
    
    // Keep only last 50 messages
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
    
    this.messageHistory.set(organizationId, history);
  }

  async updateQueueStats(organizationId) {
    const statsKey = `queue:stats:${organizationId}`;
    const stats = {
      lastUpdated: new Date().toISOString(),
      totalQueued: await this.getQueueLength(organizationId)
    };
    
    await this.client.hSet(statsKey, stats);
  }

  async updateMessageStatus(messageId, status, result = {}) {
    const statusKey = `message:status:${messageId}`;
    const statusData = {
      status,
      updatedAt: new Date().toISOString(),
      result: JSON.stringify(result)
    };
    
    await this.client.hSet(statusKey, statusData);
    
    // Set expiration (7 days)
    await this.client.expire(statusKey, 7 * 24 * 60 * 60);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup old queue data
   */
  startCleanupJob() {
    setInterval(async () => {
      try {
        // Clean up old message status records
        const keys = await this.client.keys('message:status:*');
        for (const key of keys) {
          const ttl = await this.client.ttl(key);
          if (ttl === -1) { // No expiration set
            await this.client.expire(key, 7 * 24 * 60 * 60); // Set 7 day expiration
          }
        }
        
        logger.debug('[EnhancedMessageQueueService] Cleanup job completed');
      } catch (error) {
        logger.error('[EnhancedMessageQueueService] Cleanup job failed:', error);
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Get queue status for an organization
   */
  async getQueueStatus(organizationId) {
    try {
      const queueLength = await this.getQueueLength(organizationId);
      const priorityQueueLength = await this.getPriorityQueueLength(organizationId);
      const isProcessing = this.processingQueues.get(organizationId) || false;
      const messageHistory = this.getMessageHistory(organizationId);
      const burstAnalysis = this.humanBehavior.analyzeBurstPattern(messageHistory);
      
      // Get duplicate prevention stats
      const duplicateStats = await this.duplicatePrevention.getPreventionStats(organizationId, 'today');
      
      // Get current message being processed
      const currentMessage = await this.getCurrentProcessingMessage(organizationId);
      
      return {
        organizationId,
        totalQueued: queueLength + priorityQueueLength,
        regularQueued: queueLength,
        priorityQueued: priorityQueueLength,
        isProcessing,
        recentMessages: messageHistory.length,
        burstAnalysis,
        humanBehaviorStatus: this.humanBehavior.getStatus(),
        duplicatesPrevented: duplicateStats.totalPrevented || 0,
        duplicatePreventionStats: duplicateStats,
        currentMessage,
        estimatedCompletion: this.calculateEstimatedCompletion(organizationId, queueLength + priorityQueueLength),
        progressPercentage: this.calculateProgressPercentage(organizationId)
      };
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error getting queue status:', error);
      return {
        error: error.message
      };
    }
  }

  /**
   * Pause queue processing for an organization
   */
  async pauseQueue(organizationId) {
    try {
      this.processingQueues.set(organizationId, false);
      
      // Store pause state in Redis
      await this.client.set(`queue:paused:${organizationId}`, 'true');
      
      logger.info(`[EnhancedMessageQueueService] Queue paused for organization: ${organizationId}`);
      return { success: true, message: 'Queue paused successfully' };
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error pausing queue:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume queue processing for an organization
   */
  async resumeQueue(organizationId) {
    try {
      // Remove pause state
      await this.client.del(`queue:paused:${organizationId}`);
      
      // Start processing
      this.startQueueProcessing(organizationId);
      
      logger.info(`[EnhancedMessageQueueService] Queue resumed for organization: ${organizationId}`);
      return { success: true, message: 'Queue resumed successfully' };
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error resuming queue:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all messages from queue for an organization
   */
  async clearQueue(organizationId) {
    try {
      const queueKey = `queue:messages:${organizationId}`;
      const priorityQueueKey = `queue:priority:${organizationId}`;
      
      const deletedRegular = await this.client.del(queueKey);
      const deletedPriority = await this.client.del(priorityQueueKey);
      
      logger.info(`[EnhancedMessageQueueService] Queue cleared for organization: ${organizationId} (${deletedRegular + deletedPriority} queues cleared)`);
      return { 
        success: true, 
        message: 'Queue cleared successfully',
        clearedQueues: deletedRegular + deletedPriority
      };
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error clearing queue:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel a specific message in the queue
   */
  async cancelMessage(organizationId, messageId) {
    try {
      const queueKey = `queue:messages:${organizationId}`;
      const priorityQueueKey = `queue:priority:${organizationId}`;
      
      let found = false;
      
      // Check regular queue
      const regularMessages = await this.client.lRange(queueKey, 0, -1);
      for (let i = 0; i < regularMessages.length; i++) {
        const message = JSON.parse(regularMessages[i]);
        if (message.id === messageId) {
          await this.client.lRem(queueKey, 1, regularMessages[i]);
          found = true;
          break;
        }
      }
      
      // Check priority queue if not found
      if (!found) {
        const priorityMessages = await this.client.lRange(priorityQueueKey, 0, -1);
        for (let i = 0; i < priorityMessages.length; i++) {
          const message = JSON.parse(priorityMessages[i]);
          if (message.id === messageId) {
            await this.client.lRem(priorityQueueKey, 1, priorityMessages[i]);
            found = true;
            break;
          }
        }
      }
      
      if (found) {
        // Update message status
        await this.updateMessageStatus(messageId, 'cancelled', { cancelledAt: new Date().toISOString() });
        logger.info(`[EnhancedMessageQueueService] Message ${messageId} cancelled for organization: ${organizationId}`);
        return { success: true, message: 'Message cancelled successfully' };
      } else {
        return { success: false, message: 'Message not found in queue' };
      }
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error cancelling message:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retry a failed message
   */
  async retryMessage(organizationId, messageId) {
    try {
      // Get message status
      const statusKey = `message:status:${messageId}`;
      const status = await this.client.hGetAll(statusKey);
      
      if (!status || !status.result) {
        return { success: false, message: 'Message not found or no status available' };
      }
      
      const messageResult = JSON.parse(status.result);
      if (!messageResult.originalMessage) {
        return { success: false, message: 'Original message data not available for retry' };
      }
      
      // Reset attempts and add back to queue
      const retryMessage = {
        ...messageResult.originalMessage,
        metadata: {
          ...messageResult.originalMessage.metadata,
          attempts: 0,
          isRetry: true,
          originalMessageId: messageId
        },
        status: 'queued'
      };
      
      const result = await this.addToQueue(organizationId, retryMessage);
      
      if (result.success) {
        logger.info(`[EnhancedMessageQueueService] Message ${messageId} retried as ${result.messageId} for organization: ${organizationId}`);
        return { 
          success: true, 
          message: 'Message queued for retry',
          newMessageId: result.messageId 
        };
      } else {
        return { success: false, message: 'Failed to queue message for retry', error: result.error };
      }
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error retrying message:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get detailed queue information
   */
  async getQueuedMessages(organizationId, limit = 50) {
    try {
      const queueKey = `queue:messages:${organizationId}`;
      const priorityQueueKey = `queue:priority:${organizationId}`;
      
      const regularMessages = await this.client.lRange(queueKey, 0, limit);
      const priorityMessages = await this.client.lRange(priorityQueueKey, 0, limit);
      
      const parsedRegular = regularMessages.map(msg => JSON.parse(msg));
      const parsedPriority = priorityMessages.map(msg => JSON.parse(msg));
      
      return {
        success: true,
        totalQueued: parsedRegular.length + parsedPriority.length,
        regularQueue: parsedRegular,
        priorityQueue: parsedPriority,
        allMessages: [...parsedPriority, ...parsedRegular] // Priority first
      };
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error getting queued messages:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Log duplicate prevention action
   */
  async logDuplicatePrevention(organizationId, message, duplicateCheck) {
    try {
      const logKey = `duplicate_log:${organizationId}:${new Date().toISOString().split('T')[0]}`;
      const logEntry = {
        messageId: message.id,
        phoneNumber: message.phoneNumber,
        reason: duplicateCheck.reason,
        timestamp: new Date().toISOString(),
        contentHash: duplicateCheck.checks?.content?.contentHash,
        duplicateCheck
      };
      
      await this.client.lPush(logKey, JSON.stringify(logEntry));
      await this.client.expire(logKey, 30 * 24 * 60 * 60); // Keep for 30 days
      
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error logging duplicate prevention:', error);
    }
  }

  /**
   * Get priority queue length
   */
  async getPriorityQueueLength(organizationId) {
    try {
      const priorityQueueKey = `queue:priority:${organizationId}`;
      return await this.client.lLen(priorityQueueKey);
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error getting priority queue length:', error);
      return 0;
    }
  }

  /**
   * Get current processing message (stub for now)
   */
  async getCurrentProcessingMessage(organizationId) {
    // This would be implemented to track the currently processing message
    return null;
  }

  /**
   * Calculate estimated completion time
   */
  calculateEstimatedCompletion(organizationId, queueLength) {
    if (queueLength === 0) return null;
    
    // Estimate based on average processing time (placeholder calculation)
    const averageProcessingTime = 30000; // 30 seconds per message
    const estimatedMs = queueLength * averageProcessingTime;
    
    return new Date(Date.now() + estimatedMs);
  }

  /**
   * Calculate next business time based on timezone and business hours
   * @param {string} timezone - Organization timezone
   * @param {Object} businessHours - Business hours configuration
   * @returns {number} - Timestamp for next business time
   */
  calculateNextBusinessTime(timezone, businessHours) {
    try {
      const now = new Date();
      const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      
      const currentDay = userTime.getDay(); // 0 = Sunday
      const currentHour = userTime.getHours();
      const currentMinute = userTime.getMinutes();
      
      // Convert business hours to minutes
      const startTimeMinutes = this.timeToMinutes(businessHours.startTime);
      const endTimeMinutes = this.timeToMinutes(businessHours.endTime);
      const currentTimeMinutes = currentHour * 60 + currentMinute;
      
      // Check if today is a business day
      const isBusinessDay = businessHours.daysOfWeek?.includes(currentDay);
      
      if (isBusinessDay && currentTimeMinutes < startTimeMinutes) {
        // Same day, before business hours start
        const nextTime = new Date(userTime);
        nextTime.setHours(Math.floor(startTimeMinutes / 60), startTimeMinutes % 60, 0, 0);
        return nextTime.getTime();
      }
      
      // Find next business day
      for (let i = 1; i <= 7; i++) {
        const nextDay = new Date(userTime);
        nextDay.setDate(userTime.getDate() + i);
        nextDay.setHours(Math.floor(startTimeMinutes / 60), startTimeMinutes % 60, 0, 0);
        
        if (businessHours.daysOfWeek?.includes(nextDay.getDay())) {
          return nextDay.getTime();
        }
      }
      
      // Fallback: tomorrow at business hours start
      const tomorrow = new Date(userTime);
      tomorrow.setDate(userTime.getDate() + 1);
      tomorrow.setHours(Math.floor(startTimeMinutes / 60), startTimeMinutes % 60, 0, 0);
      return tomorrow.getTime();
      
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error calculating next business time:', error);
      // Fallback: 1 hour from now
      return Date.now() + (60 * 60 * 1000);
    }
  }

  /**
   * Convert time string (HH:MM) to minutes
   * @param {string} timeString - Time in HH:MM format
   * @returns {number} - Time in minutes
   */
  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Calculate progress percentage
   */
  calculateProgressPercentage(organizationId) {
    // This would be implemented based on processed vs total messages
    return 0;
  }
}

module.exports = EnhancedMessageQueueService;
