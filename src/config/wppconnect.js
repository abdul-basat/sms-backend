/**
 * WPPConnect Configuration
 * Manages connection settings and session management for WPPConnect server
 */

class WPPConnectConfig {
  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment variables
   */
  loadConfig() {
    return {
      // Server configuration
      serverUrl: process.env.WPPCONNECT_SERVER_URL || 'http://wppconnect-server:8080',
      sessionId: process.env.WPPCONNECT_SESSION_ID || 'default',
      
      // Connection settings
      timeout: parseInt(process.env.WPPCONNECT_TIMEOUT) || 30000, // 30 seconds
      maxRetries: parseInt(process.env.WPPCONNECT_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.WPPCONNECT_RETRY_DELAY) || 2000, // 2 seconds
      
      // Session management
      autoReconnect: process.env.WPPCONNECT_AUTO_RECONNECT !== 'false', // Default true
      reconnectInterval: parseInt(process.env.WPPCONNECT_RECONNECT_INTERVAL) || 60000, // 1 minute
      
      // Health check settings
      healthCheckInterval: parseInt(process.env.WPPCONNECT_HEALTH_CHECK_INTERVAL) || 300000, // 5 minutes
      healthCheckTimeout: parseInt(process.env.WPPCONNECT_HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
      
      // API endpoints
      endpoints: {
        status: '/api/{sessionId}/status',
        sendMessage: '/api/{sessionId}/send-message',
        sendFile: '/api/{sessionId}/send-file',
        sendImage: '/api/{sessionId}/send-image',
        sendDocument: '/api/{sessionId}/send-document',
        sendVideo: '/api/{sessionId}/send-video',
        sendAudio: '/api/{sessionId}/send-audio',
        sendLocation: '/api/{sessionId}/send-location',
        sendContact: '/api/{sessionId}/send-contact',
        sendLinkPreview: '/api/{sessionId}/send-link-preview',
        sendButtons: '/api/{sessionId}/send-buttons',
        sendList: '/api/{sessionId}/send-list',
        sendTemplate: '/api/{sessionId}/send-template'
      }
    };
  }

  /**
   * Get server URL
   */
  getServerUrl() {
    return this.config.serverUrl;
  }

  /**
   * Get session ID
   */
  getSessionId() {
    return this.config.sessionId;
  }

  /**
   * Get timeout setting
   */
  getTimeout() {
    return this.config.timeout;
  }

  /**
   * Get max retries setting
   */
  getMaxRetries() {
    return this.config.maxRetries;
  }

  /**
   * Get retry delay setting
   */
  getRetryDelay() {
    return this.config.retryDelay;
  }

  /**
   * Check if auto reconnect is enabled
   */
  isAutoReconnectEnabled() {
    return this.config.autoReconnect;
  }

  /**
   * Get reconnect interval
   */
  getReconnectInterval() {
    return this.config.reconnectInterval;
  }

  /**
   * Get health check interval
   */
  getHealthCheckInterval() {
    return this.config.healthCheckInterval;
  }

  /**
   * Get health check timeout
   */
  getHealthCheckTimeout() {
    return this.config.healthCheckTimeout;
  }

  /**
   * Get API endpoint URL
   * @param {string} endpointName - Name of the endpoint
   * @param {Object} params - Parameters to replace in the URL
   * @returns {string} - Full endpoint URL
   */
  getEndpointUrl(endpointName, params = {}) {
    const endpoint = this.config.endpoints[endpointName];
    if (!endpoint) {
      throw new Error(`Unknown endpoint: ${endpointName}`);
    }

    let url = endpoint;
    
    // Replace session ID
    url = url.replace('{sessionId}', this.config.sessionId);
    
    // Replace other parameters
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, value);
    });

    return `${this.config.serverUrl}${url}`;
  }

  /**
   * Get status endpoint URL
   */
  getStatusUrl() {
    return this.getEndpointUrl('status');
  }

  /**
   * Get send message endpoint URL
   */
  getSendMessageUrl() {
    return this.getEndpointUrl('sendMessage');
  }

  /**
   * Get send file endpoint URL
   */
  getSendFileUrl() {
    return this.getEndpointUrl('sendFile');
  }

  /**
   * Get send image endpoint URL
   */
  getSendImageUrl() {
    return this.getEndpointUrl('sendImage');
  }

  /**
   * Get send document endpoint URL
   */
  getSendDocumentUrl() {
    return this.getEndpointUrl('sendDocument');
  }

  /**
   * Get send video endpoint URL
   */
  getSendVideoUrl() {
    return this.getEndpointUrl('sendVideo');
  }

  /**
   * Get send audio endpoint URL
   */
  getSendAudioUrl() {
    return this.getEndpointUrl('sendAudio');
  }

  /**
   * Get send location endpoint URL
   */
  getSendLocationUrl() {
    return this.getEndpointUrl('sendLocation');
  }

  /**
   * Get send contact endpoint URL
   */
  getSendContactUrl() {
    return this.getEndpointUrl('sendContact');
  }

  /**
   * Get send link preview endpoint URL
   */
  getSendLinkPreviewUrl() {
    return this.getEndpointUrl('sendLinkPreview');
  }

  /**
   * Get send buttons endpoint URL
   */
  getSendButtonsUrl() {
    return this.getEndpointUrl('sendButtons');
  }

  /**
   * Get send list endpoint URL
   */
  getSendListUrl() {
    return this.getEndpointUrl('sendList');
  }

  /**
   * Get send template endpoint URL
   */
  getSendTemplateUrl() {
    return this.getEndpointUrl('sendTemplate');
  }

  /**
   * Get request headers
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'FeesManager-Automation/1.0.0',
      'Accept': 'application/json'
    };
  }

  /**
   * Get request options for fetch
   */
  getRequestOptions(method = 'GET', body = null) {
    const options = {
      method,
      headers: this.getHeaders(),
      timeout: this.config.timeout
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return options;
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];

    if (!this.config.serverUrl) {
      errors.push('WPPCONNECT_SERVER_URL is required');
    }

    if (!this.config.sessionId) {
      errors.push('WPPCONNECT_SESSION_ID is required');
    }

    if (this.config.timeout < 1000) {
      errors.push('WPPCONNECT_TIMEOUT must be at least 1000ms');
    }

    if (this.config.maxRetries < 1) {
      errors.push('WPPCONNECT_MAX_RETRIES must be at least 1');
    }

    if (this.config.retryDelay < 100) {
      errors.push('WPPCONNECT_RETRY_DELAY must be at least 100ms');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration summary
   */
  getSummary() {
    return {
      serverUrl: this.config.serverUrl,
      sessionId: this.config.sessionId,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      autoReconnect: this.config.autoReconnect,
      reconnectInterval: this.config.reconnectInterval,
      healthCheckInterval: this.config.healthCheckInterval,
      healthCheckTimeout: this.config.healthCheckTimeout,
      endpoints: Object.keys(this.config.endpoints)
    };
  }

  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   */
  updateConfig(updates) {
    Object.assign(this.config, updates);
    console.log('🔄 WPPConnect configuration updated');
  }
}

// Create singleton instance
const wppconnectConfig = new WPPConnectConfig();

module.exports = wppconnectConfig;
