/**
 * Error Handling Middleware
 * Centralized error handling for the entire application
 */

const logger = require('../utils/logger');

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 */
const errorHandler = (error, req, res, next) => {
  let err = { ...error };
  err.message = error.message;

  // Log error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user ? req.user.email : 'anonymous',
  });

  // Default error values
  let message = 'Internal Server Error';
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.isOperational) {
    // Operational errors (custom AppError)
    message = err.message;
    statusCode = err.statusCode;
    code = err.code || 'APP_ERROR';
  } else if (err.name === 'ValidationError') {
    // Joi validation errors
    message = 'Validation Error';
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    
    // Extract validation details
    const details = err.details?.map(detail => ({
      field: detail.path?.join('.'),
      message: detail.message,
    })) || [];
    
    return res.status(statusCode).json({
      success: false,
      error: message,
      code,
      details,
    });
  } else if (err.code === 11000) {
    // MongoDB duplicate key error
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value for field: ${field}`;
    statusCode = 400;
    code = 'DUPLICATE_ERROR';
  } else if (err.name === 'CastError') {
    // MongoDB cast error
    message = 'Invalid ID format';
    statusCode = 400;
    code = 'INVALID_ID';
  } else if (err.name === 'JsonWebTokenError') {
    // JWT errors
    message = 'Invalid token';
    statusCode = 401;
    code = 'INVALID_TOKEN';
  } else if (err.name === 'TokenExpiredError') {
    // JWT expired
    message = 'Token expired';
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
  } else if (err.code === 'ECONNREFUSED') {
    // Connection refused (database, redis, etc.)
    message = 'Service temporarily unavailable';
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
  } else if (err.type === 'entity.too.large') {
    // Request too large
    message = 'Request entity too large';
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
  }

  // Firebase errors
  if (err.code && err.code.startsWith('auth/')) {
    statusCode = 401;
    code = 'AUTH_ERROR';
    
    switch (err.code) {
      case 'auth/id-token-expired':
        message = 'Authentication token expired';
        code = 'TOKEN_EXPIRED';
        break;
      case 'auth/id-token-revoked':
        message = 'Authentication token revoked';
        code = 'TOKEN_REVOKED';
        break;
      case 'auth/invalid-id-token':
        message = 'Invalid authentication token';
        code = 'INVALID_TOKEN';
        break;
      default:
        message = 'Authentication error';
    }
  }

  // Rate limiting errors
  if (err.type === 'rate-limit') {
    message = 'Too many requests, please try again later';
    statusCode = 429;
    code = 'RATE_LIMIT_EXCEEDED';
  }

  // Send error response
  const response = {
    success: false,
    error: message,
    code,
  };

  // Include additional error details in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = err;
  }

  res.status(statusCode).json(response);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Resource not found: ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(error);
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
};
