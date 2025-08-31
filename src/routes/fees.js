/**
 * Fees Routes
 * Handle fee management endpoints
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { jwtAuth } = require('../middleware/auth');
const validationMiddleware = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getFees,
  getFeeById,
  createFee,
  updateFee,
  deleteFee
} = require('../controllers/feeController');

const router = express.Router();

// Validation middleware for fee creation
const validateFeeCreation = [
  body('studentId')
    .notEmpty()
    .withMessage('Student ID is required')
    .isString()
    .withMessage('Student ID must be a string'),
  body('type')
    .notEmpty()
    .withMessage('Fee type is required')
    .isIn(['monthly', 'quarterly', 'annually', 'one-time'])
    .withMessage('Fee type must be monthly, quarterly, annually, or one-time'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('month')
    .notEmpty()
    .withMessage('Month is required')
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Month must be in YYYY-MM format'),
  body('dueDate')
    .notEmpty()
    .withMessage('Due date is required')
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('category')
    .optional()
    .isIn(['tuition', 'books', 'transport', 'uniform', 'exam', 'library', 'sports', 'other'])
    .withMessage('Invalid category'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be a string with max 500 characters')
];

// Validation middleware for fee updates
const validateFeeUpdate = [
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('status')
    .optional()
    .isIn(['pending', 'paid', 'overdue', 'waived', 'partial'])
    .withMessage('Status must be pending, paid, overdue, waived, or partial'),
  body('paidAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Paid amount must be a positive number'),
  body('paymentMethod')
    .optional()
    .isString()
    .withMessage('Payment method must be a string'),
  body('transactionId')
    .optional()
    .isString()
    .withMessage('Transaction ID must be a string'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be a string with max 500 characters'),
  body('paidDate')
    .optional()
    .isISO8601()
    .withMessage('Paid date must be a valid date')
];

// Validation middleware for query parameters
const validateFeeQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Search must be a string with max 100 characters'),
  query('status')
    .optional()
    .isIn(['pending', 'paid', 'overdue', 'waived', 'partial'])
    .withMessage('Status must be pending, paid, overdue, waived, or partial'),
  query('month')
    .optional()
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Month must be in YYYY-MM format'),
  query('studentId')
    .optional()
    .isString()
    .withMessage('Student ID must be a string'),
  query('type')
    .optional()
    .isIn(['monthly', 'quarterly', 'annually', 'one-time'])
    .withMessage('Type must be monthly, quarterly, annually, or one-time')
];

// Validation middleware for fee ID parameter
const validateFeeId = [
  param('id')
    .notEmpty()
    .withMessage('Fee ID is required')
    .isString()
    .withMessage('Fee ID must be a string')
];

// GET /api/fees - Get fees with pagination and filtering
router.get('/', 
  jwtAuth,
  validateFeeQuery,
  validationMiddleware,
  asyncHandler(getFees)
);

// GET /api/fees/:id - Get fee by ID
router.get('/:id', 
  jwtAuth,
  validateFeeId,
  validationMiddleware,
  asyncHandler(getFeeById)
);

// POST /api/fees - Create new fee
router.post('/', 
  jwtAuth,
  validateFeeCreation,
  validationMiddleware,
  asyncHandler(createFee)
);

// PUT /api/fees/:id - Update fee
router.put('/:id', 
  jwtAuth,
  validateFeeId,
  validateFeeUpdate,
  validationMiddleware,
  asyncHandler(updateFee)
);

// DELETE /api/fees/:id - Delete fee
router.delete('/:id', 
  jwtAuth,
  validateFeeId,
  validationMiddleware,
  asyncHandler(deleteFee)
);

module.exports = router;
