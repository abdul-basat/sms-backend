const express = require('express');
const GlobalTimeConfigController = require('../controllers/globalTimeConfigController');
const { jwtAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const globalTimeConfigController = new GlobalTimeConfigController();

/**
 * Global Time Configuration Routes
 * Provides centralized time management for all messaging features
 */

// Get organization's time configuration
router.get('/organization/:organizationId/time-config', 
  jwtAuth,
  asyncHandler(globalTimeConfigController.getTimeConfig.bind(globalTimeConfigController))
);

// Update organization's time configuration
router.put('/organization/:organizationId/time-config',
  jwtAuth,
  asyncHandler(globalTimeConfigController.updateTimeConfig.bind(globalTimeConfigController))
);

// Get current business hours status
router.get('/organization/:organizationId/business-hours-status',
  jwtAuth,
  asyncHandler(globalTimeConfigController.getBusinessHoursStatus.bind(globalTimeConfigController))
);

// Test business hours for different services
router.post('/organization/:organizationId/test-business-hours',
  jwtAuth,
  asyncHandler(globalTimeConfigController.testBusinessHours.bind(globalTimeConfigController))
);

// Get time configuration analysis
router.get('/organization/:organizationId/time-config/analysis',
  jwtAuth,
  asyncHandler(globalTimeConfigController.analyzeTimeConfig.bind(globalTimeConfigController))
);

module.exports = router;
