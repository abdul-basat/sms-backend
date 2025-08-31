/**
 * WhatsApp Controller
 * Handle WhatsApp integration API endpoints
 */

const WhatsAppService = require('../services/whatsappService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

class WhatsAppController {
  constructor() {
    this.whatsappService = new WhatsAppService();
  }

  /**
   * Get WhatsApp connection status for organization
   */
  async getConnectionStatus(req, res) {
    try {
      const { organizationId } = req.user; // From auth middleware
      
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      const status = this.whatsappService.getSessionStatus(organizationId);
      
      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('[WhatsAppController] Get connection status failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Initialize WhatsApp connection for organization
   */
  async initializeConnection(req, res) {
    try {
      const { organizationId } = req.user;
      
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      logger.info(`[WhatsAppController] Initializing connection for organization: ${organizationId}`);

      const result = await this.whatsappService.initializeForOrganization(organizationId);

      if (result.success) {
        res.json({
          success: true,
          message: 'WhatsApp connection initialized successfully',
          data: result.session
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to initialize WhatsApp connection',
          error: result.error
        });
      }

    } catch (error) {
      logger.error('[WhatsAppController] Initialize connection failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendMessage(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { organizationId } = req.user;
      const { phoneNumber, message, type = 'manual' } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      logger.info(`[WhatsAppController] Sending message for organization: ${organizationId}`);

      const result = await this.whatsappService.sendMessage(organizationId, phoneNumber, message);

      if (result.success) {
        res.json({
          success: true,
          message: 'Message sent successfully',
          data: {
            phoneNumber,
            sentAt: new Date(),
            type,
            result: result.result
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to send message',
          error: result.error
        });
      }

    } catch (error) {
      logger.error('[WhatsAppController] Send message failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Send bulk WhatsApp messages
   */
  async sendBulkMessages(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { organizationId } = req.user;
      const { recipients, message, type = 'bulk', delayBetweenMessages = 2000 } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      logger.info(`[WhatsAppController] Sending bulk messages for organization: ${organizationId} to ${recipients.length} recipients`);

      const results = [];
      
      for (let i = 0; i < recipients.length; i++) {
        const phoneNumber = recipients[i];
        
        try {
          const result = await this.whatsappService.sendMessage(organizationId, phoneNumber, message);
          
          results.push({
            phoneNumber,
            success: result.success,
            error: result.error || null,
            sentAt: new Date()
          });

          // Add delay between messages (except for last message)
          if (i < recipients.length - 1 && delayBetweenMessages > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
          }

        } catch (error) {
          results.push({
            phoneNumber,
            success: false,
            error: error.message,
            sentAt: new Date()
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.length - successCount;

      res.json({
        success: true,
        message: `Bulk message sending completed. ${successCount} sent, ${failedCount} failed.`,
        data: {
          total: results.length,
          successful: successCount,
          failed: failedCount,
          results,
          type
        }
      });

    } catch (error) {
      logger.error('[WhatsAppController] Send bulk messages failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Disconnect WhatsApp session
   */
  async disconnectSession(req, res) {
    try {
      const { organizationId } = req.user;
      
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      await this.whatsappService.disconnectSession(organizationId);

      res.json({
        success: true,
        message: 'WhatsApp session disconnected successfully'
      });

    } catch (error) {
      logger.error('[WhatsAppController] Disconnect session failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Reconnect WhatsApp session
   */
  async reconnectSession(req, res) {
    try {
      const { organizationId } = req.user;
      
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      logger.info(`[WhatsAppController] Reconnecting session for organization: ${organizationId}`);

      const result = await this.whatsappService.reconnectSession(organizationId);

      if (result.success) {
        res.json({
          success: true,
          message: 'WhatsApp session reconnected successfully',
          data: result.session
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to reconnect WhatsApp session',
          error: result.error
        });
      }

    } catch (error) {
      logger.error('[WhatsAppController] Reconnect session failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get communication logs for organization
   */
  async getCommunicationLogs(req, res) {
    try {
      const { organizationId } = req.user;
      const { limit = 50, offset = 0, startDate, endDate } = req.query;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      // TODO: Implement communication logs fetching from database
      // This is a placeholder implementation
      const logs = [];

      res.json({
        success: true,
        data: {
          logs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      logger.error('[WhatsAppController] Get communication logs failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get WhatsApp service health status
   */
  async getHealthStatus(req, res) {
    try {
      const health = await this.whatsappService.healthCheck();

      res.json({
        success: true,
        data: health
      });

    } catch (error) {
      logger.error('[WhatsAppController] Get health status failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Update WhatsApp configuration for organization
   */
  async updateConfiguration(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { organizationId } = req.user;
      const { enabled, sessionId, autoReconnect, phoneNumber } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required'
        });
      }

      // TODO: Implement configuration update in database
      logger.info(`[WhatsAppController] Updating configuration for organization: ${organizationId}`);

      res.json({
        success: true,
        message: 'WhatsApp configuration updated successfully',
        data: {
          organizationId,
          enabled,
          sessionId,
          autoReconnect,
          phoneNumber,
          updatedAt: new Date()
        }
      });

    } catch (error) {
      logger.error('[WhatsAppController] Update configuration failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = WhatsAppController;
