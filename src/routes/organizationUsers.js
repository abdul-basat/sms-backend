/**
 * Organization User Routes
 * Handle organization user management endpoints
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { auth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const organizationUserController = require('../controllers/organizationUserController');
const validationMiddleware = require('../middleware/validation');

const router = express.Router();

/**
 * POST /api/organization/users
 * Create a new user account for the organization
 */
router.post('/', 
  [
    body('email').isEmail().withMessage('Please provide a valid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('displayName').trim().isLength({ min: 1, max: 100 }).withMessage('Display name must be between 1 and 100 characters'),
    body('role').isIn(['teacher', 'clerk', 'school_admin']).withMessage('Role must be teacher, clerk, or school_admin'),
    body('mobileNumber').optional().matches(/^\+?[\d\s\-\(\)]+$/).withMessage('Please provide a valid mobile number'),
    body('assignedClasses').optional().isArray().withMessage('Assigned classes must be an array'),
    body('assignedModules').optional().isArray().withMessage('Assigned modules must be an array'),
    validationMiddleware,
  ],
  auth,
  requireRole(['school_admin', 'app_admin']),
  asyncHandler(organizationUserController.createOrganizationUser)
);

/**
 * GET /api/organization/users
 * Get all users in the organization
 */
router.get('/', 
  auth,
  requireRole(['school_admin', 'app_admin']),
  asyncHandler(organizationUserController.getOrganizationUsers)
);

/**
 * PUT /api/organization/users/:userId/role
 * Update user role within the organization
 */
router.put('/:userId/role', 
  [
    param('userId').isString().withMessage('Valid user ID is required'),
    body('role').isIn(['teacher', 'clerk', 'school_admin']).withMessage('Role must be teacher, clerk, or school_admin'),
    validationMiddleware,
  ],
  auth,
  requireRole(['school_admin', 'app_admin']),
  asyncHandler(organizationUserController.updateUserRole)
);

module.exports = router;
