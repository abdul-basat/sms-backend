const Redis = require('redis');

class RateLimitService {
  constructor() {
    this.redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    this.client = Redis.createClient({ url: this.redisUrl });
    this.connect();
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      await this.client.connect();
      console.log('🔗 Connected to Redis for rate limiting');
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
    }
  }

  /**
   * Check if message sending is allowed based on rate limiting rules
   * @param {Array} rateRules - Rate limiting rules from Firebase
   * @returns {Promise<Object>} - Rate limit check result
   */
  async checkRateLimits(rateRules) {
    try {
      if (!rateRules || rateRules.length === 0) {
        return { allowed: true, reason: 'No rate limiting rules configured' };
      }

      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

      for (const rule of rateRules) {
        const checkResult = await this.checkSingleRule(rule, currentHour, currentDay);
        if (!checkResult.allowed) {
          return checkResult;
        }
      }

      return { allowed: true, reason: 'All rate limits passed' };
      
    } catch (error) {
      console.error('❌ Rate limit check failed:', error.message);
      return { allowed: false, reason: 'Rate limit check error', error: error.message };
    }
  }

  /**
   * Check a single rate limiting rule
   * @param {Object} rule - Rate limiting rule
   * @param {number} currentHour - Current hour (0-23)
   * @param {number} currentDay - Current day (0-6)
   * @returns {Promise<Object>} - Rule check result
   */
  async checkSingleRule(rule, currentHour, currentDay) {
    try {
      // Check business hours
      if (rule.businessHours && rule.businessHours.enabled) {
        const { startHour, endHour, daysOfWeek } = rule.businessHours;
        
        // Check if current day is allowed
        if (daysOfWeek && !daysOfWeek.includes(currentDay)) {
          return {
            allowed: false,
            reason: `Outside business days. Allowed days: ${daysOfWeek.join(', ')}`
          };
        }

        // Check if current hour is within business hours
        if (currentHour < startHour || currentHour >= endHour) {
          return {
            allowed: false,
            reason: `Outside business hours. Allowed hours: ${startHour}:00 - ${endHour}:00`
          };
        }
      }

      // Check hourly limit
      if (rule.hourlyLimit && rule.hourlyLimit.enabled) {
        const hourlyKey = `rate_limit:hourly:${currentHour}:${new Date().toDateString()}`;
        const hourlyCount = await this.getCount(hourlyKey);
        
        if (hourlyCount >= rule.hourlyLimit.maxMessages) {
          return {
            allowed: false,
            reason: `Hourly limit exceeded. Limit: ${rule.hourlyLimit.maxMessages}, Current: ${hourlyCount}`
          };
        }
      }

      // Check daily limit
      if (rule.dailyLimit && rule.dailyLimit.enabled) {
        const dailyKey = `rate_limit:daily:${new Date().toDateString()}`;
        const dailyCount = await this.getCount(dailyKey);
        
        if (dailyCount >= rule.dailyLimit.maxMessages) {
          return {
            allowed: false,
            reason: `Daily limit exceeded. Limit: ${rule.dailyLimit.maxMessages}, Current: ${dailyCount}`
          };
        }
      }

      // Check delay between messages
      if (rule.delayBetweenMessages && rule.delayBetweenMessages.enabled) {
        const delayKey = `rate_limit:delay:last_message`;
        const lastMessageTime = await this.getLastMessageTime(delayKey);
        
        if (lastMessageTime) {
          const timeSinceLastMessage = Date.now() - lastMessageTime;
          const requiredDelay = rule.delayBetweenMessages.delaySeconds * 1000;
          
          if (timeSinceLastMessage < requiredDelay) {
            const remainingDelay = requiredDelay - timeSinceLastMessage;
            return {
              allowed: false,
              reason: `Delay between messages required. Wait ${Math.ceil(remainingDelay / 1000)} seconds`
            };
          }
        }
      }

      return { allowed: true, reason: 'Rule passed' };
      
    } catch (error) {
      console.error('❌ Single rule check failed:', error.message);
      return { allowed: false, reason: 'Rule check error', error: error.message };
    }
  }

  /**
   * Increment message count for rate limiting
   * @param {string} phoneNumber - Phone number
   */
  async incrementMessageCount(phoneNumber) {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      
      // Increment hourly count
      const hourlyKey = `rate_limit:hourly:${currentHour}:${now.toDateString()}`;
      await this.incrementCount(hourlyKey, 3600); // Expire in 1 hour
      
      // Increment daily count
      const dailyKey = `rate_limit:daily:${now.toDateString()}`;
      await this.incrementCount(dailyKey, 86400); // Expire in 24 hours
      
      // Update last message time
      const delayKey = `rate_limit:delay:last_message`;
      await this.setLastMessageTime(delayKey);
      
      console.log(`📊 Incremented message count for ${phoneNumber}`);
      
    } catch (error) {
      console.error('❌ Failed to increment message count:', error.message);
    }
  }

  /**
   * Get count from Redis
   * @param {string} key - Redis key
   * @returns {Promise<number>} - Count value
   */
  async getCount(key) {
    try {
      const value = await this.client.get(key);
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      console.error(`❌ Failed to get count for key ${key}:`, error.message);
      return 0;
    }
  }

  /**
   * Increment count in Redis
   * @param {string} key - Redis key
   * @param {number} expireSeconds - Expiration time in seconds
   * @returns {Promise<number>} - New count value
   */
  async incrementCount(key, expireSeconds) {
    try {
      const pipeline = this.client.multi();
      pipeline.incr(key);
      pipeline.expire(key, expireSeconds);
      const results = await pipeline.exec();
      return results[0];
    } catch (error) {
      console.error(`❌ Failed to increment count for key ${key}:`, error.message);
      return 0;
    }
  }

  /**
   * Get last message time from Redis
   * @param {string} key - Redis key
   * @returns {Promise<number|null>} - Last message timestamp
   */
  async getLastMessageTime(key) {
    try {
      const value = await this.client.get(key);
      return value ? parseInt(value, 10) : null;
    } catch (error) {
      console.error(`❌ Failed to get last message time for key ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Set last message time in Redis
   * @param {string} key - Redis key
   * @returns {Promise<void>}
   */
  async setLastMessageTime(key) {
    try {
      await this.client.set(key, Date.now().toString(), 'EX', 3600); // Expire in 1 hour
    } catch (error) {
      console.error(`❌ Failed to set last message time for key ${key}:`, error.message);
    }
  }

  /**
   * Get current rate limit statistics
   * @returns {Promise<Object>} - Rate limit statistics
   */
  async getRateLimitStats() {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      
      const hourlyKey = `rate_limit:hourly:${currentHour}:${now.toDateString()}`;
      const dailyKey = `rate_limit:daily:${now.toDateString()}`;
      
      const hourlyCount = await this.getCount(hourlyKey);
      const dailyCount = await this.getCount(dailyKey);
      
      return {
        hourlyCount,
        dailyCount,
        currentHour,
        currentDate: now.toDateString(),
        timestamp: now.toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to get rate limit stats:', error.message);
      return { hourlyCount: 0, dailyCount: 0, error: error.message };
    }
  }

  /**
   * Reset rate limit counters
   * @returns {Promise<void>}
   */
  async resetRateLimits() {
    try {
      const keys = await this.client.keys('rate_limit:*');
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🧹 Reset ${keys.length} rate limit keys`);
      }
    } catch (error) {
      console.error('❌ Failed to reset rate limits:', error.message);
    }
  }

  /**
   * Health check for Redis rate limiting
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      const isConnected = this.client.isReady;
      const stats = await this.getRateLimitStats();
      
      return {
        service: 'redis-rate-limit',
        connected: isConnected,
        redisUrl: this.redisUrl,
        stats: stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        service: 'redis-rate-limit',
        connected: false,
        redisUrl: this.redisUrl,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    try {
      await this.client.quit();
      console.log('🔌 Redis rate limit connection closed');
    } catch (error) {
      console.error('❌ Failed to close Redis connection:', error.message);
    }
  }
}

module.exports = RateLimitService;
