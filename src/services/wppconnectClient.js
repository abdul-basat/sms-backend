const fetch = require('node-fetch');

class WPPConnectClient {
  constructor() {
    this.baseUrl = process.env.WPPCONNECT_SERVER_URL || 'http://wppconnect-server:8080';
    this.sessionId = process.env.WPPCONNECT_SESSION_ID || 'default';
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
  }

  /**
   * Send a WhatsApp message via WPPConnect
   * @param {string} phoneNumber - Phone number with country code
   * @param {string} message - Message content
   * @returns {Promise<Object>} - Response from WPPConnect
   */
  async sendMessage(phoneNumber, message) {
    const url = `${this.baseUrl}/api/${this.sessionId}/send-message`;
    
    try {
      console.log(`📤 Sending message to ${phoneNumber}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phoneNumber,
          message: message
        })
      });

      if (!response.ok) {
        throw new Error(`WPPConnect HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(`WPPConnect API error: ${result.error}`);
      }

      console.log(`✅ Message sent successfully to ${phoneNumber}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Failed to send message to ${phoneNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Send message with retry logic
   * @param {string} phoneNumber - Phone number with country code
   * @param {string} message - Message content
   * @returns {Promise<Object>} - Response from WPPConnect
   */
  async sendMessageWithRetry(phoneNumber, message) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.sendMessage(phoneNumber, message);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt}/${this.maxRetries} failed for ${phoneNumber}:`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⏳ Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Check if WPPConnect server is connected
   * @returns {Promise<boolean>} - Connection status
   */
  async checkConnection() {
    try {
      // Use the health endpoint since /api/{sessionId}/status doesn't exist
      const url = `${this.baseUrl}/healthz`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`❌ WPPConnect health check failed: HTTP ${response.status}`);
        return false;
      }
      
      const health = await response.json();
      console.log(`✅ WPPConnect server health check successful:`, health);
      // If server is healthy and responds, consider it connected
      return health.message === 'OK';
      
    } catch (error) {
      console.error('❌ WPPConnect connection check failed:', error.message);
      return false;
    }
  }

  /**
   * Get session status
   * @returns {Promise<Object>} - Session status
   */
  async getSessionStatus() {
    try {
      const url = `${this.baseUrl}/api/${this.sessionId}/status`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.error('❌ Failed to get session status:', error.message);
      throw error;
    }
  }

  /**
   * Health check for the WPPConnect server
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      const isConnected = await this.checkConnection();
      const status = await this.getSessionStatus();
      
      return {
        server: 'wppconnect-server',
        connected: isConnected,
        sessionId: this.sessionId,
        status: status.status,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        server: 'wppconnect-server',
        connected: false,
        sessionId: this.sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Utility function for sleep/delay
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WPPConnectClient;
