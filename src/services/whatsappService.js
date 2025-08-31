/**
 * WhatsApp Service - Multi-tenant WhatsApp management
 * Integrates with existing wppconnect client for backend automation
 */

const WPPConnectClient = require('./wppconnectClient');
const { db } = require('../config/firebase');
const logger = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.wppClient = new WPPConnectClient();
    this.activeSessions = new Map(); // organizationId -> session info
    this.connectionRetries = new Map(); // organizationId -> retry count
    this.maxRetries = 3;
  }

  /**
   * Initialize WhatsApp service for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Initialization result
   */
  async initializeForOrganization(organizationId) {
    try {
      logger.info(`[WhatsAppService] Initializing WhatsApp service for organization: ${organizationId}`);

      // Get organization WhatsApp configuration
      const config = await this.getOrganizationWhatsAppConfig(organizationId);
      
      if (!config || !config.enabled) {
        logger.warn(`[WhatsAppService] WhatsApp not enabled for organization: ${organizationId}`);
        return { success: false, message: 'WhatsApp not enabled for organization' };
      }

      // Check existing session
      const existingSession = this.activeSessions.get(organizationId);
      if (existingSession && existingSession.status === 'connected') {
        logger.info(`[WhatsAppService] Using existing session for organization: ${organizationId}`);
        return { success: true, session: existingSession };
      }

      // Initialize new session
      const sessionResult = await this.createSession(organizationId, config);
      
      if (sessionResult.success) {
        this.activeSessions.set(organizationId, sessionResult.session);
        await this.updateSessionStatus(organizationId, 'connected');
      }

      return sessionResult;

    } catch (error) {
      logger.error(`[WhatsAppService] Failed to initialize for organization ${organizationId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create WhatsApp session for organization
   * @param {string} organizationId - Organization ID
   * @param {Object} config - WhatsApp configuration
   * @returns {Promise<Object>} - Session creation result
   */
  async createSession(organizationId, config) {
    try {
      // Check WPPConnect server availability
      const isConnected = await this.wppClient.checkConnection();
      
      if (!isConnected) {
        logger.error(`[WhatsAppService] WPPConnect server not available for organization: ${organizationId}`);
        return { success: false, message: 'WhatsApp server not available' };
      }

      // Create session info
      const session = {
        organizationId,
        sessionId: config.sessionId || `org_${organizationId}`,
        status: 'connected',
        createdAt: new Date(),
        lastActivity: new Date(),
        phoneNumber: config.phoneNumber,
        connectionStatus: 'active'
      };

      logger.info(`[WhatsAppService] Created session for organization: ${organizationId}`);
      
      return { success: true, session };

    } catch (error) {
      logger.error(`[WhatsAppService] Failed to create session for organization ${organizationId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send message via WhatsApp
   * @param {string} organizationId - Organization ID
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message content
   * @returns {Promise<Object>} - Send result
   */
  async sendMessage(organizationId, phoneNumber, message) {
    try {
      logger.info(`[WhatsAppService] Sending message for organization ${organizationId} to ${phoneNumber}`);

      // Ensure session is active
      const sessionResult = await this.ensureActiveSession(organizationId);
      if (!sessionResult.success) {
        return sessionResult;
      }

      // Send message via WPPConnect
      const result = await this.wppClient.sendMessageWithRetry(phoneNumber, message);

      // Log message
      await this.logMessage(organizationId, {
        phoneNumber,
        message,
        status: 'sent',
        result: result,
        sentAt: new Date()
      });

      // Update last activity
      await this.updateLastActivity(organizationId);

      logger.info(`[WhatsAppService] Message sent successfully for organization ${organizationId}`);
      
      return { success: true, result };

    } catch (error) {
      logger.error(`[WhatsAppService] Failed to send message for organization ${organizationId}:`, error);
      
      // Log failed message
      await this.logMessage(organizationId, {
        phoneNumber,
        message,
        status: 'failed',
        error: error.message,
        sentAt: new Date()
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Ensure active session for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Session status
   */
  async ensureActiveSession(organizationId) {
    const session = this.activeSessions.get(organizationId);
    
    if (!session) {
      logger.warn(`[WhatsAppService] No session found for organization: ${organizationId}`);
      return await this.initializeForOrganization(organizationId);
    }

    // Check if session is still active
    const isConnected = await this.wppClient.checkConnection();
    if (!isConnected) {
      logger.warn(`[WhatsAppService] Session disconnected for organization: ${organizationId}, reconnecting...`);
      return await this.reconnectSession(organizationId);
    }

    return { success: true, session };
  }

  /**
   * Reconnect session for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Reconnection result
   */
  async reconnectSession(organizationId) {
    try {
      const retryCount = this.connectionRetries.get(organizationId) || 0;
      
      if (retryCount >= this.maxRetries) {
        logger.error(`[WhatsAppService] Max reconnection attempts reached for organization: ${organizationId}`);
        await this.updateSessionStatus(organizationId, 'failed');
        return { success: false, message: 'Max reconnection attempts reached' };
      }

      this.connectionRetries.set(organizationId, retryCount + 1);

      logger.info(`[WhatsAppService] Attempting reconnection for organization: ${organizationId} (attempt ${retryCount + 1})`);

      // Remove old session
      this.activeSessions.delete(organizationId);

      // Initialize new session
      const result = await this.initializeForOrganization(organizationId);

      if (result.success) {
        this.connectionRetries.delete(organizationId);
      }

      return result;

    } catch (error) {
      logger.error(`[WhatsAppService] Reconnection failed for organization ${organizationId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organization WhatsApp configuration
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Configuration
   */
  async getOrganizationWhatsAppConfig(organizationId) {
    try {
      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      
      if (!orgDoc.exists) {
        logger.warn(`[WhatsAppService] Organization not found: ${organizationId}`);
        return null;
      }

      const orgData = orgDoc.data();
      return orgData.whatsappConfig || {
        enabled: false,
        sessionId: `org_${organizationId}`,
        autoReconnect: true
      };

    } catch (error) {
      logger.error(`[WhatsAppService] Failed to get configuration for organization ${organizationId}:`, error);
      return null;
    }
  }

  /**
   * Update session status in database
   * @param {string} organizationId - Organization ID
   * @param {string} status - Session status
   */
  async updateSessionStatus(organizationId, status) {
    try {
      await db.collection('organizations').doc(organizationId).update({
        'whatsappConfig.connectionStatus': status,
        'whatsappConfig.lastConnected': new Date()
      });

      logger.info(`[WhatsAppService] Updated session status for organization ${organizationId}: ${status}`);

    } catch (error) {
      logger.error(`[WhatsAppService] Failed to update session status for organization ${organizationId}:`, error);
    }
  }

  /**
   * Update last activity timestamp
   * @param {string} organizationId - Organization ID
   */
  async updateLastActivity(organizationId) {
    const session = this.activeSessions.get(organizationId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Log message to database
   * @param {string} organizationId - Organization ID
   * @param {Object} messageData - Message data
   */
  async logMessage(organizationId, messageData) {
    try {
      const logEntry = {
        organizationId,
        ...messageData,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      await db.collection('communicationLogs').add(logEntry);

    } catch (error) {
      logger.error(`[WhatsAppService] Failed to log message for organization ${organizationId}:`, error);
    }
  }

  /**
   * Get session status for organization
   * @param {string} organizationId - Organization ID
   * @returns {Object} - Session status
   */
  getSessionStatus(organizationId) {
    const session = this.activeSessions.get(organizationId);
    
    if (!session) {
      return {
        status: 'disconnected',
        organizationId,
        message: 'No active session'
      };
    }

    return {
      status: session.status,
      organizationId,
      sessionId: session.sessionId,
      lastActivity: session.lastActivity,
      connectionStatus: session.connectionStatus,
      phoneNumber: session.phoneNumber
    };
  }

  /**
   * Get all active sessions
   * @returns {Array} - Active sessions
   */
  getAllActiveSessions() {
    return Array.from(this.activeSessions.entries()).map(([orgId, session]) => ({
      organizationId: orgId,
      ...session
    }));
  }

  /**
   * Disconnect session for organization
   * @param {string} organizationId - Organization ID
   */
  async disconnectSession(organizationId) {
    try {
      this.activeSessions.delete(organizationId);
      this.connectionRetries.delete(organizationId);
      
      await this.updateSessionStatus(organizationId, 'disconnected');
      
      logger.info(`[WhatsAppService] Disconnected session for organization: ${organizationId}`);

    } catch (error) {
      logger.error(`[WhatsAppService] Failed to disconnect session for organization ${organizationId}:`, error);
    }
  }

  /**
   * Health check for WhatsApp service
   * @returns {Object} - Health status
   */
  async healthCheck() {
    try {
      const wppConnected = await this.wppClient.checkConnection();
      const activeSessions = this.getAllActiveSessions();

      return {
        service: 'WhatsAppService',
        status: wppConnected ? 'healthy' : 'degraded',
        wppconnectStatus: wppConnected ? 'connected' : 'disconnected',
        activeSessions: activeSessions.length,
        sessions: activeSessions.map(s => ({
          organizationId: s.organizationId,
          status: s.status,
          lastActivity: s.lastActivity
        }))
      };

    } catch (error) {
      logger.error('[WhatsAppService] Health check failed:', error);
      return {
        service: 'WhatsAppService',
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = WhatsAppService;
