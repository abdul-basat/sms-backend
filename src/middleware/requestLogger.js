/**
 * Request Logging Middleware
 * Logs all incoming HTTP requests with performance metrics
 */

const logger = require('../utils/logger');

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  // Capture response body size and status
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    const contentLength = data ? Buffer.byteLength(data, 'utf8') : 0;

    // Log request details
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: `${contentLength}b`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      user: req.user ? req.user.email : 'anonymous',
      timestamp: new Date().toISOString(),
    };

    // Add query parameters if present
    if (Object.keys(req.query).length > 0) {
      logData.query = req.query;
    }

    // Add organization context if available
    if (req.organizationId) {
      logData.organizationId = req.organizationId;
    }

    // Determine log level based on status code
    if (res.statusCode >= 500) {
      logger.error('Request completed with error:', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error:', logData);
    } else if (responseTime > 1000) {
      logger.warn('Slow request completed:', logData);
    } else {
      logger.info('Request completed:', logData);
    }

    // Call original send method
    originalSend.call(this, data);
  };

  next();
};

/**
 * Enhanced request logger with additional metrics
 */
const detailedRequestLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const startDate = new Date();

  // Store original methods
  const originalSend = res.send;
  const originalJson = res.json;

  let responseBody;
  let responseSize = 0;

  // Override send method
  res.send = function(data) {
    if (!res.headersSent) {
      responseBody = data;
      responseSize = data ? Buffer.byteLength(data, 'utf8') : 0;
      logRequest();
    }
    return originalSend.call(this, data);
  };

  // Override json method
  res.json = function(data) {
    if (!res.headersSent) {
      responseBody = JSON.stringify(data);
      responseSize = responseBody ? Buffer.byteLength(responseBody, 'utf8') : 0;
      logRequest();
    }
    return originalJson.call(this, data);
  };

  function logRequest() {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    const logData = {
      timestamp: startDate.toISOString(),
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
      responseSize: `${responseSize}b`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      contentType: req.get('Content-Type'),
      accept: req.get('Accept'),
      user: req.user ? {
        uid: req.user.uid,
        email: req.user.email,
        role: req.user.role,
        organizationId: req.user.organizationId,
      } : null,
    };

    // Add request body size for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.get('Content-Length')) {
      logData.requestSize = `${req.get('Content-Length')}b`;
    }

    // Add query parameters if present (exclude sensitive data)
    if (Object.keys(req.query).length > 0) {
      const sanitizedQuery = { ...req.query };
      // Remove sensitive query parameters
      delete sanitizedQuery.password;
      delete sanitizedQuery.token;
      delete sanitizedQuery.secret;
      
      if (Object.keys(sanitizedQuery).length > 0) {
        logData.query = sanitizedQuery;
      }
    }

    // Performance warnings
    const performanceData = {};
    if (duration > 5000) {
      performanceData.warning = 'VERY_SLOW_REQUEST';
    } else if (duration > 2000) {
      performanceData.warning = 'SLOW_REQUEST';
    }

    if (responseSize > 1048576) { // 1MB
      performanceData.largeSizeWarning = 'LARGE_RESPONSE';
    }

    if (Object.keys(performanceData).length > 0) {
      logData.performance = performanceData;
    }

    // Log with appropriate level
    if (res.statusCode >= 500) {
      logger.error('HTTP Request - Server Error:', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Request - Client Error:', logData);
    } else if (duration > 2000) {
      logger.warn('HTTP Request - Slow:', logData);
    } else {
      logger.info('HTTP Request:', logData);
    }
  }

  next();
};

/**
 * Skip logging for certain routes (health checks, etc.)
 */
const skipLogRoutes = ['/api/health', '/favicon.ico'];

const conditionalLogger = (req, res, next) => {
  if (skipLogRoutes.includes(req.path)) {
    return next();
  }
  
  return requestLogger(req, res, next);
};

module.exports = {
  requestLogger,
  detailedRequestLogger,
  conditionalLogger,
};
