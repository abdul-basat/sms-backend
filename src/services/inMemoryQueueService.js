/**
 * In-Memory Queue Service
 * Fallback implementation when Redis is not available
 */

const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class InMemoryQueueService {
  constructor() {
    this.queues = new Map(); // organizationId -> array of messages
    this.priorityQueues = new Map(); // organizationId -> array of high priority messages
    this.processingStatus = new Map(); // organizationId -> boolean
    this.isConnected = true; // Always connected for in-memory
  }

  async connect() {
    logger.info('[InMemoryQueueService] Using in-memory queue (Redis not available)');
    return true;
  }

  async disconnect() {
    this.queues.clear();
    this.priorityQueues.clear();
    this.processingStatus.clear();
    return true;
  }

  async lPush(key, value) {
    const queueName = key.split(':').pop(); // Extract queue name
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    this.queues.get(queueName).unshift(value);
    return this.queues.get(queueName).length;
  }

  async rPop(key) {
    const queueName = key.split(':').pop();
    if (!this.queues.has(queueName) || this.queues.get(queueName).length === 0) {
      return null;
    }
    return this.queues.get(queueName).pop();
  }

  async lLen(key) {
    const queueName = key.split(':').pop();
    if (!this.queues.has(queueName)) {
      return 0;
    }
    return this.queues.get(queueName).length;
  }

  async lRange(key, start, stop) {
    const queueName = key.split(':').pop();
    if (!this.queues.has(queueName)) {
      return [];
    }
    const queue = this.queues.get(queueName);
    if (stop === -1) stop = queue.length - 1;
    return queue.slice(start, stop + 1);
  }

  async del(key) {
    const queueName = key.split(':').pop();
    this.queues.delete(queueName);
    return 1;
  }

  async exists(key) {
    const queueName = key.split(':').pop();
    return this.queues.has(queueName) ? 1 : 0;
  }

  async set(key, value, options) {
    // Simple key-value storage
    if (!this.queues.has('_keyvalue')) {
      this.queues.set('_keyvalue', new Map());
    }
    this.queues.get('_keyvalue').set(key, value);
    return 'OK';
  }

  async get(key) {
    if (!this.queues.has('_keyvalue')) {
      return null;
    }
    return this.queues.get('_keyvalue').get(key) || null;
  }

  async incr(key) {
    const current = parseInt(await this.get(key)) || 0;
    await this.set(key, current + 1);
    return current + 1;
  }

  async expire(key, seconds) {
    // Simple implementation - would need proper TTL in production
    setTimeout(() => {
      if (this.queues.has('_keyvalue')) {
        this.queues.get('_keyvalue').delete(key);
      }
    }, seconds * 1000);
    return 1;
  }

  // Redis client compatibility methods
  async quit() {
    return this.disconnect();
  }

  on(event, handler) {
    // Mock event handler for Redis client compatibility
    if (event === 'error') {
      // Store error handler if needed
    }
  }
}

module.exports = InMemoryQueueService;
