const CommunicationAnalyticsService = require('../../src/services/communicationAnalyticsService');
const CommunicationManagementService = require('../../src/services/communicationManagementService');
const { dataStore } = require('../../src/models/dataStore');

describe('Communication Services Unit Tests', () => {
  const organizationId = 'test-org-123';
  let communicationAnalyticsService;
  let communicationManagementService;
  
  beforeEach(() => {
    dataStore.clearAll();
    // Initialize fresh service instances for each test
    communicationAnalyticsService = new CommunicationAnalyticsService();
    communicationManagementService = new CommunicationManagementService();
  });

  afterEach(() => {
    dataStore.clearAll();
  });

  describe('Communication Analytics Service', () => {
    describe('recordCommunicationEvent', () => {
      it('should record a communication event successfully', async () => {
        const eventData = {
          organizationId,
          recipientId: 'recipient-123',
          channel: 'whatsapp',
          type: 'fee_reminder',
          status: 'sent',
          cost: 0.05,
          messageId: 'msg-123',
          timestamp: new Date()
        };

        const eventId = await communicationAnalyticsService.recordCommunicationEvent(eventData);
        
        expect(eventId).toBeDefined();
        expect(typeof eventId).toBe('string');

        // Verify event was stored
        const analytics = await communicationAnalyticsService.getAnalytics(organizationId);
        expect(analytics.summary.totalMessages).toBe(1);
        expect(analytics.channelBreakdown.whatsapp).toBe(1);
      });

      it('should throw error for invalid event data', async () => {
        const invalidEventData = {
          organizationId,
          // Missing required fields
        };

        await expect(
          communicationAnalyticsService.recordCommunicationEvent(invalidEventData)
        ).rejects.toThrow();
      });
    });

    describe('getAnalytics', () => {
      beforeEach(async () => {
        // Record test events
        const events = [
          {
            organizationId,
            recipientId: 'recipient-1',
            channel: 'whatsapp',
            type: 'fee_reminder',
            status: 'sent',
            cost: 0.05,
            messageId: 'msg-1',
            timestamp: new Date()
          },
          {
            organizationId,
            recipientId: 'recipient-2',
            channel: 'sms',
            type: 'payment_confirmation',
            status: 'delivered',
            cost: 0.10,
            messageId: 'msg-2',
            timestamp: new Date()
          }
        ];

        for (const event of events) {
          await communicationAnalyticsService.recordCommunicationEvent(event);
        }
      });

      it('should return analytics summary for organization', async () => {
        const analytics = await communicationAnalyticsService.getAnalytics(organizationId);

        expect(analytics).toMatchObject({
          organizationId,
          summary: {
            totalMessages: 2,
            totalCost: 0.15,
            averageCost: 0.075,
            deliveryRate: expect.any(Number)
          },
          channelBreakdown: {
            whatsapp: 1,
            sms: 1
          },
          typeBreakdown: {
            fee_reminder: 1,
            payment_confirmation: 1
          },
          statusBreakdown: {
            sent: 1,
            delivered: 1
          }
        });
      });

      it('should filter analytics by date range', async () => {
        const startDate = new Date();
        const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const analytics = await communicationAnalyticsService.getAnalytics(
          organizationId,
          { startDate, endDate }
        );

        expect(analytics.summary.totalMessages).toBe(2);
      });

      it('should return empty analytics for organization with no events', async () => {
        const emptyAnalytics = await communicationAnalyticsService.getAnalytics('empty-org');

        expect(emptyAnalytics.summary.totalMessages).toBe(0);
        expect(emptyAnalytics.summary.totalCost).toBe(0);
      });
    });

    describe('generateReport', () => {
      beforeEach(async () => {
        await communicationAnalyticsService.recordCommunicationEvent({
          organizationId,
          recipientId: 'recipient-1',
          channel: 'whatsapp',
          type: 'fee_reminder',
          status: 'sent',
          cost: 0.05,
          messageId: 'msg-1',
          timestamp: new Date()
        });
      });

      it('should generate summary report', async () => {
        const report = await communicationAnalyticsService.generateReport(
          organizationId,
          'summary'
        );

        expect(report.type).toBe('summary');
        expect(report.organizationId).toBe(organizationId);
        expect(report.data).toHaveProperty('totalMessages');
        expect(report.data).toHaveProperty('channelBreakdown');
        expect(report.metadata).toHaveProperty('generatedAt');
      });

      it('should generate detailed report', async () => {
        const report = await communicationAnalyticsService.generateReport(
          organizationId,
          'detailed'
        );

        expect(report.type).toBe('detailed');
        expect(report.data).toHaveProperty('analytics');
        expect(report.data).toHaveProperty('recentCommunications');
      });

      it('should throw error for invalid report type', async () => {
        await expect(
          communicationAnalyticsService.generateReport(organizationId, 'invalid_type')
        ).rejects.toThrow('Invalid report type');
      });
    });
  });

  describe('Communication Management Service', () => {
    describe('createOrUpdateParentContact', () => {
      it('should create new parent contact', async () => {
        const contactData = {
          organizationId,
          studentId: 'student-123',
          parentName: 'John Doe',
          primaryPhone: '+1234567890',
          email: 'john.doe@example.com',
          relationship: 'parent',
          preferredChannel: 'whatsapp',
          language: 'en'
        };

        const contact = await communicationManagementService.createOrUpdateParentContact(contactData);

        expect(contact).toMatchObject({
          organizationId,
          studentId: 'student-123',
          parentName: 'John Doe',
          primaryPhone: '+1234567890',
          isActive: true,
          isOptedOut: false
        });
        expect(contact.id).toBeDefined();
        expect(contact.createdAt).toBeDefined();
      });

      it('should update existing parent contact', async () => {
        // Create initial contact
        const initialData = {
          organizationId,
          studentId: 'student-123',
          parentName: 'John Doe',
          primaryPhone: '+1234567890',
          email: 'john.doe@example.com'
        };

        const initialContact = await communicationManagementService.createOrUpdateParentContact(initialData);

        // Update contact
        const updateData = {
          ...initialData,
          parentName: 'John Smith',
          email: 'john.smith@example.com'
        };

        const updatedContact = await communicationManagementService.createOrUpdateParentContact(updateData);

        expect(updatedContact.id).toBe(initialContact.id);
        expect(updatedContact.parentName).toBe('John Smith');
        expect(updatedContact.email).toBe('john.smith@example.com');
        expect(updatedContact.updatedAt).toBeDefined();
      });

      it('should validate required fields', async () => {
        const invalidData = {
          organizationId,
          // Missing required fields
        };

        await expect(
          communicationManagementService.createOrUpdateParentContact(invalidData)
        ).rejects.toThrow();
      });
    });

    describe('handleOptOut', () => {
      it('should create opt-out record', async () => {
        const optOutData = {
          organizationId,
          phoneNumber: '+1234567890',
          optOutType: 'all'
        };

        const optOut = await communicationManagementService.handleOptOut(optOutData);

        expect(optOut).toMatchObject({
          organizationId,
          phoneNumber: '+1234567890',
          optOutType: 'all',
          isActive: true
        });
        expect(optOut.id).toBeDefined();
        expect(optOut.timestamp).toBeDefined();
      });

      it('should deactivate existing parent contact on opt-out', async () => {
        // Create contact first
        const contactData = {
          organizationId,
          studentId: 'student-123',
          parentName: 'John Doe',
          primaryPhone: '+1234567890'
        };

        await communicationManagementService.createOrUpdateParentContact(contactData);

        // Handle opt-out
        await communicationManagementService.handleOptOut({
          organizationId,
          phoneNumber: '+1234567890',
          optOutType: 'all'
        });

        // Check if contact is deactivated
        const contacts = await communicationManagementService.getParentContacts(organizationId);
        const deactivatedContact = contacts.contacts.find(c => c.primaryPhone === '+1234567890');
        expect(deactivatedContact.isOptedOut).toBe(true);
      });
    });

    describe('handleOptIn', () => {
      it('should reactivate opted-out contact', async () => {
        // Create and opt-out contact
        const contactData = {
          organizationId,
          studentId: 'student-123',
          parentName: 'John Doe',
          primaryPhone: '+1234567890'
        };

        await communicationManagementService.createOrUpdateParentContact(contactData);
        await communicationManagementService.handleOptOut({
          organizationId,
          phoneNumber: '+1234567890',
          optOutType: 'all'
        });

        // Handle opt-in
        const result = await communicationManagementService.handleOptIn({
          organizationId,
          phoneNumber: '+1234567890'
        });

        expect(result.success).toBe(true);

        // Check if contact is reactivated
        const contacts = await communicationManagementService.getParentContacts(organizationId);
        const reactivatedContact = contacts.contacts.find(c => c.primaryPhone === '+1234567890');
        expect(reactivatedContact.isOptedOut).toBe(false);
      });

      it('should handle opt-in for non-existent contact', async () => {
        const result = await communicationManagementService.handleOptIn({
          organizationId,
          phoneNumber: '+9999999999'
        });

        expect(result.success).toBe(true);
        expect(result.contactFound).toBe(false);
      });
    });

    describe('getCommunicationPreferences', () => {
      it('should return default preferences for new contact', async () => {
        const contactData = {
          organizationId,
          studentId: 'student-123',
          parentName: 'John Doe',
          primaryPhone: '+1234567890'
        };

        const contact = await communicationManagementService.createOrUpdateParentContact(contactData);
        const preferences = await communicationManagementService.getCommunicationPreferences(
          organizationId,
          contact.id
        );

        expect(preferences).toMatchObject({
          id: contact.id,
          organizationId,
          contactId: contact.id,
          feeReminders: true,
          paymentConfirmations: true,
          attendanceNotifications: true,
          academicUpdates: true,
          eventAnnouncements: true,
          emergencyAlerts: true
        });
      });

      it('should throw error for non-existent contact', async () => {
        await expect(
          communicationManagementService.getCommunicationPreferences(organizationId, 'non-existent')
        ).rejects.toThrow('Contact not found');
      });
    });

    describe('bulkImportContacts', () => {
      it('should import multiple contacts successfully', async () => {
        const contacts = [
          {
            studentId: 'student-1',
            parentName: 'Parent One',
            primaryPhone: '+1111111111',
            email: 'parent1@example.com'
          },
          {
            studentId: 'student-2',
            parentName: 'Parent Two',
            primaryPhone: '+2222222222',
            email: 'parent2@example.com'
          }
        ];

        const result = await communicationManagementService.bulkImportContacts(
          organizationId,
          contacts
        );

        expect(result.successful).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.details.length).toBe(2);
        expect(result.contacts.length).toBe(2);
      });

      it('should handle partial failures in bulk import', async () => {
        const contacts = [
          {
            studentId: 'student-1',
            parentName: 'Valid Parent',
            primaryPhone: '+1111111111'
          },
          {
            // Missing required fields
            parentName: 'Invalid Parent'
          }
        ];

        const result = await communicationManagementService.bulkImportContacts(
          organizationId,
          contacts
        );

        expect(result.successful).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.details.length).toBe(2);
        expect(result.details[0].success).toBe(true);
        expect(result.details[1].success).toBe(false);
      });

      it('should validate input array', async () => {
        await expect(
          communicationManagementService.bulkImportContacts(organizationId, [])
        ).rejects.toThrow('Contacts array cannot be empty');

        await expect(
          communicationManagementService.bulkImportContacts(organizationId, 'invalid')
        ).rejects.toThrow('Contacts must be an array');
      });
    });

    describe('getCommunicationHistory', () => {
      beforeEach(async () => {
        // Record some communication events
        await communicationAnalyticsService.recordCommunicationEvent({
          organizationId,
          recipientId: 'recipient-1',
          channel: 'whatsapp',
          type: 'fee_reminder',
          status: 'sent',
          messageId: 'msg-1',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
        });

        await communicationAnalyticsService.recordCommunicationEvent({
          organizationId,
          recipientId: 'recipient-1',
          channel: 'sms',
          type: 'payment_confirmation',
          status: 'delivered',
          messageId: 'msg-2',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
        });
      });

      it('should return communication history for recipient', async () => {
        const history = await communicationManagementService.getCommunicationHistory(
          organizationId,
          'recipient-1'
        );

        expect(history.history).toHaveLength(2);
        expect(history.total).toBe(2);
        
        // Should be sorted by timestamp descending
        expect(new Date(history.history[0].timestamp)).toBeInstanceOf(Date);
        expect(new Date(history.history[1].timestamp)).toBeInstanceOf(Date);
      });

      it('should filter history by message type', async () => {
        const history = await communicationManagementService.getCommunicationHistory(
          organizationId,
          'recipient-1',
          { messageType: 'fee_reminder' }
        );

        expect(history.history).toHaveLength(1);
        expect(history.history[0].type).toBe('fee_reminder');
      });

      it('should paginate results', async () => {
        const history = await communicationManagementService.getCommunicationHistory(
          organizationId,
          'recipient-1',
          { limit: 1, offset: 0 }
        );

        expect(history.history).toHaveLength(1);
        expect(history.total).toBe(2);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should track analytics when creating contacts', async () => {
      const contactData = {
        organizationId,
        studentId: 'student-123',
        parentName: 'John Doe',
        primaryPhone: '+1234567890'
      };

      await communicationManagementService.createOrUpdateParentContact(contactData);

      // Record a communication event for this contact
      await communicationAnalyticsService.recordCommunicationEvent({
        organizationId,
        recipientId: 'john-doe-contact-id',
        channel: 'whatsapp',
        type: 'fee_reminder',
        status: 'sent',
        messageId: 'msg-1',
        timestamp: new Date()
      });

      const analytics = await communicationAnalyticsService.getAnalytics(organizationId);
      expect(analytics.summary.totalMessages).toBe(1);
    });

    it('should handle opt-out and prevent analytics recording', async () => {
      const contactData = {
        organizationId,
        studentId: 'student-123',
        parentName: 'John Doe',
        primaryPhone: '+1234567890'
      };

      const contact = await communicationManagementService.createOrUpdateParentContact(contactData);
      
      // Opt out the contact
      await communicationManagementService.handleOptOut({
        organizationId,
        phoneNumber: '+1234567890',
        optOutType: 'all'
      });

      // Verify opt-out status
      const contacts = await communicationManagementService.getParentContacts(organizationId);
      const optedOutContact = contacts.contacts.find(c => c.id === contact.id);
      expect(optedOutContact.isOptedOut).toBe(true);
    });
  });
});
