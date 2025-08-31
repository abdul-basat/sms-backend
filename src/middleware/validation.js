/**
 * Validation Middleware
 * Handles request validation using express-validator
 */

const { validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Validation middleware to check for validation errors
 */
const validationMiddleware = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
      location: error.location,
    }));

    // Create descriptive error message with field names
    const failedFields = formattedErrors.map(error => error.field).join(', ');
    const errorMessage = `Request validation failed: ${failedFields}`;

    return res.status(400).json({
      success: false,
      message: errorMessage,
      error: errorMessage,
      code: 'VALIDATION_ERROR',
      details: formattedErrors,
    });
  }

  next();
};

module.exports = validationMiddleware;
