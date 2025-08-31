const { dataStore } = require('../models/dataStore');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class CommunicationAnalyticsService {
  constructor() {
    this.analytics = dataStore.analytics || new Map();
    this.communicationLogs = dataStore.communicationLogs || new Map();
    this.communicationSettings = dataStore.communicationSettings || new Map();
    
    // Ensure dataStore has our collections
    dataStore.analytics = this.analytics;
    dataStore.communicationLogs = this.communicationLogs;
    dataStore.communicationSettings = this.communicationSettings;
  }

  /**
   * Record a communication event for analytics
   */
  async recordCommunicationEvent(eventData) {
    try {
      const {
        organizationId,
        recipientId,
        channel, // whatsapp, sms, email
        type, // fee_reminder, payment_confirmation, attendance, enrollment
        status, // sent, delivered, failed, read
        cost = 0,
        templateId = null,
        metadata = {}
      } = eventData;

      // Validate required fields
      if (!organizationId || !recipientId || !channel || !type || !status) {
        throw new Error('Missing required fields for communication event');
      }

      const eventId = uuidv4();
      const timestamp = new Date();

      const communicationEvent = {
        id: eventId,
        organizationId,
        recipientId,
        channel,
        type,
        status,
        cost,
        templateId,
        metadata,
        timestamp,
        createdAt: timestamp
      };

      // Store in communication logs
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.communicationLogs.set(logId, {
        id: logId,
        organizationId,
        recipientId,
        templateId,
        channel,
        content: metadata.content || '',
        status,
        sentAt: timestamp,
        deliveredAt: status === 'delivered' ? timestamp : null,
        failureReason: metadata.failureReason || null,
        cost,
        createdAt: timestamp
      });

      // Update analytics metrics
      await this.updateAnalyticsMetrics(organizationId, communicationEvent);

      logger.info('Communication event recorded', { eventId, organizationId, channel, type, status });
      return eventId;

    } catch (error) {
      logger.error('Error recording communication event:', error);
      throw error;
    }
  }

  /**
   * Update analytics metrics based on communication event
   */
  async updateAnalyticsMetrics(organizationId, event) {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const metricsKey = `${organizationId}_${today}`;
      
      // Get or create daily metrics
      let dayMetrics = this.analytics.get(metricsKey) || {
        id: metricsKey,
        organizationId,
        date: today,
        totalMessages: 0,
        messagesByChannel: {},
        messagesByType: {},
        messagesByStatus: {},
        totalCost: 0,
        responseRate: 0,
        deliveryRate: 0,
        failureRate: 0,
        updatedAt: new Date()
      };

      // Update metrics
      dayMetrics.totalMessages += 1;
      dayMetrics.messagesByChannel[event.channel] = (dayMetrics.messagesByChannel[event.channel] || 0) + 1;
      dayMetrics.messagesByType[event.type] = (dayMetrics.messagesByType[event.type] || 0) + 1;
      dayMetrics.messagesByStatus[event.status] = (dayMetrics.messagesByStatus[event.status] || 0) + 1;
      dayMetrics.totalCost += event.cost;
      dayMetrics.updatedAt = new Date();

      // Calculate rates
      const totalSent = dayMetrics.messagesByStatus.sent || 0;
      const totalDelivered = dayMetrics.messagesByStatus.delivered || 0;
      const totalFailed = dayMetrics.messagesByStatus.failed || 0;
      const totalRead = dayMetrics.messagesByStatus.read || 0;

      if (totalSent > 0) {
        dayMetrics.deliveryRate = ((totalDelivered + totalRead) / totalSent * 100).toFixed(2);
        dayMetrics.failureRate = (totalFailed / totalSent * 100).toFixed(2);
        dayMetrics.responseRate = (totalRead / totalSent * 100).toFixed(2);
      }

      // Store updated metrics
      this.analytics.set(metricsKey, dayMetrics);

      // Also update monthly aggregates
      await this.updateMonthlyMetrics(organizationId, event, today);

    } catch (error) {
      logger.error('Error updating analytics metrics:', error);
      throw error;
    }
  }

  /**
   * Update monthly aggregated metrics
   */
  async updateMonthlyMetrics(organizationId, event, date) {
    try {
      const month = date.substring(0, 7); // YYYY-MM
      const monthlyKey = `${organizationId}_${month}_monthly`;
      
      let monthMetrics = this.analytics.get(monthlyKey) || {
        id: monthlyKey,
        organizationId,
        month,
        totalMessages: 0,
        messagesByChannel: {},
        messagesByType: {},
        totalCost: 0,
        averageDailyMessages: 0,
        peakDay: null,
        updatedAt: new Date()
      };

      monthMetrics.totalMessages += 1;
      monthMetrics.messagesByChannel[event.channel] = (monthMetrics.messagesByChannel[event.channel] || 0) + 1;
      monthMetrics.messagesByType[event.type] = (monthMetrics.messagesByType[event.type] || 0) + 1;
      monthMetrics.totalCost += event.cost;
      monthMetrics.updatedAt = new Date();

      // Calculate average daily messages
      const daysInMonth = new Date(month + '-01').getDate();
      monthMetrics.averageDailyMessages = (monthMetrics.totalMessages / daysInMonth).toFixed(2);

      this.analytics.set(monthlyKey, monthMetrics);

    } catch (error) {
      logger.error('Error updating monthly metrics:', error);
      throw error;
    }
  }

  /**
   * Get analytics data for an organization
   */
  async getAnalytics(organizationId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        period = 'daily', // daily, weekly, monthly
        metrics = ['all'] // specific metrics to return
      } = options;

      const results = {
        organizationId,
        period,
        data: [],
        summary: {
          totalMessages: 0,
          totalCost: 0,
          averageDeliveryRate: 0,
          channelBreakdown: {},
          typeBreakdown: {}
        }
      };

      // Get date range
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const end = endDate ? new Date(endDate) : new Date();

      // Collect analytics data based on period
      for (const [key, analytics] of this.analytics.entries()) {
        if (!key.startsWith(organizationId)) continue;

        const analyticsDate = new Date(analytics.date || analytics.month + '-01');
        if (analyticsDate >= start && analyticsDate <= end) {
          if (period === 'daily' && analytics.date) {
            results.data.push(analytics);
          } else if (period === 'monthly' && analytics.month) {
            results.data.push(analytics);
          }
        }
      }

      // Calculate summary
      results.data.forEach(item => {
        results.summary.totalMessages += item.totalMessages || 0;
        results.summary.totalCost += item.totalCost || 0;

        // Aggregate channel breakdown
        Object.keys(item.messagesByChannel || {}).forEach(channel => {
          results.summary.channelBreakdown[channel] = 
            (results.summary.channelBreakdown[channel] || 0) + item.messagesByChannel[channel];
        });

        // Aggregate type breakdown
        Object.keys(item.messagesByType || {}).forEach(type => {
          results.summary.typeBreakdown[type] = 
            (results.summary.typeBreakdown[type] || 0) + item.messagesByType[type];
        });
      });

      // Calculate average delivery rate
      const totalDeliveryRates = results.data.map(item => parseFloat(item.deliveryRate || 0));
      results.summary.averageDeliveryRate = totalDeliveryRates.length > 0 
        ? (totalDeliveryRates.reduce((a, b) => a + b, 0) / totalDeliveryRates.length).toFixed(2)
        : 0;

      logger.info('Analytics data retrieved', { 
        organizationId, 
        period, 
        recordsFound: results.data.length 
      });
      
      return results;

    } catch (error) {
      logger.error('Error getting analytics data:', error);
      throw error;
    }
  }

  /**
   * Get communication logs for an organization
   */
  async getCommunicationLogs(organizationId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        channel,
        status,
        limit = 100,
        offset = 0
      } = options;

      const logs = [];
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      for (const [key, log] of this.communicationLogs.entries()) {
        if (log.organizationId !== organizationId) continue;

        // Apply filters
        if (start && new Date(log.createdAt) < start) continue;
        if (end && new Date(log.createdAt) > end) continue;
        if (channel && log.channel !== channel) continue;
        if (status && log.status !== status) continue;

        logs.push(log);
      }

      // Sort by creation date (newest first)
      logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + limit);

      logger.info('Communication logs retrieved', { 
        organizationId, 
        totalFound: logs.length,
        returned: paginatedLogs.length 
      });

      return {
        logs: paginatedLogs,
        total: logs.length,
        limit,
        offset
      };

    } catch (error) {
      logger.error('Error getting communication logs:', error);
      throw error;
    }
  }

  /**
   * Get or create communication settings for an organization
   */
  async getCommunicationSettings(organizationId) {
    try {
      let settings = this.communicationSettings.get(organizationId);
      
      if (!settings) {
        settings = {
          id: organizationId,
          organizationId,
          whatsappEnabled: true,
          smsEnabled: false,
          emailEnabled: false,
          reminderSchedule: {
            days: [3, 1, 0], // Days before due date
            times: ["09:00", "15:00"] // Times to send reminders
          },
          autoConfirmPayments: true,
          language: 'en',
          timezone: 'UTC',
          optOutEnabled: true,
          parentEngagementTracking: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        this.communicationSettings.set(organizationId, settings);
      }

      return settings;

    } catch (error) {
      logger.error('Error getting communication settings:', error);
      throw error;
    }
  }

  /**
   * Update communication settings for an organization
   */
  async updateCommunicationSettings(organizationId, updates) {
    try {
      const currentSettings = await this.getCommunicationSettings(organizationId);
      
      const updatedSettings = {
        ...currentSettings,
        ...updates,
        updatedAt: new Date()
      };

      this.communicationSettings.set(organizationId, updatedSettings);

      logger.info('Communication settings updated', { organizationId });
      return updatedSettings;

    } catch (error) {
      logger.error('Error updating communication settings:', error);
      throw error;
    }
  }

  /**
   * Get parent engagement metrics
   */
  async getParentEngagementMetrics(organizationId, options = {}) {
    try {
      const { startDate, endDate } = options;
      const engagement = {
        totalParents: 0,
        activeParents: 0, // Parents who have read messages
        responseRate: 0,
        averageResponseTime: 0,
        channelPreferences: {},
        engagementTrend: []
      };

      // Get communication logs for the period
      const logsData = await this.getCommunicationLogs(organizationId, {
        startDate,
        endDate,
        limit: 10000 // Get all for analysis
      });

      const logs = logsData.logs;
      const parentInteractions = new Map();

      logs.forEach(log => {
        const parentId = log.recipientId;
        if (!parentInteractions.has(parentId)) {
          parentInteractions.set(parentId, {
            messagesSent: 0,
            messagesRead: 0,
            channels: new Set(),
            firstContact: log.createdAt,
            lastActivity: log.createdAt
          });
        }

        const interaction = parentInteractions.get(parentId);
        interaction.messagesSent += 1;
        
        if (log.status === 'read') {
          interaction.messagesRead += 1;
        }
        
        interaction.channels.add(log.channel);
        interaction.lastActivity = log.createdAt;
      });

      // Calculate metrics
      engagement.totalParents = parentInteractions.size;
      engagement.activeParents = Array.from(parentInteractions.values())
        .filter(p => p.messagesRead > 0).length;
      
      if (engagement.totalParents > 0) {
        engagement.responseRate = ((engagement.activeParents / engagement.totalParents) * 100).toFixed(2);
      }

      // Channel preferences
      logs.forEach(log => {
        engagement.channelPreferences[log.channel] = 
          (engagement.channelPreferences[log.channel] || 0) + 1;
      });

      logger.info('Parent engagement metrics calculated', { organizationId });
      return engagement;

    } catch (error) {
      logger.error('Error getting parent engagement metrics:', error);
      throw error;
    }
  }

  /**
   * Generate communication reports
   */
  async generateReport(organizationId, reportType, options = {}) {
    try {
      const { startDate, endDate } = options;

      let report;

      switch (reportType) {
        case 'summary':
          report = await this.generateSummaryReport(organizationId, options);
          break;
        case 'detailed':
          report = await this.generateDetailedReport(organizationId, options);
          break;
        case 'engagement':
          report = await this.generateEngagementReport(organizationId, options);
          break;
        case 'cost_analysis':
          report = await this.generateCostAnalysisReport(organizationId, options);
          break;
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }

      logger.info('Communication report generated', { organizationId, reportType });
      return report;

    } catch (error) {
      logger.error('Error generating communication report:', error);
      throw error;
    }
  }

  /**
   * Generate summary report
   */
  async generateSummaryReport(organizationId, options) {
    const analytics = await this.getAnalytics(organizationId, options);
    const engagement = await this.getParentEngagementMetrics(organizationId, options);

    return {
      type: 'summary',
      organizationId,
      period: options,
      generatedAt: new Date(),
      data: {
        totalMessages: analytics.summary.totalMessages,
        totalCost: analytics.summary.totalCost,
        averageDeliveryRate: analytics.summary.averageDeliveryRate,
        channelBreakdown: analytics.summary.channelBreakdown,
        typeBreakdown: analytics.summary.typeBreakdown,
        parentEngagement: engagement
      }
    };
  }

  /**
   * Generate detailed report
   */
  async generateDetailedReport(organizationId, options) {
    const analytics = await this.getAnalytics(organizationId, options);
    const logs = await this.getCommunicationLogs(organizationId, { 
      ...options, 
      limit: 1000 
    });

    return {
      type: 'detailed',
      organizationId,
      period: options,
      generatedAt: new Date(),
      data: {
        analytics: analytics.data,
        summary: analytics.summary,
        recentCommunications: logs.logs,
        totalCommunications: logs.total
      }
    };
  }

  /**
   * Generate engagement report
   */
  async generateEngagementReport(organizationId, options) {
    const engagement = await this.getParentEngagementMetrics(organizationId, options);

    return {
      type: 'engagement',
      organizationId,
      period: options,
      generatedAt: new Date(),
      data: engagement
    };
  }

  /**
   * Generate cost analysis report
   */
  async generateCostAnalysisReport(organizationId, options) {
    const analytics = await this.getAnalytics(organizationId, options);

    const costAnalysis = {
      totalCost: analytics.summary.totalCost,
      costByChannel: {},
      costByType: {},
      averageCostPerMessage: 0,
      costTrend: analytics.data.map(item => ({
        date: item.date || item.month,
        cost: item.totalCost || 0,
        messages: item.totalMessages || 0
      }))
    };

    // Calculate average cost per message
    if (analytics.summary.totalMessages > 0) {
      costAnalysis.averageCostPerMessage = 
        (analytics.summary.totalCost / analytics.summary.totalMessages).toFixed(4);
    }

    return {
      type: 'cost_analysis',
      organizationId,
      period: options,
      generatedAt: new Date(),
      data: costAnalysis
    };
  }
}

module.exports = CommunicationAnalyticsService;
