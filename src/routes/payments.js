/**
 * Payment Routes (Phase 5)
 * Handles payment transaction and installment plan routes
 */

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');

const { 
  createPaymentTransaction,
  getPaymentTransactions,
  getPaymentTransactionById,
  createInstallmentPlan,
  getInstallmentPlans
} = require('../controllers/paymentController');

const { jwtAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const validationMiddleware = require('../middleware/validation');

// Installment Plan Routes - MUST COME BEFORE /:id routes

/**
 * @route   POST /api/payments/installments
 * @desc    Create a new installment plan
 * @access  Private (school_admin, clerk)
 */
router.post('/installments',
  jwtAuth,
  [
    body('feeId').notEmpty().withMessage('Fee ID is required'),
    body('numberOfInstallments').isInt({ min: 2, max: 12 }).withMessage('Number of installments must be between 2 and 12'),
    body('installmentAmount').isFloat({ min: 0.01 }).withMessage('Installment amount must be a positive number'),
    body('startDate').isISO8601().withMessage('Invalid start date format'),
    body('frequency').optional().isIn(['weekly', 'monthly', 'quarterly']).withMessage('Invalid frequency'),
    body('description').optional().isString().withMessage('Description must be a string')
  ],
  validationMiddleware,
  asyncHandler(createInstallmentPlan)
);

/**
 * @route   GET /api/payments/installments
 * @desc    Get all installment plans with filters
 * @access  Private (school_admin, teacher, clerk)
 */
router.get('/installments',
  jwtAuth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('studentId').optional().isString().withMessage('Student ID must be a string'),
    query('feeId').optional().isString().withMessage('Fee ID must be a string'),
    query('status').optional().isIn(['active', 'completed', 'cancelled']).withMessage('Invalid status')
  ],
  validationMiddleware,
  asyncHandler(getInstallmentPlans)
);

// Payment Transaction Routes

/**
 * @route   POST /api/payments
 * @desc    Create a new payment transaction
 * @access  Private (school_admin, clerk)
 */
router.post('/',
  jwtAuth,
  [
    body('feeId').notEmpty().withMessage('Fee ID is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('paymentMethod').isIn(['cash', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'cheque', 'upi', 'other']).withMessage('Invalid payment method'),
    body('transactionId').optional().isString().withMessage('Transaction ID must be a string'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
    body('paymentDate').optional().isISO8601().withMessage('Invalid payment date format')
  ],
  validationMiddleware,
  asyncHandler(createPaymentTransaction)
);

/**
 * @route   GET /api/payments
 * @desc    Get all payment transactions with filters
 * @access  Private (school_admin, teacher, clerk)
 */
router.get('/',
  jwtAuth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('studentId').optional().isString().withMessage('Student ID must be a string'),
    query('feeId').optional().isString().withMessage('Fee ID must be a string'),
    query('paymentMethod').optional().isIn(['cash', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'cheque', 'upi', 'other']).withMessage('Invalid payment method'),
    query('fromDate').optional().isISO8601().withMessage('Invalid from date format'),
    query('toDate').optional().isISO8601().withMessage('Invalid to date format')
  ],
  validationMiddleware,
  asyncHandler(getPaymentTransactions)
);

/**
 * @route   GET /api/payments/:id
 * @desc    Get payment transaction by ID
 * @access  Private (school_admin, teacher, clerk)
 */
router.get('/:id',
  jwtAuth,
  asyncHandler(getPaymentTransactionById)
);

module.exports = router;
