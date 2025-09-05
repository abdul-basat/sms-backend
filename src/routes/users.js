/**
 * Users Routes
 * Handle user management endpoints
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { jwtAuth, requireRole, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const userController = require('../controllers/userController');
const validationMiddleware = require('../middleware/validation');

const router = express.Router();

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().isString().withMessage('Search must be a string'),
  query('role').optional().isIn(['app_admin', 'school_admin', 'teacher', 'clerk']).withMessage('Invalid role filter'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(userController.getUsers)
);

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id', 
  [
    param('id').isString().withMessage('Valid user ID is required'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(userController.getUserById)
);

/**
 * PUT /api/users/:id
 * Update user profile
 */
router.put('/:id', 
  [
    param('id').isString().withMessage('Valid user ID is required'),
    body('firstName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be between 1 and 50 characters'),
    body('lastName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be between 1 and 50 characters'),
    body('email').optional().isEmail().withMessage('Please provide a valid email address'),
    body('phone').optional().matches(/^\+?[\d\s\-\(\)]+$/).withMessage('Please provide a valid phone number'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(userController.updateUser)
);

/**
 * DELETE /api/users/:id
 * Delete user
 */
router.delete('/:id', 
  [
    param('id').isString().withMessage('Valid user ID is required'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(userController.deleteUser)
);

/**
 * PUT /api/users/:id/role
 * Update user role
 */
router.put('/:id/role', 
  [
    param('id').isString().withMessage('Valid user ID is required'),
  body('role').isIn(['app_admin', 'school_admin', 'teacher', 'clerk']).withMessage('Invalid role'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(userController.updateUserRole)
);

module.exports = router;
