const { dataStore } = require('../models/dataStore');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class CommunicationManagementService {
  constructor() {
    this.parentContacts = dataStore.parentContacts || new Map();
    this.optOuts = dataStore.optOuts || new Map();
    this.communicationPreferences = dataStore.communicationPreferences || new Map();
    this.communicationHistory = dataStore.communicationHistory || new Map();
    
    // Ensure dataStore has our collections
    dataStore.parentContacts = this.parentContacts;
    dataStore.optOuts = this.optOuts;
    dataStore.communicationPreferences = this.communicationPreferences;
    dataStore.communicationHistory = this.communicationHistory;
  }

  /**
   * Create or update parent contact information
   */
  async createOrUpdateParentContact(organizationId, contactData) {
    try {
      const {
        studentId,
        parentName,
        primaryPhone,
        secondaryPhone,
        email,
        relationship = 'parent',
        preferredChannel = 'whatsapp',
        language = 'en'
      } = contactData;

      // Validate required fields
      if (!organizationId || !studentId || !parentName || !primaryPhone) {
        throw new Error('Missing required fields for parent contact');
      }

      const contactId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const parentContact = {
        id: contactId,
        organizationId,
        studentId,
        parentName,
        primaryPhone,
        secondaryPhone: secondaryPhone || null,
        email: email || null,
        relationship,
        preferredChannel,
        language,
        isActive: true,
        isOptedOut: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.parentContacts.set(contactId, parentContact);

      // Also create default communication preferences
      await this.createDefaultPreferences(contactId, organizationId);

      logger.info('Parent contact created/updated', { contactId, organizationId, studentId });
      return parentContact;

    } catch (error) {
      logger.error('Error creating parent contact:', error);
      throw error;
    }
  }

  /**
   * Create default communication preferences for a parent
   */
  async createDefaultPreferences(contactId, organizationId) {
    try {
      const preferences = {
        id: contactId,
        organizationId,
        contactId,
        feeReminders: true,
        paymentConfirmations: true,
        attendanceNotifications: true,
        academicUpdates: true,
        eventAnnouncements: true,
        emergencyAlerts: true,
        preferredChannels: {
          feeReminders: 'whatsapp',
          paymentConfirmations: 'whatsapp',
          attendanceNotifications: 'whatsapp',
          academicUpdates: 'whatsapp',
          eventAnnouncements: 'whatsapp',
          emergencyAlerts: 'whatsapp'
        },
        quietHours: {
          enabled: true,
          startTime: '22:00',
          endTime: '08:00'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.communicationPreferences.set(contactId, preferences);
      return preferences;

    } catch (error) {
      logger.error('Error creating default preferences:', error);
      throw error;
    }
  }

  /**
   * Get parent contacts for an organization
   */
  async getParentContacts(organizationId, options = {}) {
    try {
      const { studentId, isActive, limit = 100, offset = 0 } = options;

      const contacts = [];

      for (const [key, contact] of this.parentContacts.entries()) {
        if (contact.organizationId !== organizationId) continue;
        
        // Apply filters
        if (studentId && contact.studentId !== studentId) continue;
        if (isActive !== undefined && contact.isActive !== isActive) continue;

        contacts.push(contact);
      }

      // Sort by creation date (newest first)
      contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply pagination
      const paginatedContacts = contacts.slice(offset, offset + limit);

      return {
        contacts: paginatedContacts,
        total: contacts.length,
        limit,
        offset
      };

    } catch (error) {
      logger.error('Error getting parent contacts:', error);
      throw error;
    }
  }

  /**
   * Update parent contact
   */
  async updateParentContact(contactId, updateData) {
    try {
      const contact = this.parentContacts.get(contactId);
      if (!contact) {
        throw new Error('Parent contact not found');
      }

      const updatedContact = {
        ...contact,
        ...updateData,
        updatedAt: new Date()
      };

      this.parentContacts.set(contactId, updatedContact);

      logger.info('Parent contact updated', { contactId });
      return updatedContact;

    } catch (error) {
      logger.error('Error updating parent contact:', error);
      throw error;
    }
  }

  /**
   * Handle opt-out request
   */
  async handleOptOut(organizationId, phoneNumber, optOutType = 'all') {
    try {
      const optOutId = `optout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const optOut = {
        id: optOutId,
        organizationId,
        phoneNumber,
        optOutType, // 'all', 'marketing', 'reminders', etc.
        reason: null,
        createdAt: new Date(),
        isActive: true
      };

      this.optOuts.set(optOutId, optOut);

      // Update parent contact status
      for (const [key, contact] of this.parentContacts.entries()) {
        if (contact.organizationId === organizationId && 
            (contact.primaryPhone === phoneNumber || contact.secondaryPhone === phoneNumber)) {
          contact.isOptedOut = true;
          contact.updatedAt = new Date();
          this.parentContacts.set(key, contact);
        }
      }

      logger.info('Opt-out request processed', { optOutId, organizationId, phoneNumber, optOutType });
      return optOut;

    } catch (error) {
      logger.error('Error handling opt-out:', error);
      throw error;
    }
  }

  /**
   * Handle opt-in request
   */
  async handleOptIn(organizationId, phoneNumber) {
    try {
      // Deactivate existing opt-outs
      for (const [key, optOut] of this.optOuts.entries()) {
        if (optOut.organizationId === organizationId && 
            optOut.phoneNumber === phoneNumber && 
            optOut.isActive) {
          optOut.isActive = false;
          optOut.updatedAt = new Date();
          this.optOuts.set(key, optOut);
        }
      }

      // Update parent contact status
      for (const [key, contact] of this.parentContacts.entries()) {
        if (contact.organizationId === organizationId && 
            (contact.primaryPhone === phoneNumber || contact.secondaryPhone === phoneNumber)) {
          contact.isOptedOut = false;
          contact.updatedAt = new Date();
          this.parentContacts.set(key, contact);
        }
      }

      logger.info('Opt-in request processed', { organizationId, phoneNumber });
      return { success: true, message: 'Successfully opted back in' };

    } catch (error) {
      logger.error('Error handling opt-in:', error);
      throw error;
    }
  }

  /**
   * Check if a phone number is opted out
   */
  async isOptedOut(organizationId, phoneNumber, messageType = 'all') {
    try {
      for (const [key, optOut] of this.optOuts.entries()) {
        if (optOut.organizationId === organizationId && 
            optOut.phoneNumber === phoneNumber && 
            optOut.isActive &&
            (optOut.optOutType === 'all' || optOut.optOutType === messageType)) {
          return true;
        }
      }
      return false;

    } catch (error) {
      logger.error('Error checking opt-out status:', error);
      return false; // Default to not opted out on error
    }
  }

  /**
   * Get communication preferences for a contact
   */
  async getCommunicationPreferences(contactId) {
    try {
      const preferences = this.communicationPreferences.get(contactId);
      if (!preferences) {
        throw new Error('Communication preferences not found');
      }
      return preferences;

    } catch (error) {
      logger.error('Error getting communication preferences:', error);
      throw error;
    }
  }

  /**
   * Update communication preferences
   */
  async updateCommunicationPreferences(contactId, updates) {
    try {
      const currentPreferences = await this.getCommunicationPreferences(contactId);
      
      const updatedPreferences = {
        ...currentPreferences,
        ...updates,
        updatedAt: new Date()
      };

      this.communicationPreferences.set(contactId, updatedPreferences);

      logger.info('Communication preferences updated', { contactId });
      return updatedPreferences;

    } catch (error) {
      logger.error('Error updating communication preferences:', error);
      throw error;
    }
  }

  /**
   * Get communication history for a contact
   */
  async getCommunicationHistory(organizationId, recipientId, options = {}) {
    try {
      const { startDate, endDate, messageType, limit = 50, offset = 0 } = options;

      const history = [];
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // Get from communication logs (from analytics service)
      const communicationLogs = dataStore.communicationLogs || new Map();
      
      for (const [key, log] of communicationLogs.entries()) {
        if (log.organizationId !== organizationId || log.recipientId !== recipientId) continue;

        // Apply filters
        if (start && new Date(log.createdAt) < start) continue;
        if (end && new Date(log.createdAt) > end) continue;
        if (messageType && log.type !== messageType) continue;

        history.push(log);
      }

      // Sort by creation date (newest first)
      history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply pagination
      const paginatedHistory = history.slice(offset, offset + limit);

      return {
        history: paginatedHistory,
        total: history.length,
        limit,
        offset
      };

    } catch (error) {
      logger.error('Error getting communication history:', error);
      throw error;
    }
  }

  /**
   * Get compliance report for communications
   */
  async getComplianceReport(organizationId, options = {}) {
    try {
      const { startDate, endDate } = options;

      const report = {
        organizationId,
        period: { startDate, endDate },
        generatedAt: new Date(),
        totalContacts: 0,
        activeContacts: 0,
        optedOutContacts: 0,
        optOutRate: 0,
        messagesBlocked: 0,
        complianceIssues: [],
        recommendations: []
      };

      // Count contacts
      for (const [key, contact] of this.parentContacts.entries()) {
        if (contact.organizationId !== organizationId) continue;
        
        report.totalContacts++;
        if (contact.isActive) report.activeContacts++;
        if (contact.isOptedOut) report.optedOutContacts++;
      }

      // Calculate opt-out rate
      if (report.totalContacts > 0) {
        report.optOutRate = ((report.optedOutContacts / report.totalContacts) * 100).toFixed(2);
      }

      // Count blocked messages (messages not sent due to opt-out)
      const communicationLogs = dataStore.communicationLogs || new Map();
      for (const [key, log] of communicationLogs.entries()) {
        if (log.organizationId === organizationId && log.status === 'blocked') {
          report.messagesBlocked++;
        }
      }

      // Generate recommendations
      if (report.optOutRate > 10) {
        report.recommendations.push('High opt-out rate detected. Review message frequency and content.');
      }
      if (report.messagesBlocked > 0) {
        report.recommendations.push(`${report.messagesBlocked} messages were blocked due to opt-outs. Ensure contact list is updated.`);
      }

      logger.info('Compliance report generated', { organizationId });
      return report;

    } catch (error) {
      logger.error('Error generating compliance report:', error);
      throw error;
    }
  }

  /**
   * Bulk import parent contacts
   */
  async bulkImportContacts(organizationId, contactsData) {
    try {
      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const contactData of contactsData) {
        try {
          await this.createOrUpdateParentContact(organizationId, contactData);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            contact: contactData,
            error: error.message
          });
        }
      }

      logger.info('Bulk import completed', { 
        organizationId, 
        successful: results.successful, 
        failed: results.failed 
      });
      
      return results;

    } catch (error) {
      logger.error('Error in bulk import:', error);
      throw error;
    }
  }

  /**
   * Export parent contacts
   */
  async exportContacts(organizationId, format = 'json') {
    try {
      const contactsData = await this.getParentContacts(organizationId, { limit: 10000 });
      
      let exportData;
      
      switch (format) {
        case 'json':
          exportData = JSON.stringify(contactsData.contacts, null, 2);
          break;
        case 'csv':
          exportData = this.convertToCSV(contactsData.contacts);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      logger.info('Contacts exported', { organizationId, format, count: contactsData.total });
      return {
        data: exportData,
        format,
        count: contactsData.total,
        exportedAt: new Date()
      };

    } catch (error) {
      logger.error('Error exporting contacts:', error);
      throw error;
    }
  }

  /**
   * Convert contacts to CSV format
   */
  convertToCSV(contacts) {
    if (contacts.length === 0) return '';

    const headers = [
      'ID', 'Student ID', 'Parent Name', 'Primary Phone', 'Secondary Phone', 
      'Email', 'Relationship', 'Preferred Channel', 'Language', 'Active', 
      'Opted Out', 'Created At'
    ];

    const csvData = [headers.join(',')];

    contacts.forEach(contact => {
      const row = [
        contact.id,
        contact.studentId,
        `"${contact.parentName}"`,
        contact.primaryPhone,
        contact.secondaryPhone || '',
        contact.email || '',
        contact.relationship,
        contact.preferredChannel,
        contact.language,
        contact.isActive,
        contact.isOptedOut,
        contact.createdAt
      ];
      csvData.push(row.join(','));
    });

    return csvData.join('\n');
  }

  /**
   * Get parent contact by phone number
   */
  async getContactByPhone(organizationId, phoneNumber) {
    try {
      for (const [key, contact] of this.parentContacts.entries()) {
        if (contact.organizationId === organizationId && 
            (contact.primaryPhone === phoneNumber || contact.secondaryPhone === phoneNumber)) {
          return contact;
        }
      }
      return null;

    } catch (error) {
      logger.error('Error getting contact by phone:', error);
      throw error;
    }
  }

  /**
   * Get parent contact by student ID
   */
  async getContactByStudentId(organizationId, studentId) {
    try {
      const contacts = [];
      
      for (const [key, contact] of this.parentContacts.entries()) {
        if (contact.organizationId === organizationId && contact.studentId === studentId) {
          contacts.push(contact);
        }
      }
      
      return contacts;

    } catch (error) {
      logger.error('Error getting contact by student ID:', error);
      throw error;
    }
  }
}

module.exports = CommunicationManagementService;
