/**
 * Redis Configuration
 * Manages Redis connection settings and queue parameters
 */

class RedisConfig {
  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment variables
   */
  loadConfig() {
    return {
      // Connection settings
      url: process.env.REDIS_URL || 'redis://redis:6379',
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || null,
      database: parseInt(process.env.REDIS_DATABASE) || 0,
      
      // Connection pool settings
      pool: {
        min: parseInt(process.env.REDIS_POOL_MIN) || 2,
        max: parseInt(process.env.REDIS_POOL_MAX) || 10,
        acquireTimeoutMillis: parseInt(process.env.REDIS_POOL_ACQUIRE_TIMEOUT) || 30000,
        createTimeoutMillis: parseInt(process.env.REDIS_POOL_CREATE_TIMEOUT) || 30000,
        destroyTimeoutMillis: parseInt(process.env.REDIS_POOL_DESTROY_TIMEOUT) || 5000,
        idleTimeoutMillis: parseInt(process.env.REDIS_POOL_IDLE_TIMEOUT) || 30000,
        reapIntervalMillis: parseInt(process.env.REDIS_POOL_REAP_INTERVAL) || 1000,
        createRetryIntervalMillis: parseInt(process.env.REDIS_POOL_CREATE_RETRY_INTERVAL) || 200
      },
      
      // Queue settings
      queue: {
        name: process.env.REDIS_QUEUE_NAME || 'whatsapp-messages',
        concurrency: parseInt(process.env.REDIS_QUEUE_CONCURRENCY) || 1,
        attempts: parseInt(process.env.REDIS_QUEUE_ATTEMPTS) || 3,
        backoffDelay: parseInt(process.env.REDIS_QUEUE_BACKOFF_DELAY) || 2000,
        removeOnComplete: parseInt(process.env.REDIS_QUEUE_REMOVE_ON_COMPLETE) || 100,
        removeOnFail: parseInt(process.env.REDIS_QUEUE_REMOVE_ON_FAIL) || 50,
        delayBetweenJobs: parseInt(process.env.REDIS_QUEUE_DELAY_BETWEEN_JOBS) || 2000
      },
      
      // Rate limiting settings
      rateLimit: {
        prefix: process.env.REDIS_RATE_LIMIT_PREFIX || 'rate_limit',
        defaultTTL: parseInt(process.env.REDIS_RATE_LIMIT_DEFAULT_TTL) || 3600, // 1 hour
        hourlyTTL: parseInt(process.env.REDIS_RATE_LIMIT_HOURLY_TTL) || 3600, // 1 hour
        dailyTTL: parseInt(process.env.REDIS_RATE_LIMIT_DAILY_TTL) || 86400, // 24 hours
        delayTTL: parseInt(process.env.REDIS_RATE_LIMIT_DELAY_TTL) || 3600 // 1 hour
      },
      
      // Caching settings
      cache: {
        prefix: process.env.REDIS_CACHE_PREFIX || 'cache',
        defaultTTL: parseInt(process.env.REDIS_CACHE_DEFAULT_TTL) || 300, // 5 minutes
        maxKeys: parseInt(process.env.REDIS_CACHE_MAX_KEYS) || 10000
      },
      
      // SSL/TLS settings
      ssl: {
        enabled: process.env.REDIS_SSL_ENABLED === 'true',
        ca: process.env.REDIS_SSL_CA || null,
        cert: process.env.REDIS_SSL_CERT || null,
        key: process.env.REDIS_SSL_KEY || null,
        rejectUnauthorized: process.env.REDIS_SSL_REJECT_UNAUTHORIZED !== 'false'
      },
      
      // Retry settings
      retry: {
        maxAttempts: parseInt(process.env.REDIS_RETRY_MAX_ATTEMPTS) || 3,
        delay: parseInt(process.env.REDIS_RETRY_DELAY) || 1000,
        backoffMultiplier: parseFloat(process.env.REDIS_RETRY_BACKOFF_MULTIPLIER) || 2
      },
      
      // Monitoring settings
      monitoring: {
        enabled: process.env.REDIS_MONITORING_ENABLED !== 'false', // Default true
        interval: parseInt(process.env.REDIS_MONITORING_INTERVAL) || 60000, // 1 minute
        timeout: parseInt(process.env.REDIS_MONITORING_TIMEOUT) || 5000 // 5 seconds
      }
    };
  }

  /**
   * Get Redis URL
   */
  getUrl() {
    return this.config.url;
  }

  /**
   * Get Redis host
   */
  getHost() {
    return this.config.host;
  }

  /**
   * Get Redis port
   */
  getPort() {
    return this.config.port;
  }

  /**
   * Get Redis password
   */
  getPassword() {
    return this.config.password;
  }

  /**
   * Get Redis database number
   */
  getDatabase() {
    return this.config.database;
  }

  /**
   * Get connection pool settings
   */
  getPoolSettings() {
    return this.config.pool;
  }

  /**
   * Get queue settings
   */
  getQueueSettings() {
    return this.config.queue;
  }

  /**
   * Get rate limiting settings
   */
  getRateLimitSettings() {
    return this.config.rateLimit;
  }

  /**
   * Get cache settings
   */
  getCacheSettings() {
    return this.config.cache;
  }

  /**
   * Get SSL settings
   */
  getSSLSettings() {
    return this.config.ssl;
  }

  /**
   * Check if SSL is enabled
   */
  isSSLEnabled() {
    return this.config.ssl.enabled;
  }

  /**
   * Get retry settings
   */
  getRetrySettings() {
    return this.config.retry;
  }

  /**
   * Get monitoring settings
   */
  getMonitoringSettings() {
    return this.config.monitoring;
  }

  /**
   * Check if monitoring is enabled
   */
  isMonitoringEnabled() {
    return this.config.monitoring.enabled;
  }

  /**
   * Get Redis client options
   */
  getClientOptions() {
    const options = {
      host: this.config.host,
      port: this.config.port,
      db: this.config.database,
      retryDelayOnFailover: this.config.retry.delay,
      maxRetriesPerRequest: this.config.retry.maxAttempts,
      enableReadyCheck: true,
      maxLoadingTimeout: 10000,
      lazyConnect: true
    };

    // Add password if provided
    if (this.config.password) {
      options.password = this.config.password;
    }

    // Add SSL settings if enabled
    if (this.config.ssl.enabled) {
      options.tls = {
        ca: this.config.ssl.ca,
        cert: this.config.ssl.cert,
        key: this.config.ssl.key,
        rejectUnauthorized: this.config.ssl.rejectUnauthorized
      };
    }

    return options;
  }

  /**
   * Get Bull queue options
   */
  getBullQueueOptions() {
    return {
      redis: this.config.url,
      defaultJobOptions: {
        attempts: this.config.queue.attempts,
        backoff: {
          type: 'exponential',
          delay: this.config.queue.backoffDelay
        },
        removeOnComplete: this.config.queue.removeOnComplete,
        removeOnFail: this.config.queue.removeOnFail,
        delay: this.config.queue.delayBetweenJobs
      }
    };
  }

  /**
   * Get rate limit key
   * @param {string} type - Rate limit type (hourly, daily, delay)
   * @param {string} identifier - Unique identifier
   * @returns {string} - Rate limit key
   */
  getRateLimitKey(type, identifier) {
    return `${this.config.rateLimit.prefix}:${type}:${identifier}`;
  }

  /**
   * Get cache key
   * @param {string} identifier - Cache identifier
   * @returns {string} - Cache key
   */
  getCacheKey(identifier) {
    return `${this.config.cache.prefix}:${identifier}`;
  }

  /**
   * Get queue name
   */
  getQueueName() {
    return this.config.queue.name;
  }

  /**
   * Get queue concurrency
   */
  getQueueConcurrency() {
    return this.config.queue.concurrency;
  }

  /**
   * Get queue attempts
   */
  getQueueAttempts() {
    return this.config.queue.attempts;
  }

  /**
   * Get queue backoff delay
   */
  getQueueBackoffDelay() {
    return this.config.queue.backoffDelay;
  }

  /**
   * Get queue remove on complete count
   */
  getQueueRemoveOnComplete() {
    return this.config.queue.removeOnComplete;
  }

  /**
   * Get queue remove on fail count
   */
  getQueueRemoveOnFail() {
    return this.config.queue.removeOnFail;
  }

  /**
   * Get queue delay between jobs
   */
  getQueueDelayBetweenJobs() {
    return this.config.queue.delayBetweenJobs;
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];

    if (!this.config.host) {
      errors.push('REDIS_HOST is required');
    }

    if (this.config.port < 1 || this.config.port > 65535) {
      errors.push('REDIS_PORT must be between 1 and 65535');
    }

    if (this.config.database < 0 || this.config.database > 15) {
      errors.push('REDIS_DATABASE must be between 0 and 15');
    }

    if (this.config.pool.min < 1) {
      errors.push('REDIS_POOL_MIN must be at least 1');
    }

    if (this.config.pool.max < this.config.pool.min) {
      errors.push('REDIS_POOL_MAX must be greater than or equal to REDIS_POOL_MIN');
    }

    if (this.config.queue.concurrency < 1) {
      errors.push('REDIS_QUEUE_CONCURRENCY must be at least 1');
    }

    if (this.config.queue.attempts < 1) {
      errors.push('REDIS_QUEUE_ATTEMPTS must be at least 1');
    }

    if (this.config.retry.maxAttempts < 1) {
      errors.push('REDIS_RETRY_MAX_ATTEMPTS must be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration summary (without sensitive data)
   */
  getSummary() {
    return {
      url: this.config.url,
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      pool: this.config.pool,
      queue: this.config.queue,
      rateLimit: this.config.rateLimit,
      cache: this.config.cache,
      ssl: {
        enabled: this.config.ssl.enabled,
        rejectUnauthorized: this.config.ssl.rejectUnauthorized
      },
      retry: this.config.retry,
      monitoring: this.config.monitoring
    };
  }

  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   */
  updateConfig(updates) {
    Object.assign(this.config, updates);
    console.log('🔄 Redis configuration updated');
  }

  /**
   * Get environment variables template
   */
  getEnvironmentTemplate() {
    return {
      REDIS_URL: 'redis://redis:6379',
      REDIS_HOST: 'redis',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: '',
      REDIS_DATABASE: '0',
      REDIS_POOL_MIN: '2',
      REDIS_POOL_MAX: '10',
      REDIS_POOL_ACQUIRE_TIMEOUT: '30000',
      REDIS_POOL_CREATE_TIMEOUT: '30000',
      REDIS_POOL_DESTROY_TIMEOUT: '5000',
      REDIS_POOL_IDLE_TIMEOUT: '30000',
      REDIS_POOL_REAP_INTERVAL: '1000',
      REDIS_POOL_CREATE_RETRY_INTERVAL: '200',
      REDIS_QUEUE_NAME: 'whatsapp-messages',
      REDIS_QUEUE_CONCURRENCY: '1',
      REDIS_QUEUE_ATTEMPTS: '3',
      REDIS_QUEUE_BACKOFF_DELAY: '2000',
      REDIS_QUEUE_REMOVE_ON_COMPLETE: '100',
      REDIS_QUEUE_REMOVE_ON_FAIL: '50',
      REDIS_QUEUE_DELAY_BETWEEN_JOBS: '2000',
      REDIS_RATE_LIMIT_PREFIX: 'rate_limit',
      REDIS_RATE_LIMIT_DEFAULT_TTL: '3600',
      REDIS_RATE_LIMIT_HOURLY_TTL: '3600',
      REDIS_RATE_LIMIT_DAILY_TTL: '86400',
      REDIS_RATE_LIMIT_DELAY_TTL: '3600',
      REDIS_CACHE_PREFIX: 'cache',
      REDIS_CACHE_DEFAULT_TTL: '300',
      REDIS_CACHE_MAX_KEYS: '10000',
      REDIS_SSL_ENABLED: 'false',
      REDIS_SSL_CA: '',
      REDIS_SSL_CERT: '',
      REDIS_SSL_KEY: '',
      REDIS_SSL_REJECT_UNAUTHORIZED: 'true',
      REDIS_RETRY_MAX_ATTEMPTS: '3',
      REDIS_RETRY_DELAY: '1000',
      REDIS_RETRY_BACKOFF_MULTIPLIER: '2',
      REDIS_MONITORING_ENABLED: 'true',
      REDIS_MONITORING_INTERVAL: '60000',
      REDIS_MONITORING_TIMEOUT: '5000'
    };
  }
}

// Create singleton instance
const redisConfig = new RedisConfig();

/**
 * Connect to Redis
 */
async function connectRedis() {
  try {
    const redis = require('redis');
    
    // Get configuration values
    const url = redisConfig.getUrl();
    const host = redisConfig.getHost();
    const port = redisConfig.getPort();
    const password = redisConfig.getPassword();
    const database = redisConfig.getDatabase();
    
    // Create Redis client with fallback configuration
    const client = redis.createClient({
      url: url || `redis://${host}:${port}`,
      password: password || undefined,
      database: database || 0,
    });

    // Handle connection events
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('Redis Client Connected');
    });

    client.on('ready', () => {
      console.log('Redis Client Ready');
    });

    // Connect to Redis
    await client.connect();
    
    // Store globally for access across modules
    global.redisClient = client;
    
    console.log('Redis connected successfully');
    return client;

  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    // Don't throw error - Redis is optional for basic functionality
    console.warn('Continuing without Redis...');
    return null;
  }
}

/**
 * Get Redis client instance
 */
function getRedisClient() {
  return global.redisClient;
}

module.exports = {
  config: redisConfig,
  connectRedis,
  getRedisClient
};
