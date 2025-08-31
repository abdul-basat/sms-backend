/**
 * Authentication Routes
 * Handle authentication-related endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const authController = require('../controllers/authController');
const validationMiddleware = require('../middleware/validation');
const { auth, jwtAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user with email/password
 */
router.post('/register', 
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('role').optional().isIn(['app_admin', 'school_admin', 'admin', 'teacher', 'clerk', 'user']).withMessage('Invalid role'),
    body('organizationId').optional().isUUID().withMessage('Organization ID must be a valid UUID'),
    validationMiddleware,
  ],
  asyncHandler(authController.register)
);

/**
 * POST /api/auth/login
 * Login user with email/password
 */
router.post('/login', 
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validationMiddleware,
  ],
  asyncHandler(authController.login)
);

/**
 * POST /api/auth/logout
 * Logout user (JWT-based for testing)
 */
router.post('/logout', 
  jwtAuth,
  asyncHandler(authController.logout)
);

/**
 * GET /api/auth/me
 * Get current user profile (JWT-based for testing)
 */
router.get('/me', 
  jwtAuth,
  asyncHandler(authController.getCurrentUser)
);

/**
 * POST /api/auth/verify-token
 * Verify Firebase ID token and return user info
 */
router.post('/verify-token', 
  [
    body('idToken').notEmpty().withMessage('ID token is required'),
    validationMiddleware,
  ],
  asyncHandler(authController.verifyToken)
);

/**
 * POST /api/auth/refresh
 * Refresh authentication token
 */
router.post('/refresh', 
  [
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
    validationMiddleware,
  ],
  asyncHandler(authController.refreshToken)
);

/**
 * GET /api/auth/user
 * Get current user information (Firebase endpoint)
 */
router.get('/user', 
  auth,
  asyncHandler(authController.getCurrentUser)
);

/**
 * PUT /api/auth/user
 * Update current user information (Firebase endpoint)
 */
router.put('/user', 
  auth,
  [
    body('displayName').optional().trim().isLength({ min: 1, max: 100 }),
    body('phoneNumber').optional().isMobilePhone(),
    validationMiddleware,
  ],
  asyncHandler(authController.updateCurrentUser)
);

module.exports = router;
