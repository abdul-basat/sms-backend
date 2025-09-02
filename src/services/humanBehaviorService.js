/**
 * Human Behavior Simulation Service
 * Implements sophisticated anti-detection algorithms for WhatsApp messaging
 * Now uses centralized time configuration
 */

const logger = require('../utils/logger');
const { globalTimeConfigService } = require('./globalTimeConfigService');

class HumanBehaviorService {
  constructor() {
    this.timeConfig = globalTimeConfigService;
    this.activityPatterns = {
      conservative: { min: 8, max: 20, baseDelay: 15 },
      moderate: { min: 5, max: 15, baseDelay: 10 },
      aggressive: { min: 2, max: 12, baseDelay: 6 }
    };
    
    this.typingPatterns = {
      slow: { min: 1500, max: 4000 }, // 1.5-4 seconds per message
      normal: { min: 800, max: 2500 }, // 0.8-2.5 seconds per message
      fast: { min: 300, max: 1200 }    // 0.3-1.2 seconds per message
    };

    this.dailyVariationSeed = new Date().toDateString();
    this.messagesSentToday = 0;
  }

  /**
   * Generate human-like delay patterns with jitter
   * @param {string} pattern - conservative, moderate, aggressive
   * @param {number} messageLength - Length of message for typing simulation
   * @param {number} messageIndex - Index in current batch
   * @param {number} totalMessages - Total messages in batch
   * @returns {Promise<number>} - Delay in milliseconds
   */
  async generateHumanDelay(pattern = 'moderate', messageLength = 100, messageIndex = 0, totalMessages = 1) {
    try {
      const config = this.activityPatterns[pattern] || this.activityPatterns.moderate;
      
      // Base delay calculation
      let baseDelay = config.baseDelay * 1000; // Convert to milliseconds
      
      // Typing time simulation based on message length
      const typingTime = this.calculateTypingTime(messageLength, 'normal');
      
      // Random jitter component (30-150% of base delay)
      const jitterMultiplier = 0.3 + (Math.random() * 1.2);
      const jitterDelay = baseDelay * jitterMultiplier;
      
      // Position-based variation (first and last messages get longer delays)
      let positionMultiplier = 1;
      if (messageIndex === 0) {
        positionMultiplier = 1.5; // First message takes longer (thinking time)
      } else if (messageIndex === totalMessages - 1) {
        positionMultiplier = 1.3; // Last message slightly longer
      }
      
      // Daily variation to avoid same patterns
      const dailyVariation = this.getDailyVariation();
      
      // Fatigue simulation (longer delays as more messages sent)
      const fatigueMultiplier = 1 + (this.messagesSentToday * 0.01); // 1% increase per message
      
      // Combine all factors
      const totalDelay = Math.floor(
        (typingTime + jitterDelay) * 
        positionMultiplier * 
        dailyVariation * 
        fatigueMultiplier
      );
      
      // Ensure delay is within reasonable bounds
      const minDelay = config.min * 1000;
      const maxDelay = config.max * 1000;
      
      const finalDelay = Math.max(minDelay, Math.min(maxDelay, totalDelay));
      
      logger.debug(`[HumanBehaviorService] Generated delay: ${finalDelay}ms`, {
        pattern,
        messageLength,
        messageIndex,
        totalMessages,
        baseDelay,
        typingTime,
        jitterDelay,
        positionMultiplier,
        dailyVariation,
        fatigueMultiplier,
        finalDelay
      });

      this.messagesSentToday++;
      return finalDelay;

    } catch (error) {
      logger.error('[HumanBehaviorService] Error generating human delay:', error);
      // Fallback to simple random delay
      return 5000 + Math.random() * 10000;
    }
  }

  /**
   * Calculate typing time based on message length and typing speed
   * @param {number} messageLength - Length of message
   * @param {string} speed - slow, normal, fast
   * @returns {number} - Typing time in milliseconds
   */
  calculateTypingTime(messageLength, speed = 'normal') {
    const pattern = this.typingPatterns[speed] || this.typingPatterns.normal;
    
    // Average characters per second based on speed
    const charsPerSecond = {
      slow: 2.5,
      normal: 4.2,
      fast: 6.8
    };
    
    const baseTypingTime = (messageLength / charsPerSecond[speed]) * 1000;
    
    // Add random variation (±30%)
    const variation = 0.7 + (Math.random() * 0.6);
    
    return Math.floor(baseTypingTime * variation);
  }

  /**
   * Get daily variation multiplier to ensure different patterns each day
   * @returns {number} - Variation multiplier
   */
  getDailyVariation() {
    // Create deterministic but varying seed based on date
    const seed = this.stringToSeed(this.dailyVariationSeed);
    const random = this.seededRandom(seed);
    
    // Return variation between 0.8 and 1.4
    return 0.8 + (random * 0.6);
  }

  /**
   * Generate burst pattern detection and prevention
   * @param {Array} recentMessages - Recent message timestamps
   * @param {number} timeWindowMs - Time window to check (default 5 minutes)
   * @returns {Object} - Burst analysis and recommendation
   */
  analyzeBurstPattern(recentMessages, timeWindowMs = 300000) {
    const now = Date.now();
    const recentWindow = recentMessages.filter(timestamp => (now - timestamp) <= timeWindowMs);
    
    const messagesInWindow = recentWindow.length;
    const averageInterval = recentWindow.length > 1 
      ? (recentWindow[recentWindow.length - 1] - recentWindow[0]) / (recentWindow.length - 1)
      : 0;

    // Detect potential burst (too many messages too quickly)
    const isBurst = messagesInWindow > 10 && averageInterval < 15000; // More than 10 messages with avg < 15s interval
    
    // Calculate recommended delay to break pattern
    let recommendedDelay = 0;
    if (isBurst) {
      recommendedDelay = 60000 + Math.random() * 120000; // 1-3 minutes break
    }

    return {
      isBurst,
      messagesInWindow,
      averageInterval,
      recommendedDelay,
      riskLevel: this.calculateRiskLevel(messagesInWindow, averageInterval)
    };
  }

  /**
   * Calculate risk level based on messaging patterns
   * @param {number} messagesInWindow - Messages in time window
   * @param {number} averageInterval - Average interval between messages
   * @returns {string} - low, medium, high, critical
   */
  calculateRiskLevel(messagesInWindow, averageInterval) {
    if (messagesInWindow > 15 && averageInterval < 10000) return 'critical';
    if (messagesInWindow > 10 && averageInterval < 15000) return 'high';
    if (messagesInWindow > 6 && averageInterval < 20000) return 'medium';
    return 'low';
  }

  /**
   * Check if current time is within business hours using centralized configuration
   * @param {string} timezone - User's timezone (deprecated, now uses global config)
   * @param {Object} businessHours - Business hours configuration (deprecated, now uses global config)
   * @returns {boolean} - Whether current time is within business hours
   */
  isWithinBusinessHours(timezone, businessHours) {
    // Use centralized time configuration instead of parameters
    return this.timeConfig.isWithinBusinessHours('humanBehavior');
  }

  /**
   * Simulate typing indicator delay
   * @param {string} phoneNumber - Recipient phone number
   * @param {number} duration - Typing duration in milliseconds
   * @returns {Promise<void>}
   */
  async simulateTyping(phoneNumber, duration = 2000) {
    // This would integrate with WhatsApp API to show typing indicator
    logger.debug(`[HumanBehaviorService] Simulating typing for ${phoneNumber} for ${duration}ms`);
    
    // Placeholder for actual typing indicator implementation
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * Generate intelligent queue processing order
   * @param {Array} messages - Array of messages to send
   * @returns {Array} - Reordered messages with optimal timing
   */
  generateOptimalQueueOrder(messages) {
    // Shuffle messages to avoid alphabetical or sequential patterns
    const shuffled = [...messages].sort(() => Math.random() - 0.5);
    
    // Group by recipient to avoid rapid-fire to same number
    const grouped = new Map();
    shuffled.forEach(msg => {
      const phone = msg.phoneNumber;
      if (!grouped.has(phone)) {
        grouped.set(phone, []);
      }
      grouped.get(phone).push(msg);
    });
    
    // Interleave messages from different recipients
    const result = [];
    const recipients = Array.from(grouped.keys());
    let recipientIndex = 0;
    
    while (result.length < messages.length) {
      const currentRecipient = recipients[recipientIndex];
      const recipientMessages = grouped.get(currentRecipient);
      
      if (recipientMessages && recipientMessages.length > 0) {
        result.push(recipientMessages.shift());
      }
      
      recipientIndex = (recipientIndex + 1) % recipients.length;
      
      // Remove empty recipients
      if (grouped.get(currentRecipient)?.length === 0) {
        recipients.splice(recipients.indexOf(currentRecipient), 1);
        if (recipients.length === 0) break;
        recipientIndex = recipientIndex % recipients.length;
      }
    }
    
    return result;
  }

  /**
   * Utility functions
   */
  stringToSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Reset daily counters (should be called daily)
   */
  resetDailyCounters() {
    this.messagesSentToday = 0;
    this.dailyVariationSeed = new Date().toDateString();
    logger.info('[HumanBehaviorService] Daily counters reset');
  }

  /**
   * Get current status and statistics
   */
  getStatus() {
    return {
      messagesSentToday: this.messagesSentToday,
      dailyVariationSeed: this.dailyVariationSeed,
      activityPatterns: Object.keys(this.activityPatterns),
      typingPatterns: Object.keys(this.typingPatterns)
    };
  }
}

module.exports = HumanBehaviorService;
