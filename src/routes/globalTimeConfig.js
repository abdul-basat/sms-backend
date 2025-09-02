const express = require('express');
const GlobalTimeConfigController = require('../controllers/globalTimeConfigController');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
const globalTimeConfigController = new GlobalTimeConfigController();

/**
 * Global Time Configuration Routes
 * Provides centralized time management for all messaging features
 */

// Get organization's time configuration
router.get('/organization/:organizationId/time-config', 
  auth,
  asyncHandler(globalTimeConfigController.getTimeConfig.bind(globalTimeConfigController))
);

// Update organization's time configuration
router.put('/organization/:organizationId/time-config',
  auth,
  asyncHandler(globalTimeConfigController.updateTimeConfig.bind(globalTimeConfigController))
);

// Get current business hours status
router.get('/organization/:organizationId/business-hours-status',
  auth,
  asyncHandler(globalTimeConfigController.getBusinessHoursStatus.bind(globalTimeConfigController))
);

// Test business hours for different services
router.post('/organization/:organizationId/test-business-hours',
  auth,
  asyncHandler(globalTimeConfigController.testBusinessHours.bind(globalTimeConfigController))
);

// Get time configuration analysis
router.get('/organization/:organizationId/time-config/analysis',
  auth,
  asyncHandler(globalTimeConfigController.analyzeTimeConfig.bind(globalTimeConfigController))
);

module.exports = router;
