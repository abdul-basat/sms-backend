/**
 * Enhanced Message Queue Service with Human Behavior Simulation
 * Handles intelligent message queuing with anti-detection features
 */

const HumanBehaviorService = require('./humanBehaviorService');
const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class EnhancedMessageQueueService {
  constructor() {
    this.humanBehavior = new HumanBehaviorService();
    this.redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    this.client = Redis.createClient({ url: this.redisUrl });
    this.processingQueues = new Map(); // organizationId -> processing status
    this.messageHistory = new Map(); // organizationId -> recent message timestamps
    this.isConnected = false;
    
    this.connect();
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      await this.client.connect();
      this.isConnected = true;
      logger.info('🔗 Enhanced Message Queue Service connected to Redis');
      
      // Initialize cleanup job
      this.startCleanupJob();
    } catch (error) {
      logger.error('❌ Failed to connect Enhanced Message Queue to Redis:', error.message);
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
      const queueKey = `queue:messages:${organizationId}`;
      const priorityQueueKey = `queue:priority:${organizationId}`;
      
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
        estimatedDelay: await this.estimateDelay(organizationId, enhancedMessage)
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
            
            // Re-queue for later processing
            await this.client.lPush(queueKey, rawMessage);
            
            // Wait and check again in 30 minutes
            await this.delay(30 * 60 * 1000);
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
   * Send message through WhatsApp service (placeholder)
   * @param {Object} message - Message object
   * @returns {Promise<Object>} - Send result
   */
  async sendMessage(message) {
    try {
      // This would integrate with the actual WhatsApp service
      // For now, return a mock success
      
      logger.debug(`[EnhancedMessageQueueService] Sending message to ${message.phoneNumber}: ${message.content.substring(0, 50)}...`);
      
      // Simulate network delay
      await this.delay(500 + Math.random() * 1000);
      
      // Mock success/failure (90% success rate)
      const isSuccess = Math.random() > 0.1;
      
      return {
        success: isSuccess,
        messageId: message.id,
        timestamp: new Date(),
        error: isSuccess ? null : 'Mock network error'
      };

    } catch (error) {
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
      const isProcessing = this.processingQueues.get(organizationId) || false;
      const messageHistory = this.getMessageHistory(organizationId);
      const burstAnalysis = this.humanBehavior.analyzeBurstPattern(messageHistory);
      
      return {
        queueLength,
        isProcessing,
        recentMessages: messageHistory.length,
        burstAnalysis,
        humanBehaviorStatus: this.humanBehavior.getStatus()
      };
    } catch (error) {
      logger.error('[EnhancedMessageQueueService] Error getting queue status:', error);
      return {
        error: error.message
      };
    }
  }
}

module.exports = EnhancedMessageQueueService;
