/**
 * Automation Routes
 * Handle automation and cron job endpoints
 */

const express = require('express');
const { jwtAuth, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const AutomationController = require('../controllers/automationController');

const router = express.Router();
const automationController = new AutomationController();

// Get automation rules for a specific organization
router.get('/rules/:organizationId', 
  jwtAuth,
  asyncHandler(automationController.getAutomationRules.bind(automationController))
);

// Get all automation rules (admin endpoint)
router.get('/rules', 
  jwtAuth,
  requirePermission('read:automation'), 
  asyncHandler(automationController.getAllAutomationRules.bind(automationController))
);

// Save automation rules
router.post('/rules', 
  jwtAuth,
  requirePermission('write:automation'), 
  asyncHandler(automationController.saveAutomationRules.bind(automationController))
);

// Get automation statistics
router.get('/stats/:organizationId', 
  jwtAuth,
  asyncHandler(automationController.getAutomationStats.bind(automationController))
);

module.exports = router;
