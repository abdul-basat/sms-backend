/**
 * WhatsApp Service Tests
 * Test suite for WhatsApp service foundation
 */

const WhatsAppService = require('../src/services/whatsappService');
const WPPConnectClient = require('../src/services/wppconnectClient');

// Mock WPPConnect client
jest.mock('../src/services/wppconnectClient');
jest.mock('../src/config/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn()
      })),
      add: jest.fn()
    }))
  }
}));

describe('WhatsApp Service Foundation', () => {
  let whatsappService;
  let mockWppClient;

  beforeEach(() => {
    whatsappService = new WhatsAppService();
    mockWppClient = new WPPConnectClient();
    whatsappService.wppClient = mockWppClient;
    
    // Clear any existing sessions
    whatsappService.activeSessions.clear();
    whatsappService.connectionRetries.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Management', () => {
    it('should initialize WhatsApp service for organization', async () => {
      // Mock organization config
      const mockConfig = {
        enabled: true,
        sessionId: 'test_session',
        phoneNumber: '+1234567890',
        autoReconnect: true
      };

      whatsappService.getOrganizationWhatsAppConfig = jest.fn().mockResolvedValue(mockConfig);
      mockWppClient.checkConnection = jest.fn().mockResolvedValue(true);

      const result = await whatsappService.initializeForOrganization('org_123');

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session.organizationId).toBe('org_123');
      expect(whatsappService.activeSessions.has('org_123')).toBe(true);
    });

    it('should handle disabled WhatsApp for organization', async () => {
      whatsappService.getOrganizationWhatsAppConfig = jest.fn().mockResolvedValue({
        enabled: false
      });

      const result = await whatsappService.initializeForOrganization('org_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('WhatsApp not enabled for organization');
      expect(whatsappService.activeSessions.has('org_123')).toBe(false);
    });

    it('should return existing session if already connected', async () => {
      // Set up existing session
      const existingSession = {
        organizationId: 'org_123',
        sessionId: 'test_session',
        status: 'connected',
        createdAt: new Date(),
        lastActivity: new Date()
      };
      whatsappService.activeSessions.set('org_123', existingSession);

      const mockConfig = { enabled: true };
      whatsappService.getOrganizationWhatsAppConfig = jest.fn().mockResolvedValue(mockConfig);

      const result = await whatsappService.initializeForOrganization('org_123');

      expect(result.success).toBe(true);
      expect(result.session).toEqual(existingSession);
    });

    it('should handle WPPConnect server unavailable', async () => {
      const mockConfig = { enabled: true };
      whatsappService.getOrganizationWhatsAppConfig = jest.fn().mockResolvedValue(mockConfig);
      mockWppClient.checkConnection = jest.fn().mockResolvedValue(false);

      const result = await whatsappService.initializeForOrganization('org_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('WhatsApp server not available');
    });

    it('should handle organization configuration errors', async () => {
      whatsappService.getOrganizationWhatsAppConfig = jest.fn().mockResolvedValue(null);

      const result = await whatsappService.initializeForOrganization('org_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('WhatsApp not enabled for organization');
    });
  });

  describe('Message Sending', () => {
    beforeEach(() => {
      // Set up active session
      const session = {
        organizationId: 'org_123',
        sessionId: 'test_session',
        status: 'connected',
        createdAt: new Date(),
        lastActivity: new Date()
      };
      whatsappService.activeSessions.set('org_123', session);
    });

    it('should send message successfully', async () => {
      mockWppClient.checkConnection = jest.fn().mockResolvedValue(true);
      mockWppClient.sendMessageWithRetry = jest.fn().mockResolvedValue({
        success: true,
        messageId: 'msg_123'
      });
      whatsappService.logMessage = jest.fn().mockResolvedValue();
      whatsappService.updateLastActivity = jest.fn().mockResolvedValue();

      const result = await whatsappService.sendMessage('org_123', '+1234567890', 'Test message');

      expect(result.success).toBe(true);
      expect(mockWppClient.sendMessageWithRetry).toHaveBeenCalledWith('+1234567890', 'Test message');
      expect(whatsappService.logMessage).toHaveBeenCalled();
      expect(whatsappService.updateLastActivity).toHaveBeenCalledWith('org_123');
    });

    it('should handle message sending failure', async () => {
      mockWppClient.checkConnection = jest.fn().mockResolvedValue(true);
      mockWppClient.sendMessageWithRetry = jest.fn().mockRejectedValue(new Error('Send failed'));
      whatsappService.logMessage = jest.fn().mockResolvedValue();

      const result = await whatsappService.sendMessage('org_123', '+1234567890', 'Test message');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Send failed');
      expect(whatsappService.logMessage).toHaveBeenCalledWith('org_123', expect.objectContaining({
        status: 'failed',
        error: 'Send failed'
      }));
    });

    it('should initialize session if not active', async () => {
      whatsappService.activeSessions.clear();
      whatsappService.initializeForOrganization = jest.fn().mockResolvedValue({
        success: true,
        session: { organizationId: 'org_123', status: 'connected' }
      });
      mockWppClient.sendMessageWithRetry = jest.fn().mockResolvedValue({ success: true });
      whatsappService.logMessage = jest.fn().mockResolvedValue();
      whatsappService.updateLastActivity = jest.fn().mockResolvedValue();

      const result = await whatsappService.sendMessage('org_123', '+1234567890', 'Test message');

      expect(whatsappService.initializeForOrganization).toHaveBeenCalledWith('org_123');
      expect(result.success).toBe(true);
    });
  });

  describe('Session Reconnection', () => {
    it('should reconnect session successfully', async () => {
      whatsappService.initializeForOrganization = jest.fn().mockResolvedValue({
        success: true,
        session: { organizationId: 'org_123', status: 'connected' }
      });

      const result = await whatsappService.reconnectSession('org_123');

      expect(result.success).toBe(true);
      expect(whatsappService.connectionRetries.has('org_123')).toBe(false);
    });

    it('should handle max reconnection attempts', async () => {
      whatsappService.connectionRetries.set('org_123', 3);
      whatsappService.updateSessionStatus = jest.fn().mockResolvedValue();

      const result = await whatsappService.reconnectSession('org_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Max reconnection attempts reached');
      expect(whatsappService.updateSessionStatus).toHaveBeenCalledWith('org_123', 'failed');
    });

    it('should increment retry count on failed reconnection', async () => {
      whatsappService.initializeForOrganization = jest.fn().mockResolvedValue({
        success: false,
        error: 'Connection failed'
      });

      const result = await whatsappService.reconnectSession('org_123');

      expect(whatsappService.connectionRetries.get('org_123')).toBe(1);
      expect(result.success).toBe(false);
    });
  });

  describe('Session Status', () => {
    it('should return correct status for active session', () => {
      const session = {
        organizationId: 'org_123',
        sessionId: 'test_session',
        status: 'connected',
        lastActivity: new Date(),
        connectionStatus: 'active',
        phoneNumber: '+1234567890'
      };
      whatsappService.activeSessions.set('org_123', session);

      const status = whatsappService.getSessionStatus('org_123');

      expect(status.status).toBe('connected');
      expect(status.organizationId).toBe('org_123');
      expect(status.sessionId).toBe('test_session');
      expect(status.phoneNumber).toBe('+1234567890');
    });

    it('should return disconnected status for inactive session', () => {
      const status = whatsappService.getSessionStatus('org_123');

      expect(status.status).toBe('disconnected');
      expect(status.organizationId).toBe('org_123');
      expect(status.message).toBe('No active session');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when WPPConnect is connected', async () => {
      mockWppClient.checkConnection = jest.fn().mockResolvedValue(true);
      
      const session = { organizationId: 'org_123', status: 'connected', lastActivity: new Date() };
      whatsappService.activeSessions.set('org_123', session);

      const health = await whatsappService.healthCheck();

      expect(health.service).toBe('WhatsAppService');
      expect(health.status).toBe('healthy');
      expect(health.wppconnectStatus).toBe('connected');
      expect(health.activeSessions).toBe(1);
    });

    it('should return degraded status when WPPConnect is disconnected', async () => {
      mockWppClient.checkConnection = jest.fn().mockResolvedValue(false);

      const health = await whatsappService.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.wppconnectStatus).toBe('disconnected');
    });

    it('should return unhealthy status on error', async () => {
      mockWppClient.checkConnection = jest.fn().mockRejectedValue(new Error('Health check failed'));

      const health = await whatsappService.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Health check failed');
    });
  });
});

module.exports = {};
