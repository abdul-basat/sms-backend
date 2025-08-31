const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Fees API', () => {
  let testHelpers;
  let server;
  let authToken;
  let testOrganization;
  let testStudent;
  let testFee;

  beforeAll(async () => {
    server = app.listen(3007);
    global.server = server;
    testHelpers = new TestHelpers(app);
  });

  beforeEach(async () => {
    // Create organization and authenticate user
    testOrganization = await testHelpers.createTestOrganization();
    
    const userData = global.testHelpers.generateTestUser();
    userData.organizationId = testOrganization.id;
    userData.role = 'school_admin'; // Admin role for fee management
    
    const { token } = await testHelpers.createTestUser(userData, testOrganization.id);
    authToken = token;
    testHelpers.setAuthToken(authToken);

    // Create a test student for fee creation
    const studentData = global.testHelpers.generateTestStudent();
    testStudent = await testHelpers.createTestStudent(studentData);
  });

  afterEach(async () => {
    await testHelpers.cleanup();
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('POST /api/fees', () => {
    it('should create a new fee successfully', async () => {
      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1000,
        month: '2025-09',
        dueDate: '2025-09-05',
        category: 'tuition',
        description: 'September tuition fee'
      };
      
      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData)
        .expect(201);

      testHelpers.expectSuccessResponse(response, 201, ['fee']);
      expect(response.body.data.fee.studentId).toBe(testStudent.id);
      expect(response.body.data.fee.amount).toBe(1000);
      expect(response.body.data.fee.month).toBe('2025-09');
      expect(response.body.data.fee.status).toBe('pending');
      expect(response.body.data.fee.paidAmount).toBe(0);
      expect(response.body.data.fee.remainingAmount).toBe(1000);
      expect(response.body.data.fee.organizationId).toBe(testOrganization.id);
      
      // Should include student information
      expect(response.body.data.fee.student).toBeDefined();
      expect(response.body.data.fee.student.firstName).toBe(testStudent.firstName);
      expect(response.body.data.fee.student.rollNumber).toBe(testStudent.rollNumber);

      testFee = response.body.data.fee;
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
      expect(response.body.error).toContain('Request validation failed');
      // Check that specific field errors are in details
      const errorDetails = response.body.details || [];
      const fieldErrors = errorDetails.map(detail => detail.message);
      expect(fieldErrors).toContain('Student ID is required');
    });

    it('should validate amount format', async () => {
      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: -100, // Invalid negative amount
        month: '2025-09',
        dueDate: '2025-09-05'
      };

      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
      expect(response.body.error).toContain('Request validation failed');
      // Check that specific field errors are in details
      const errorDetails = response.body.details || [];
      const fieldErrors = errorDetails.map(detail => detail.message);
      expect(fieldErrors).toContain('Amount must be a positive number');
    });

    it('should validate month format', async () => {
      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1000,
        month: '2025-13', // Invalid month
        dueDate: '2025-09-05'
      };

      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
      expect(response.body.error).toContain('Invalid month format');
    });

    it('should prevent duplicate fees for same student and month', async () => {
      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1000,
        month: '2025-09',
        dueDate: '2025-09-05'
      };

      // Create first fee
      await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData)
        .expect(409);

      testHelpers.expectErrorResponse(response, 409, 'already exists');
    });

    it('should require authentication', async () => {
      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1000,
        month: '2025-09',
        dueDate: '2025-09-05'
      };

      const response = await request(app)
        .post('/api/fees')
        .send(feeData)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401);
    });

    it('should require appropriate permissions', async () => {
      // Create a teacher user (no fee creation permission)
      const teacherData = global.testHelpers.generateTestUser();
      teacherData.organizationId = testOrganization.id;
      teacherData.role = 'teacher';
      
      const { token: teacherToken } = await testHelpers.createTestUser(teacherData, testOrganization.id);

      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1000,
        month: '2025-09',
        dueDate: '2025-09-05'
      };

      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(feeData)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'Insufficient permissions');
    });
  });

  describe('GET /api/fees', () => {
    beforeEach(async () => {
      // Create test fees
      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1000,
        month: '2025-09',
        dueDate: '2025-09-05',
        category: 'tuition'
      };

      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData);

      testFee = response.body.data.fee;
    });

    it('should return list of fees', async () => {
      const response = await request(app)
        .get('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['fees']);
      expect(Array.isArray(response.body.data.fees)).toBe(true);
      expect(response.body.data.fees.length).toBeGreaterThan(0);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.total).toBeGreaterThan(0);
      
      // Should include student information
      const fee = response.body.data.fees[0];
      expect(fee.student).toBeDefined();
      expect(fee.student.firstName).toBeDefined();
    });

    it('should support pagination', async () => {
      // Create additional fee
      const feeData2 = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1200,
        month: '2025-10',
        dueDate: '2025-10-05'
      };

      await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData2);

      const response = await request(app)
        .get('/api/fees?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['fees']);
      expect(response.body.data.fees).toHaveLength(1);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(1);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/fees?status=pending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['fees']);
      response.body.data.fees.forEach(fee => {
        expect(fee.status).toBe('pending');
      });
    });

    it('should filter by month', async () => {
      const response = await request(app)
        .get('/api/fees?month=2025-09')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['fees']);
      response.body.data.fees.forEach(fee => {
        expect(fee.month).toBe('2025-09');
      });
    });

    it('should filter by student', async () => {
      const response = await request(app)
        .get(`/api/fees?studentId=${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['fees']);
      response.body.data.fees.forEach(fee => {
        expect(fee.studentId).toBe(testStudent.id);
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/fees')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401);
    });
  });

  describe('GET /api/fees/:id', () => {
    beforeEach(async () => {
      // Create test fee
      const feeData = {
        studentId: testStudent.id,
        type: 'monthly',
        amount: 1000,
        month: '2025-09',
        dueDate: '2025-09-05'
      };

      const response = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feeData);

      testFee = response.body.data.fee;
    });

    it('should return fee by ID', async () => {
      const response = await request(app)
        .get(`/api/fees/${testFee.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['fee']);
      expect(response.body.data.fee.id).toBe(testFee.id);
      expect(response.body.data.fee.studentId).toBe(testStudent.id);
      expect(response.body.data.fee.student).toBeDefined();
      expect(response.body.data.fee.student.firstName).toBe(testStudent.firstName);
    });

    it('should return 404 for non-existent fee', async () => {
      const response = await request(app)
        .get('/api/fees/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/fees/${testFee.id}`)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401);
    });
  });
});
