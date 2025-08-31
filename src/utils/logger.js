/**
 * Winston Logger Utility
 * Provides comprehensive logging for the Fees Manager WhatsApp Automation
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

class Logger {
  constructor() {
    this.logger = this.createLogger();
  }

  /**
   * Create Winston logger instance
   */
  createLogger() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Define log levels
    const levels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4
    };

    // Define colors for each level
    const colors = {
      error: 'red',
      warn: 'yellow',
      info: 'green',
      http: 'magenta',
      debug: 'white'
    };

    // Add colors to Winston
    winston.addColors(colors);

    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    // Define console format (for development)
    const consoleFormat = winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        
        return log;
      })
    );

    // Define file format
    const fileFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    // Create transports
    const transports = [];

    // Console transport (for development)
    if (process.env.NODE_ENV !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: consoleFormat,
          level: process.env.LOG_LEVEL || 'info'
        })
      );
    }

    // File transports
    transports.push(
      // Error log file
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      
      // Combined log file
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      
      // Automation specific log file
      new winston.transports.File({
        filename: path.join(logsDir, 'automation.log'),
        level: 'info',
        format: fileFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 10
      })
    );

    // Create logger instance
    const logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      levels,
      format: logFormat,
      transports,
      exitOnError: false
    });

    // Add custom methods
    this.addCustomMethods(logger);

    return logger;
  }

  /**
   * Add custom logging methods
   */
  addCustomMethods(logger) {
    // Automation specific logging
    logger.automation = (message, meta = {}) => {
      logger.info(message, { ...meta, category: 'automation' });
    };

    // WPPConnect specific logging
    logger.wppconnect = (message, meta = {}) => {
      logger.info(message, { ...meta, category: 'wppconnect' });
    };

    // Firebase specific logging
    logger.firebase = (message, meta = {}) => {
      logger.info(message, { ...meta, category: 'firebase' });
    };

    // Queue specific logging
    logger.queue = (message, meta = {}) => {
      logger.info(message, { ...meta, category: 'queue' });
    };

    // Rate limiting specific logging
    logger.rateLimit = (message, meta = {}) => {
      logger.info(message, { ...meta, category: 'rate-limit' });
    };

    // Health check logging
    logger.health = (message, meta = {}) => {
      logger.info(message, { ...meta, category: 'health' });
    };

    // Performance logging
    logger.performance = (message, meta = {}) => {
      logger.info(message, { ...meta, category: 'performance' });
    };

    // Security logging
    logger.security = (message, meta = {}) => {
      logger.warn(message, { ...meta, category: 'security' });
    };
  }

  /**
   * Log error with context
   */
  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  /**
   * Log warning with context
   */
  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  /**
   * Log info with context
   */
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  /**
   * Log debug with context
   */
  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  /**
   * Log HTTP requests
   */
  http(message, meta = {}) {
    this.logger.http(message, meta);
  }

  /**
   * Log automation events
   */
  automation(message, meta = {}) {
    this.logger.automation(message, meta);
  }

  /**
   * Log WPPConnect events
   */
  wppconnect(message, meta = {}) {
    this.logger.wppconnect(message, meta);
  }

  /**
   * Log Firebase events
   */
  firebase(message, meta = {}) {
    this.logger.firebase(message, meta);
  }

  /**
   * Log queue events
   */
  queue(message, meta = {}) {
    this.logger.queue(message, meta);
  }

  /**
   * Log rate limiting events
   */
  rateLimit(message, meta = {}) {
    this.logger.rateLimit(message, meta);
  }

  /**
   * Log health check events
   */
  health(message, meta = {}) {
    this.logger.health(message, meta);
  }

  /**
   * Log performance metrics
   */
  performance(message, meta = {}) {
    this.logger.performance(message, meta);
  }

  /**
   * Log security events
   */
  security(message, meta = {}) {
    this.logger.security(message, meta);
  }

  /**
   * Log with structured data
   */
  log(level, message, meta = {}) {
    this.logger.log(level, message, meta);
  }

  /**
   * Create child logger with additional context
   */
  child(meta = {}) {
    return this.logger.child(meta);
  }

  /**
   * Get logger statistics
   */
  getStats() {
    return {
      level: this.logger.level,
      transports: this.logger.transports.map(t => ({
        name: t.name,
        level: t.level
      })),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Set log level
   */
  setLevel(level) {
    this.logger.level = level;
  }

  /**
   * Add transport
   */
  addTransport(transport) {
    this.logger.add(transport);
  }

  /**
   * Remove transport
   */
  removeTransport(transport) {
    this.logger.remove(transport);
  }

  /**
   * Clear all transports
   */
  clear() {
    this.logger.clear();
  }

  /**
   * Close logger
   */
  close() {
    this.logger.close();
  }

  /**
   * Log startup information
   */
  logStartup() {
    this.info('🚀 Logger initialized', {
      level: this.logger.level,
      transports: this.logger.transports.length,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log shutdown information
   */
  logShutdown() {
    this.info('🛑 Logger shutting down', {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create performance timer
   */
  startTimer(label) {
    const start = Date.now();
    return {
      end: (meta = {}) => {
        const duration = Date.now() - start;
        this.performance(`${label} completed in ${duration}ms`, {
          ...meta,
          duration,
          label
        });
        return duration;
      }
    };
  }

  /**
   * Log memory usage
   */
  logMemoryUsage() {
    const usage = process.memoryUsage();
    this.performance('Memory usage', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`
    });
  }
}

// Create singleton instance
const logger = new Logger();

// Log startup
logger.logStartup();

// Handle process exit
process.on('exit', () => {
  logger.logShutdown();
});

module.exports = logger;
