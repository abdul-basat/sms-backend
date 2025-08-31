const express = require('express');
const { body, param, query } = require('express-validator');
const { jwtAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');
const communicationController = require('../controllers/communicationController');

const router = express.Router();

// Analytics Routes
router.get('/analytics',
  jwtAuth,
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  query('period').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Period must be daily, weekly, or monthly'),
  validateRequest,
  asyncHandler(communicationController.getAnalytics)
);

router.get('/logs',
  jwtAuth,
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  query('channel').optional().isIn(['whatsapp', 'sms', 'email']).withMessage('Channel must be whatsapp, sms, or email'),
  query('status').optional().isIn(['sent', 'delivered', 'failed', 'read', 'blocked']).withMessage('Invalid status'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be 0 or greater'),
  validateRequest,
  asyncHandler(communicationController.getCommunicationLogs)
);

router.get('/engagement',
  jwtAuth,
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  validateRequest,
  asyncHandler(communicationController.getParentEngagement)
);

router.get('/reports/:reportType',
  jwtAuth,
  param('reportType').isIn(['summary', 'detailed', 'engagement', 'cost_analysis']).withMessage('Invalid report type'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  validateRequest,
  asyncHandler(communicationController.generateReport)
);

// Communication Settings Routes
router.get('/settings',
  jwtAuth,
  asyncHandler(communicationController.getCommunicationSettings)
);

router.put('/settings',
  jwtAuth,
  body('whatsappEnabled').optional().isBoolean().withMessage('WhatsApp enabled must be boolean'),
  body('smsEnabled').optional().isBoolean().withMessage('SMS enabled must be boolean'),
  body('emailEnabled').optional().isBoolean().withMessage('Email enabled must be boolean'),
  body('autoConfirmPayments').optional().isBoolean().withMessage('Auto confirm payments must be boolean'),
  body('language').optional().isLength({ min: 2, max: 5 }).withMessage('Language must be 2-5 characters'),
  body('timezone').optional().notEmpty().withMessage('Timezone cannot be empty'),
  validateRequest,
  asyncHandler(communicationController.updateCommunicationSettings)
);

// Parent Contact Management Routes
router.get('/contacts',
  jwtAuth,
  query('studentId').optional().isUUID().withMessage('Student ID must be valid UUID'),
  query('isActive').optional().isBoolean().withMessage('Is active must be boolean'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be 0 or greater'),
  validateRequest,
  asyncHandler(communicationController.getParentContacts)
);

router.post('/contacts',
  jwtAuth,
  body('studentId').notEmpty().withMessage('Student ID is required'),
  body('parentName').notEmpty().withMessage('Parent name is required'),
  body('primaryPhone').notEmpty().withMessage('Primary phone is required'),
  body('secondaryPhone').optional().notEmpty().withMessage('Secondary phone cannot be empty if provided'),
  body('email').optional().isEmail().withMessage('Email must be valid'),
  body('relationship').optional().isIn(['parent', 'guardian', 'relative', 'other']).withMessage('Invalid relationship'),
  body('preferredChannel').optional().isIn(['whatsapp', 'sms', 'email']).withMessage('Invalid preferred channel'),
  body('language').optional().isLength({ min: 2, max: 5 }).withMessage('Language must be 2-5 characters'),
  validateRequest,
  asyncHandler(communicationController.createParentContact)
);

router.put('/contacts/:contactId',
  jwtAuth,
  param('contactId').notEmpty().withMessage('Contact ID is required'),
  body('parentName').optional().notEmpty().withMessage('Parent name cannot be empty'),
  body('primaryPhone').optional().notEmpty().withMessage('Primary phone cannot be empty'),
  body('secondaryPhone').optional().notEmpty().withMessage('Secondary phone cannot be empty if provided'),
  body('email').optional().isEmail().withMessage('Email must be valid'),
  body('relationship').optional().isIn(['parent', 'guardian', 'relative', 'other']).withMessage('Invalid relationship'),
  body('preferredChannel').optional().isIn(['whatsapp', 'sms', 'email']).withMessage('Invalid preferred channel'),
  body('language').optional().isLength({ min: 2, max: 5 }).withMessage('Language must be 2-5 characters'),
  body('isActive').optional().isBoolean().withMessage('Is active must be boolean'),
  validateRequest,
  asyncHandler(communicationController.updateParentContact)
);

// Opt-out/Opt-in Management
router.post('/opt-out',
  jwtAuth,
  body('phoneNumber').notEmpty().withMessage('Phone number is required'),
  body('optOutType').optional().isIn(['all', 'marketing', 'reminders', 'notifications']).withMessage('Invalid opt-out type'),
  validateRequest,
  asyncHandler(communicationController.handleOptOut)
);

router.post('/opt-in',
  jwtAuth,
  body('phoneNumber').notEmpty().withMessage('Phone number is required'),
  validateRequest,
  asyncHandler(communicationController.handleOptIn)
);

// Communication Preferences
router.get('/preferences/:contactId',
  jwtAuth,
  param('contactId').notEmpty().withMessage('Contact ID is required'),
  validateRequest,
  asyncHandler(communicationController.getCommunicationPreferences)
);

router.put('/preferences/:contactId',
  jwtAuth,
  param('contactId').notEmpty().withMessage('Contact ID is required'),
  body('feeReminders').optional().isBoolean().withMessage('Fee reminders must be boolean'),
  body('paymentConfirmations').optional().isBoolean().withMessage('Payment confirmations must be boolean'),
  body('attendanceNotifications').optional().isBoolean().withMessage('Attendance notifications must be boolean'),
  body('academicUpdates').optional().isBoolean().withMessage('Academic updates must be boolean'),
  body('eventAnnouncements').optional().isBoolean().withMessage('Event announcements must be boolean'),
  body('emergencyAlerts').optional().isBoolean().withMessage('Emergency alerts must be boolean'),
  validateRequest,
  asyncHandler(communicationController.updateCommunicationPreferences)
);

// Communication History
router.get('/history/:recipientId',
  jwtAuth,
  param('recipientId').notEmpty().withMessage('Recipient ID is required'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  query('messageType').optional().isIn(['fee_reminder', 'payment_confirmation', 'attendance', 'enrollment', 'announcement']).withMessage('Invalid message type'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be 0 or greater'),
  validateRequest,
  asyncHandler(communicationController.getCommunicationHistory)
);

// Compliance and Reporting
router.get('/compliance',
  jwtAuth,
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  validateRequest,
  asyncHandler(communicationController.getComplianceReport)
);

// Bulk Operations
router.post('/contacts/bulk-import',
  jwtAuth,
  body('contacts').isArray({ min: 1 }).withMessage('Contacts array is required and must not be empty'),
  body('contacts.*.studentId').notEmpty().withMessage('Student ID is required for each contact'),
  body('contacts.*.parentName').notEmpty().withMessage('Parent name is required for each contact'),
  body('contacts.*.primaryPhone').notEmpty().withMessage('Primary phone is required for each contact'),
  validateRequest,
  asyncHandler(communicationController.bulkImportContacts)
);

router.get('/contacts/export',
  jwtAuth,
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  validateRequest,
  asyncHandler(communicationController.exportContacts)
);

// Test and Development Routes (for testing analytics)
router.post('/test/record-event',
  jwtAuth,
  body('recipientId').notEmpty().withMessage('Recipient ID is required'),
  body('channel').isIn(['whatsapp', 'sms', 'email']).withMessage('Channel must be whatsapp, sms, or email'),
  body('type').isIn(['fee_reminder', 'payment_confirmation', 'attendance', 'enrollment', 'announcement']).withMessage('Invalid message type'),
  body('status').isIn(['sent', 'delivered', 'failed', 'read']).withMessage('Invalid status'),
  body('cost').optional().isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
  validateRequest,
  asyncHandler(communicationController.recordTestEvent)
);

module.exports = router;
