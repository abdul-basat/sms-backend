const Queue = require('bull');
const AutomatedFeeNotificationsService = require('./automatedFeeNotificationsService');

class QueueService {
  constructor() {
    this.redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    this.messageQueue = new Queue('whatsapp-messages', this.redisUrl);
    // Note: FeeNotificationsService is instantiated here to access config.
    // In a larger app, a dependency injection container would be better.
    this.feeNotificationsService = new AutomatedFeeNotificationsService();
    this.setupProcessors();
  }

  /**
   * Setup queue processors and event handlers
   */
  setupProcessors() {
    // Process messages from the queue
    this.messageQueue.process(async (job) => {
      const { organizationId, phoneNumber, message, studentName } = job.data;
      
      console.log(`🔄 Processing message for ${studentName} (${phoneNumber})`);
      
      try {
        // Import WPPConnect client here to avoid circular dependencies
        const WPPConnectClient = require('./wppconnectClient');
        const wppconnectClient = new WPPConnectClient();
        
        // Send message via WPPConnect
        const result = await wppconnectClient.sendMessageWithRetry(phoneNumber, message);
        
        console.log(`✅ Message processed successfully for ${studentName}`);
        
        // Log success to Firebase
        await this.logSuccess(job.data);

        // --- NEW: Implement randomized delay after sending ---
        const config = await this.feeNotificationsService.getReminderConfiguration(organizationId);
        const minDelay = (config.minDelaySeconds || 1) * 1000;
        const maxDelay = (config.maxDelaySeconds || 5) * 1000;
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

        console.log(`[QueueService] Waiting for ${randomDelay}ms before next job...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
        // --- END NEW ---
        
        return result;
        
      } catch (error) {
        console.error(`❌ Failed to process message for ${studentName}:`, error.message);
        
        // Log failure to Firebase
        await this.logFailure(job.data, error.message);
        
        throw error; // This will trigger retry
      }
    });

    // Handle completed jobs
    this.messageQueue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed successfully for ${job.data.studentName}`);
    });

    // Handle failed jobs
    this.messageQueue.on('failed', async (job, err) => {
      console.error(`💥 Job ${job.id} failed after ${job.attemptsMade} attempts for ${job.data.studentName}:`, err.message);
      
      // If all retries exhausted, log final failure
      if (job.attemptsMade >= job.opts.attempts) {
        await this.logFinalFailure(job.data, err.message);
      }
    });

    // Handle stalled jobs
    this.messageQueue.on('stalled', (job) => {
      console.warn(`⚠️ Job ${job.id} stalled for ${job.data.studentName}`);
    });

    // Handle waiting jobs
    this.messageQueue.on('waiting', (job) => {
      console.log(`⏳ Job ${job.id} waiting in queue for ${job.data.studentName}`);
    });

    // Handle active jobs
    this.messageQueue.on('active', (job) => {
      console.log(`🔄 Job ${job.id} started processing for ${job.data.studentName}`);
    });
  }

  /**
   * Add a message to the queue
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} - Job object
   */
  async addMessage(messageData) {
    try {
      const job = await this.messageQueue.add(messageData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        delay: this.calculateDelay(messageData) // Add delay between messages
      });

      console.log(`📥 Added message to queue for ${messageData.studentName} (Job ID: ${job.id})`);
      return job;
      
    } catch (error) {
      console.error(`❌ Failed to add message to queue for ${messageData.studentName}:`, error.message);
      throw error;
    }
  }

  /**
   * Schedule a message to be sent at a later time
   * @param {Object} messageData - Message data
   * @param {number} delay - Delay in milliseconds
   * @returns {Promise<Object>} - Job object
   */
  async scheduleMessage(messageData, delay) {
    try {
      const job = await this.messageQueue.add(messageData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
        delay: delay
      });

      console.log(`Scheduled message for ${messageData.studentName} with delay ${delay}ms (Job ID: ${job.id})`);
      return job;

    } catch (error) {
      console.error(`Failed to schedule message for ${messageData.studentName}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate delay for message sending (rate limiting)
   * @param {Object} messageData - Message data
   * @returns {number} - Delay in milliseconds
   */
  calculateDelay(messageData) {
    // Default delay between messages (2 seconds)
    const baseDelay = 2000;
    
    // You can implement more sophisticated rate limiting here
    // For example, based on time of day, message priority, etc.
    
    return baseDelay;
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} - Queue statistics
   */
  async getQueueStats() {
    try {
      const waiting = await this.messageQueue.getWaiting();
      const active = await this.messageQueue.getActive();
      const completed = await this.messageQueue.getCompleted();
      const failed = await this.messageQueue.getFailed();
      const delayed = await this.messageQueue.getDelayed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length
      };
      
    } catch (error) {
      console.error('❌ Failed to get queue stats:', error.message);
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0 };
    }
  }

  /**
   * Clear all jobs from the queue
   * @returns {Promise<void>}
   */
  async clearQueue() {
    try {
      await this.messageQueue.empty();
      console.log('🧹 Cleared all jobs from queue');
    } catch (error) {
      console.error('❌ Failed to clear queue:', error.message);
      throw error;
    }
  }

  /**
   * Pause the queue
   * @returns {Promise<void>}
   */
  async pauseQueue() {
    try {
      await this.messageQueue.pause();
      console.log('⏸️ Queue paused');
    } catch (error) {
      console.error('❌ Failed to pause queue:', error.message);
      throw error;
    }
  }

  /**
   * Resume the queue
   * @returns {Promise<void>}
   */
  async resumeQueue() {
    try {
      await this.messageQueue.resume();
      console.log('▶️ Queue resumed');
    } catch (error) {
      console.error('❌ Failed to resume queue:', error.message);
      throw error;
    }
  }

  /**
   * Log successful message delivery
   * @param {Object} messageData - Message data
   */
  async logSuccess(messageData) {
    try {
      const FirebaseService = require('./firebaseService');
      const firebaseService = new FirebaseService();
      await firebaseService.logMessageDelivery(messageData, 'success');
    } catch (error) {
      console.error('❌ Failed to log success:', error.message);
    }
  }

  /**
   * Log failed message delivery
   * @param {Object} messageData - Message data
   * @param {string} error - Error message
   */
  async logFailure(messageData, error) {
    try {
      const FirebaseService = require('./firebaseService');
      const firebaseService = new FirebaseService();
      await firebaseService.logMessageDelivery(messageData, 'failed', error);
    } catch (error) {
      console.error('❌ Failed to log failure:', error.message);
    }
  }

  /**
   * Log final failure after all retries exhausted
   * @param {Object} messageData - Message data
   * @param {string} error - Error message
   */
  async logFinalFailure(messageData, error) {
    try {
      const FirebaseService = require('./firebaseService');
      const firebaseService = new FirebaseService();
      await firebaseService.logMessageDelivery(messageData, 'final_failure', error);
      console.error(`💀 Final failure logged for ${messageData.studentName}: ${error}`);
    } catch (error) {
      console.error('❌ Failed to log final failure:', error.message);
    }
  }

  /**
   * Health check for Redis queue
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      const stats = await this.getQueueStats();
      
      return {
        service: 'redis-queue',
        connected: true,
        redisUrl: this.redisUrl,
        stats: stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        service: 'redis-queue',
        connected: false,
        redisUrl: this.redisUrl,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Close the queue connection
   */
  async close() {
    try {
      await this.messageQueue.close();
      console.log('🔌 Queue connection closed');
    } catch (error) {
      console.error('❌ Failed to close queue connection:', error.message);
    }
  }
}

module.exports = QueueService;
