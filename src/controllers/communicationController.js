const CommunicationAnalyticsService = require('../services/communicationAnalyticsService');
const CommunicationManagementService = require('../services/communicationManagementService');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

// Initialize service instances
const communicationAnalyticsService = new CommunicationAnalyticsService();
const communicationManagementService = new CommunicationManagementService();

/**
 * Get communication analytics for an organization
 */
const getAnalytics = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { 
      startDate, 
      endDate, 
      period = 'daily',
      metrics = 'all'
    } = req.query;

    const analytics = await communicationAnalyticsService.getAnalytics(organizationId, {
      startDate,
      endDate,
      period,
      metrics: metrics === 'all' ? ['all'] : metrics.split(',')
    });

    res.status(200).json({
      success: true,
      data: {
        analytics
      },
      message: 'Analytics data retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting analytics:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Get communication logs for an organization
 */
const getCommunicationLogs = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { 
      startDate, 
      endDate, 
      channel,
      status,
      limit = 100,
      offset = 0
    } = req.query;

    const logs = await communicationAnalyticsService.getCommunicationLogs(organizationId, {
      startDate,
      endDate,
      channel,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: {
        ...logs
      },
      message: 'Communication logs retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting communication logs:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Get parent engagement metrics
 */
const getParentEngagement = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { startDate, endDate } = req.query;

    const engagement = await communicationAnalyticsService.getParentEngagementMetrics(organizationId, {
      startDate,
      endDate
    });

    res.status(200).json({
      success: true,
      data: {
        engagement
      },
      message: 'Parent engagement metrics retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting parent engagement:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Generate communication report
 */
const generateReport = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { reportType } = req.params;
    const { startDate, endDate, format = 'json' } = req.query;

    const validReportTypes = ['summary', 'detailed', 'engagement', 'cost_analysis'];
    if (!validReportTypes.includes(reportType)) {
      throw new AppError(`Invalid report type. Must be one of: ${validReportTypes.join(', ')}`, 400);
    }

    const report = await communicationAnalyticsService.generateReport(organizationId, reportType, {
      startDate,
      endDate,
      format
    });

    res.status(200).json({
      success: true,
      data: {
        report
      },
      message: `${reportType} report generated successfully`
    });

  } catch (error) {
    logger.error('Error generating report:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Get communication settings
 */
const getCommunicationSettings = async (req, res) => {
  try {
    const { organizationId } = req.user;

    const settings = await communicationAnalyticsService.getCommunicationSettings(organizationId);

    res.status(200).json({
      success: true,
      data: {
        settings
      },
      message: 'Communication settings retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting communication settings:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Update communication settings
 */
const updateCommunicationSettings = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const updates = req.body;

    const settings = await communicationAnalyticsService.updateCommunicationSettings(organizationId, updates);

    res.status(200).json({
      success: true,
      data: {
        settings
      },
      message: 'Communication settings updated successfully'
    });

  } catch (error) {
    logger.error('Error updating communication settings:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Get parent contacts
 */
const getParentContacts = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { 
      studentId, 
      isActive,
      limit = 100,
      offset = 0
    } = req.query;

    const contacts = await communicationManagementService.getParentContacts(organizationId, {
      studentId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: {
        ...contacts
      },
      message: 'Parent contacts retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting parent contacts:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Create parent contact
 */
const createParentContact = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const contactData = req.body;

    const contact = await communicationManagementService.createOrUpdateParentContact(organizationId, contactData);

    res.status(201).json({
      success: true,
      data: {
        contact
      },
      message: 'Parent contact created successfully'
    });

  } catch (error) {
    logger.error('Error creating parent contact:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Update parent contact
 */
const updateParentContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const updateData = req.body;

    const contact = await communicationManagementService.updateParentContact(contactId, updateData);

    res.status(200).json({
      success: true,
      data: {
        contact
      },
      message: 'Parent contact updated successfully'
    });

  } catch (error) {
    logger.error('Error updating parent contact:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Handle opt-out request
 */
const handleOptOut = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { phoneNumber, optOutType = 'all' } = req.body;

    if (!phoneNumber) {
      throw new AppError('Phone number is required', 400);
    }

    const optOut = await communicationManagementService.handleOptOut(organizationId, phoneNumber, optOutType);

    res.status(200).json({
      success: true,
      data: {
        optOut
      },
      message: 'Opt-out request processed successfully'
    });

  } catch (error) {
    logger.error('Error handling opt-out:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Handle opt-in request
 */
const handleOptIn = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      throw new AppError('Phone number is required', 400);
    }

    const result = await communicationManagementService.handleOptIn(organizationId, phoneNumber);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Opt-in request processed successfully'
    });

  } catch (error) {
    logger.error('Error handling opt-in:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Get communication preferences for a contact
 */
const getCommunicationPreferences = async (req, res) => {
  try {
    const { contactId } = req.params;

    const preferences = await communicationManagementService.getCommunicationPreferences(contactId);

    res.status(200).json({
      success: true,
      data: {
        preferences
      },
      message: 'Communication preferences retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting communication preferences:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Update communication preferences for a contact
 */
const updateCommunicationPreferences = async (req, res) => {
  try {
    const { contactId } = req.params;
    const updates = req.body;

    const preferences = await communicationManagementService.updateCommunicationPreferences(contactId, updates);

    res.status(200).json({
      success: true,
      data: {
        preferences
      },
      message: 'Communication preferences updated successfully'
    });

  } catch (error) {
    logger.error('Error updating communication preferences:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Get communication history for a contact
 */
const getCommunicationHistory = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { recipientId } = req.params;
    const { 
      startDate, 
      endDate, 
      messageType,
      limit = 50,
      offset = 0
    } = req.query;

    const history = await communicationManagementService.getCommunicationHistory(organizationId, recipientId, {
      startDate,
      endDate,
      messageType,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: {
        ...history
      },
      message: 'Communication history retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting communication history:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Get compliance report
 */
const getComplianceReport = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { startDate, endDate } = req.query;

    const report = await communicationManagementService.getComplianceReport(organizationId, {
      startDate,
      endDate
    });

    res.status(200).json({
      success: true,
      data: {
        report
      },
      message: 'Compliance report generated successfully'
    });

  } catch (error) {
    logger.error('Error getting compliance report:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Bulk import parent contacts
 */
const bulkImportContacts = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      throw new AppError('Contacts array is required and must not be empty', 400);
    }

    const results = await communicationManagementService.bulkImportContacts(organizationId, contacts);

    res.status(200).json({
      success: true,
      data: {
        results
      },
      message: `Bulk import completed. ${results.successful} successful, ${results.failed} failed.`
    });

  } catch (error) {
    logger.error('Error in bulk import:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Export parent contacts
 */
const exportContacts = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { format = 'json' } = req.query;

    const exportData = await communicationManagementService.exportContacts(organizationId, format);

    res.status(200).json({
      success: true,
      data: exportData,
      message: `Contacts exported successfully in ${format} format`
    });

  } catch (error) {
    logger.error('Error exporting contacts:', error);
    throw new AppError(error.message, 500);
  }
};

/**
 * Record a test communication event (for testing analytics)
 */
const recordTestEvent = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const eventData = {
      organizationId,
      ...req.body
    };

    const eventId = await communicationAnalyticsService.recordCommunicationEvent(eventData);

    res.status(200).json({
      success: true,
      data: {
        eventId
      },
      message: 'Test communication event recorded successfully'
    });

  } catch (error) {
    logger.error('Error recording test event:', error);
    throw new AppError(error.message, 500);
  }
};

module.exports = {
  getAnalytics,
  getCommunicationLogs,
  getParentEngagement,
  generateReport,
  getCommunicationSettings,
  updateCommunicationSettings,
  getParentContacts,
  createParentContact,
  updateParentContact,
  handleOptOut,
  handleOptIn,
  getCommunicationPreferences,
  updateCommunicationPreferences,
  getCommunicationHistory,
  getComplianceReport,
  bulkImportContacts,
  exportContacts,
  recordTestEvent
};
