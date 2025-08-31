const request = require('supertest');
const app = require('../src/server');
const { dataStore } = require('../src/models/dataStore');
const testHelpers = require('./helpers/testHelpers');

describe('Communication Analytics & Management API', () => {
  let authToken;
  let organizationId;
  let testUser;
  let testStudent;
  let testContact;

  beforeAll(async () => {
    // Clear data store
    dataStore.clear();
    
    // Register user and get auth token
    const result = await testHelpers.createTestUserAndOrganization();
    authToken = result.authToken;
    organizationId = result.organizationId;
    testUser = result.user;

    // Create a test student
    const studentData = testHelpers.generateStudentData();
    const studentResponse = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send(studentData);
    
    testStudent = studentResponse.body.data.student;
  });

  afterAll(async () => {
    dataStore.clear();
  });

  describe('Communication Settings', () => {
    it('should get default communication settings', async () => {
      const response = await request(app)
        .get('/api/communication/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['settings']);
      expect(response.body.data.settings).toMatchObject({
        organizationId,
        whatsappEnabled: true,
        smsEnabled: false,
        emailEnabled: false,
        autoConfirmPayments: true,
        language: 'en'
      });
    });

    it('should update communication settings', async () => {
      const updateData = {
        smsEnabled: true,
        emailEnabled: true,
        language: 'es',
        reminderSchedule: {
          days: [5, 2, 0],
          times: ["10:00", "16:00"]
        }
      };

      const response = await request(app)
        .put('/api/communication/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['settings']);
      expect(response.body.data.settings).toMatchObject(updateData);
    });

    it('should validate boolean fields in settings', async () => {
      const response = await request(app)
        .put('/api/communication/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          whatsappEnabled: 'invalid'
        })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });

  describe('Parent Contact Management', () => {
    it('should create a parent contact', async () => {
      const contactData = {
        studentId: testStudent.id,
        parentName: 'John Doe',
        primaryPhone: '+1234567890',
        secondaryPhone: '+1234567891',
        email: 'john.doe@example.com',
        relationship: 'parent',
        preferredChannel: 'whatsapp',
        language: 'en'
      };

      const response = await request(app)
        .post('/api/communication/contacts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(contactData)
        .expect(201);

      testHelpers.expectSuccessResponse(response, 201, ['contact']);
      expect(response.body.data.contact).toMatchObject({
        organizationId,
        studentId: testStudent.id,
        parentName: 'John Doe',
        primaryPhone: '+1234567890',
        isActive: true,
        isOptedOut: false
      });

      testContact = response.body.data.contact;
    });

    it('should get parent contacts', async () => {
      const response = await request(app)
        .get('/api/communication/contacts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['contacts']);
      expect(Array.isArray(response.body.data.contacts)).toBe(true);
      expect(response.body.data.contacts.length).toBeGreaterThan(0);
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    it('should filter contacts by student ID', async () => {
      const response = await request(app)
        .get(`/api/communication/contacts?studentId=${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['contacts']);
      expect(response.body.data.contacts).toHaveLength(1);
      expect(response.body.data.contacts[0].studentId).toBe(testStudent.id);
    });

    it('should update parent contact', async () => {
      const updateData = {
        parentName: 'John Smith',
        email: 'john.smith@example.com',
        preferredChannel: 'sms'
      };

      const response = await request(app)
        .put(`/api/communication/contacts/${testContact.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['contact']);
      expect(response.body.data.contact.parentName).toBe('John Smith');
      expect(response.body.data.contact.preferredChannel).toBe('sms');
    });

    it('should validate required fields for contact creation', async () => {
      const response = await request(app)
        .post('/api/communication/contacts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          parentName: 'Test Parent'
          // Missing required fields
        })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/communication/contacts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId: testStudent.id,
          parentName: 'Test Parent',
          primaryPhone: '+1234567890',
          email: 'invalid-email'
        })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });

  describe('Opt-out/Opt-in Management', () => {
    it('should handle opt-out request', async () => {
      const response = await request(app)
        .post('/api/communication/opt-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phoneNumber: '+1234567890',
          optOutType: 'all'
        })
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['optOut']);
      expect(response.body.data.optOut).toMatchObject({
        organizationId,
        phoneNumber: '+1234567890',
        optOutType: 'all',
        isActive: true
      });
    });

    it('should handle opt-in request', async () => {
      const response = await request(app)
        .post('/api/communication/opt-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phoneNumber: '+1234567890'
        })
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200);
      expect(response.body.data.success).toBe(true);
    });

    it('should validate phone number for opt-out', async () => {
      const response = await request(app)
        .post('/api/communication/opt-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          optOutType: 'all'
          // Missing phone number
        })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });

  describe('Communication Preferences', () => {
    it('should get communication preferences for a contact', async () => {
      const response = await request(app)
        .get(`/api/communication/preferences/${testContact.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['preferences']);
      expect(response.body.data.preferences).toMatchObject({
        id: testContact.id,
        organizationId,
        contactId: testContact.id,
        feeReminders: true,
        paymentConfirmations: true,
        attendanceNotifications: true
      });
    });

    it('should update communication preferences', async () => {
      const updateData = {
        feeReminders: false,
        academicUpdates: false,
        preferredChannels: {
          feeReminders: 'sms',
          paymentConfirmations: 'email'
        }
      };

      const response = await request(app)
        .put(`/api/communication/preferences/${testContact.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['preferences']);
      expect(response.body.data.preferences.feeReminders).toBe(false);
      expect(response.body.data.preferences.academicUpdates).toBe(false);
    });

    it('should validate boolean fields in preferences', async () => {
      const response = await request(app)
        .put(`/api/communication/preferences/${testContact.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeReminders: 'invalid'
        })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });

  describe('Analytics and Reporting', () => {
    beforeAll(async () => {
      // Record some test communication events
      const testEvents = [
        {
          recipientId: testContact.id,
          channel: 'whatsapp',
          type: 'fee_reminder',
          status: 'sent',
          cost: 0.05
        },
        {
          recipientId: testContact.id,
          channel: 'whatsapp',
          type: 'fee_reminder',
          status: 'delivered',
          cost: 0.05
        },
        {
          recipientId: testContact.id,
          channel: 'sms',
          type: 'payment_confirmation',
          status: 'sent',
          cost: 0.10
        }
      ];

      for (const event of testEvents) {
        await request(app)
          .post('/api/communication/test/record-event')
          .set('Authorization', `Bearer ${authToken}`)
          .send(event);
      }
    });

    it('should get analytics data', async () => {
      const response = await request(app)
        .get('/api/communication/analytics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['analytics']);
      expect(response.body.data.analytics).toHaveProperty('organizationId', organizationId);
      expect(response.body.data.analytics).toHaveProperty('summary');
      expect(response.body.data.analytics.summary.totalMessages).toBeGreaterThan(0);
    });

    it('should get analytics with date filter', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get(`/api/communication/analytics?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['analytics']);
    });

    it('should get communication logs', async () => {
      const response = await request(app)
        .get('/api/communication/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['logs']);
      expect(Array.isArray(response.body.data.logs)).toBe(true);
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    it('should filter logs by channel', async () => {
      const response = await request(app)
        .get('/api/communication/logs?channel=whatsapp')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['logs']);
      response.body.data.logs.forEach(log => {
        expect(log.channel).toBe('whatsapp');
      });
    });

    it('should get parent engagement metrics', async () => {
      const response = await request(app)
        .get('/api/communication/engagement')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['engagement']);
      expect(response.body.data.engagement).toHaveProperty('totalParents');
      expect(response.body.data.engagement).toHaveProperty('activeParents');
      expect(response.body.data.engagement).toHaveProperty('responseRate');
    });

    it('should generate summary report', async () => {
      const response = await request(app)
        .get('/api/communication/reports/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['report']);
      expect(response.body.data.report.type).toBe('summary');
      expect(response.body.data.report.organizationId).toBe(organizationId);
      expect(response.body.data.report.data).toHaveProperty('totalMessages');
    });

    it('should generate detailed report', async () => {
      const response = await request(app)
        .get('/api/communication/reports/detailed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['report']);
      expect(response.body.data.report.type).toBe('detailed');
      expect(response.body.data.report.data).toHaveProperty('analytics');
      expect(response.body.data.report.data).toHaveProperty('recentCommunications');
    });

    it('should validate report type', async () => {
      const response = await request(app)
        .get('/api/communication/reports/invalid_type')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });

  describe('Communication History', () => {
    it('should get communication history for a recipient', async () => {
      const response = await request(app)
        .get(`/api/communication/history/${testContact.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['history']);
      expect(Array.isArray(response.body.data.history)).toBe(true);
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    it('should filter history by message type', async () => {
      const response = await request(app)
        .get(`/api/communication/history/${testContact.id}?messageType=fee_reminder`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['history']);
      response.body.data.history.forEach(item => {
        expect(item.type).toBe('fee_reminder');
      });
    });
  });

  describe('Compliance', () => {
    it('should generate compliance report', async () => {
      const response = await request(app)
        .get('/api/communication/compliance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['report']);
      expect(response.body.data.report).toMatchObject({
        organizationId,
        totalContacts: expect.any(Number),
        activeContacts: expect.any(Number),
        optedOutContacts: expect.any(Number),
        optOutRate: expect.any(String),
        messagesBlocked: expect.any(Number)
      });
      expect(Array.isArray(response.body.data.report.recommendations)).toBe(true);
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk import contacts', async () => {
      const contacts = [
        {
          studentId: testStudent.id,
          parentName: 'Jane Doe',
          primaryPhone: '+1234567892',
          email: 'jane.doe@example.com'
        },
        {
          studentId: testStudent.id,
          parentName: 'Bob Smith',
          primaryPhone: '+1234567893',
          email: 'bob.smith@example.com'
        }
      ];

      const response = await request(app)
        .post('/api/communication/contacts/bulk-import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ contacts })
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['results']);
      expect(response.body.data.results.successful).toBe(2);
      expect(response.body.data.results.failed).toBe(0);
    });

    it('should export contacts in JSON format', async () => {
      const response = await request(app)
        .get('/api/communication/contacts/export?format=json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200);
      expect(response.body.data.format).toBe('json');
      expect(response.body.data.count).toBeGreaterThan(0);
      expect(response.body.data.data).toBeDefined();
    });

    it('should export contacts in CSV format', async () => {
      const response = await request(app)
        .get('/api/communication/contacts/export?format=csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200);
      expect(response.body.data.format).toBe('csv');
      expect(response.body.data.data).toContain('ID,Student ID,Parent Name');
    });

    it('should validate contacts array for bulk import', async () => {
      const response = await request(app)
        .post('/api/communication/contacts/bulk-import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ contacts: [] })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        'GET /api/communication/analytics',
        'GET /api/communication/logs',
        'GET /api/communication/settings',
        'GET /api/communication/contacts'
      ];

      for (const endpoint of endpoints) {
        const [method, path] = endpoint.split(' ');
        const response = await request(app)[method.toLowerCase()](path)
          .expect(401);
        
        testHelpers.expectErrorResponse(response, 401);
      }
    });

    it('should record test communication event', async () => {
      const eventData = {
        recipientId: testContact.id,
        channel: 'email',
        type: 'enrollment',
        status: 'sent',
        cost: 0.02
      };

      const response = await request(app)
        .post('/api/communication/test/record-event')
        .set('Authorization', `Bearer ${authToken}`)
        .send(eventData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['eventId']);
      expect(response.body.data.eventId).toBeDefined();
    });

    it('should validate test event data', async () => {
      const response = await request(app)
        .post('/api/communication/test/record-event')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientId: testContact.id,
          channel: 'invalid_channel',
          type: 'fee_reminder',
          status: 'sent'
        })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });
});
