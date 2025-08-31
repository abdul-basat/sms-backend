/**
 * Students Routes
 * Handle student management endpoints
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { jwtAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const studentController = require('../controllers/studentController');
const validationMiddleware = require('../middleware/validation');

const router = express.Router();

/**
 * GET /api/students
 * Get students for organization
 */
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().isString().withMessage('Search must be a string'),
    query('class').optional().isString().withMessage('Class must be a string'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(studentController.getStudents)
);

/**
 * POST /api/students
 * Create new student
 */
router.post('/', 
  [
    body('firstName').trim().isLength({ min: 1, max: 50 }).withMessage('First name is required and must be between 1 and 50 characters'),
    body('lastName').trim().isLength({ min: 1, max: 50 }).withMessage('Last name is required and must be between 1 and 50 characters'),
    body('rollNumber').trim().isLength({ min: 1, max: 20 }).withMessage('Roll number is required and must be between 1 and 20 characters'),
    body('class').trim().isLength({ min: 1, max: 10 }).withMessage('Class is required and must be between 1 and 10 characters'),
    body('section').optional().trim().isLength({ max: 5 }).withMessage('Section must be at most 5 characters'),
    body('phone').optional().matches(/^\+?[\d\s\-\(\)]+$/).withMessage('Please provide a valid phone number'),
    body('fatherName').optional().trim().isLength({ max: 50 }).withMessage('Father name must be at most 50 characters'),
    body('motherName').optional().trim().isLength({ max: 50 }).withMessage('Mother name must be at most 50 characters'),
    body('address').optional().trim().isLength({ max: 200 }).withMessage('Address must be at most 200 characters'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(studentController.createStudent)
);

/**
 * GET /api/students/:id
 * Get student by ID
 */
router.get('/:id', 
  [
    param('id').isString().withMessage('Valid student ID is required'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(studentController.getStudentById)
);

/**
 * PUT /api/students/:id
 * Update student
 */
router.put('/:id', 
  [
    param('id').isString().withMessage('Valid student ID is required'),
    body('firstName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be between 1 and 50 characters'),
    body('lastName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be between 1 and 50 characters'),
    body('rollNumber').optional().trim().isLength({ min: 1, max: 20 }).withMessage('Roll number must be between 1 and 20 characters'),
    body('class').optional().trim().isLength({ min: 1, max: 10 }).withMessage('Class must be between 1 and 10 characters'),
    body('section').optional().trim().isLength({ max: 5 }).withMessage('Section must be at most 5 characters'),
    body('phone').optional().matches(/^\+?[\d\s\-\(\)]+$/).withMessage('Please provide a valid phone number'),
    body('fatherName').optional().trim().isLength({ max: 50 }).withMessage('Father name must be at most 50 characters'),
    body('motherName').optional().trim().isLength({ max: 50 }).withMessage('Mother name must be at most 50 characters'),
    body('address').optional().trim().isLength({ max: 200 }).withMessage('Address must be at most 200 characters'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(studentController.updateStudent)
);

/**
 * DELETE /api/students/:id
 * Delete student
 */
router.delete('/:id', 
  [
    param('id').isString().withMessage('Valid student ID is required'),
    validationMiddleware,
  ],
  jwtAuth,
  asyncHandler(studentController.deleteStudent)
);

module.exports = router;
