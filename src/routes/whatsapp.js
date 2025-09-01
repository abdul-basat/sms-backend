/**
 * WhatsApp Routes
 * Handle WhatsApp integration endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const { requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const WhatsAppController = require('../controllers/whatsappController');

const router = express.Router();
const whatsappController = new WhatsAppController();

// Get connection status
router.get('/status', 
  requirePermission('read:whatsapp'), 
  asyncHandler(whatsappController.getConnectionStatus.bind(whatsappController))
);

// Initialize connection
router.post('/initialize', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.initializeConnection.bind(whatsappController))
);

// Send single message
router.post('/send', 
  requirePermission('write:whatsapp'),
  [
    body('phoneNumber').notEmpty().withMessage('Phone number is required'),
    body('message').notEmpty().withMessage('Message is required')
  ],
  asyncHandler(whatsappController.sendMessage.bind(whatsappController))
);

// Send bulk messages
router.post('/send-bulk', 
  requirePermission('write:whatsapp'),
  [
    body('recipients').isArray({ min: 1 }).withMessage('Recipients array is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('delayBetweenMessages').optional().isInt({ min: 0 }).withMessage('Delay must be a positive integer')
  ],
  asyncHandler(whatsappController.sendBulkMessages.bind(whatsappController))
);

// Disconnect session
router.post('/disconnect', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.disconnectSession.bind(whatsappController))
);

// Reconnect session
router.post('/reconnect', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.reconnectSession.bind(whatsappController))
);

// Get communication logs
router.get('/logs', 
  requirePermission('read:whatsapp'), 
  asyncHandler(whatsappController.getCommunicationLogs.bind(whatsappController))
);

// Health status
router.get('/health', 
  requirePermission('read:whatsapp'), 
  asyncHandler(whatsappController.getHealthStatus.bind(whatsappController))
);

// Update configuration
router.put('/config', 
  requirePermission('write:whatsapp'),
  [
    body('enabled').optional().isBoolean().withMessage('Enabled must be a boolean'),
    body('sessionId').optional().notEmpty().withMessage('Session ID cannot be empty'),
    body('autoReconnect').optional().isBoolean().withMessage('Auto reconnect must be a boolean'),
    body('phoneNumber').optional().notEmpty().withMessage('Phone number cannot be empty')
  ],
  asyncHandler(whatsappController.updateConfiguration.bind(whatsappController))
);

// Legacy endpoint for backward compatibility
router.get('/sessions', requirePermission('read:whatsapp'), asyncHandler(async (req, res) => {
  const status = await whatsappController.getConnectionStatus(req, res);
}));

// Queue Management Endpoints

// Get queue status
router.get('/queue/status/:organizationId?', 
  requirePermission('read:whatsapp'), 
  asyncHandler(whatsappController.getQueueStatus.bind(whatsappController))
);

// Pause queue processing
router.post('/queue/pause/:organizationId?', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.pauseQueue.bind(whatsappController))
);

// Resume queue processing
router.post('/queue/resume/:organizationId?', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.resumeQueue.bind(whatsappController))
);

// Clear all messages from queue
router.delete('/queue/clear/:organizationId?', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.clearQueue.bind(whatsappController))
);

// Cancel specific message
router.delete('/queue/message/:messageId', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.cancelMessage.bind(whatsappController))
);

// Retry failed message
router.post('/queue/retry/:messageId', 
  requirePermission('write:whatsapp'), 
  asyncHandler(whatsappController.retryMessage.bind(whatsappController))
);

// Get queued messages
router.get('/queue/messages/:organizationId?', 
  requirePermission('read:whatsapp'), 
  asyncHandler(whatsappController.getQueuedMessages.bind(whatsappController))
);

// Get duplicate prevention statistics
router.get('/queue/duplicates/:organizationId?', 
  requirePermission('read:whatsapp'), 
  asyncHandler(whatsappController.getDuplicateStats.bind(whatsappController))
);

module.exports = router;
