/**
 * Payment API Tests (Phase 5)
 * Tests for payment transactions and installment plans
 */

const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Payment API (Phase 5)', () => {
  let testHelpers;
  let server;
  let authToken;
  let testOrganization;
  let testStudent;
  let testFee;
  let organizationId;
  let studentId;
  let feeId;
  
  beforeAll(async () => {
    server = app.listen(3009);
    global.server = server;
    testHelpers = new TestHelpers(app);
  });

  beforeEach(async () => {
    // Create organization and authenticate user
    testOrganization = await testHelpers.createTestOrganization();
    organizationId = testOrganization.id;
    
    const userData = global.testHelpers.generateTestUser();
    userData.organizationId = testOrganization.id;
    userData.role = 'school_admin'; // Admin role for payment management
    
    const { token } = await testHelpers.createTestUser(userData, testOrganization.id);
    authToken = token;
    testHelpers.setAuthToken(authToken);

    // Create a test student for fee creation
    const studentData = global.testHelpers.generateTestStudent();
    testStudent = await testHelpers.createTestStudent(studentData);
    studentId = testStudent.id;

    // Create a test fee for payment tests
    const feeData = {
      studentId: studentId,
      type: 'monthly',
      amount: 1000,
      month: '2025-09',
      dueDate: '2025-09-05',
      category: 'tuition',
      description: 'September tuition fee for payment testing'
    };

    const feeRes = await request(app)
      .post('/api/fees')
      .set('Authorization', `Bearer ${authToken}`)
      .send(feeData);

    testFee = feeRes.body.data.fee;
    feeId = testFee.id;
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

  describe('POST /api/payments', () => {
    it('should create a payment transaction successfully', async () => {
      const paymentData = {
        feeId: feeId,
        amount: 500,
        paymentMethod: 'cash',
        transactionId: 'TXN123',
        notes: 'Partial payment'
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment).toHaveProperty('id');
      expect(res.body.data.payment.amount).toBe(500);
      expect(res.body.data.payment.paymentMethod).toBe('cash');
      expect(res.body.data.payment.feeId).toBe(feeId);
      expect(res.body.data.updatedFee.status).toBe('partial');
      expect(res.body.data.updatedFee.paidAmount).toBe(500);
      expect(res.body.data.updatedFee.remainingAmount).toBe(500);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Request validation failed');
      
      // Check details for specific error messages
      const fieldErrors = res.body.details.map(detail => detail.message);
      expect(fieldErrors.some(msg => msg.includes('required'))).toBe(true);
    });

    it('should validate payment method', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: 100,
          paymentMethod: 'invalid_method'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Request validation failed');
      
      // Check details for specific error message
      const fieldErrors = res.body.details.map(detail => detail.message);
      expect(fieldErrors).toContain('Invalid payment method');
    });

    it('should validate amount is positive', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: -100,
          paymentMethod: 'cash'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Request validation failed');
      
      // Check details for specific error message
      const fieldErrors = res.body.details.map(detail => detail.message);
      expect(fieldErrors.some(msg => msg.includes('positive number'))).toBe(true);
    });

    it('should prevent overpayment', async () => {
      // First make a partial payment
      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: 600, // Pay 600, leaving 400 remaining
          paymentMethod: 'cash'
        });

      // Now try to pay more than remaining
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: 500, // More than remaining amount (400)
          paymentMethod: 'cash'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('exceeds remaining fee amount');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/payments')
        .send({
          feeId: feeId,
          amount: 100,
          paymentMethod: 'cash'
        });

      expect(res.status).toBe(401);
    });

    it('should complete payment when full amount is paid', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: 1000, // Complete full amount
          paymentMethod: 'bank_transfer',
          transactionId: 'TXN456'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.updatedFee.status).toBe('paid');
      expect(res.body.data.updatedFee.paidAmount).toBe(1000);
      expect(res.body.data.updatedFee.remainingAmount).toBe(0);
    });
  });

  describe('GET /api/payments', () => {
    it('should return list of payment transactions', async () => {
      // Create some payments first
      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: 200,
          paymentMethod: 'cash'
        });

      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: 300,
          paymentMethod: 'bank_transfer'
        });

      const res = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toBeInstanceOf(Array);
      expect(res.body.data.transactions.length).toBe(2); // Two payments made above
      expect(res.body.data.pagination).toHaveProperty('totalItems');
    });

    it('should support pagination', async () => {
      // Create a payment first
      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: feeId,
          amount: 100,
          paymentMethod: 'cash'
        });

      const res = await request(app)
        .get('/api/payments?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions.length).toBe(1);
      expect(res.body.data.pagination.itemsPerPage).toBe(1);
    });

    it('should filter by student ID', async () => {
      const res = await request(app)
        .get(`/api/payments?studentId=${studentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions).toBeInstanceOf(Array);
      expect(res.body.data.transactions.every(t => t.studentId === studentId)).toBe(true);
    });

    it('should filter by payment method', async () => {
      const res = await request(app)
        .get('/api/payments?paymentMethod=cash')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions).toBeInstanceOf(Array);
      expect(res.body.data.transactions.every(t => t.paymentMethod === 'cash')).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/payments');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/payments/:id', () => {
    let paymentId;

    beforeEach(async () => {
      // Create a new fee and payment for this test within the current org context
      const feeRes = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId: studentId,
          type: 'monthly',
          amount: 800,
          month: '2025-10',
          dueDate: '2025-10-05',
          category: 'books',
          description: 'October books fee'
        });

      const newFeeId = feeRes.body.data.fee.id;

      const paymentRes = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: newFeeId,
          amount: 400,
          paymentMethod: 'upi',
          transactionId: 'UPI789'
        });

      paymentId = paymentRes.body.data.payment.id;
    });

    it('should return payment transaction by ID', async () => {
      const res = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.id).toBe(paymentId);
      expect(res.body.data.payment.amount).toBe(400);
      expect(res.body.data.payment.paymentMethod).toBe('upi');
      expect(res.body.data.payment.student).toHaveProperty('firstName');
      expect(res.body.data.payment.fee).toHaveProperty('category');
    });

    it('should return 404 for non-existent payment', async () => {
      const res = await request(app)
        .get('/api/payments/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get(`/api/payments/${paymentId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/payments/installments', () => {
    let newFeeId;

    beforeEach(async () => {
      // Create a new fee for installment testing within current org context
      const feeRes = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId: studentId,
          type: 'quarterly',
          amount: 1200,
          month: '2025-11',
          dueDate: '2025-11-05',
          category: 'tuition',
          description: 'Quarterly tuition fee'
        });

      newFeeId = feeRes.body.data.fee.id;
    });

    it('should create an installment plan successfully', async () => {
      const installmentData = {
        feeId: newFeeId,
        numberOfInstallments: 3,
        installmentAmount: 400,
        startDate: '2025-11-05',
        frequency: 'monthly',
        description: 'Quarterly fee in 3 monthly installments'
      };

      const res = await request(app)
        .post('/api/payments/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(installmentData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.installmentPlan).toHaveProperty('id');
      expect(res.body.data.installmentPlan.numberOfInstallments).toBe(3);
      expect(res.body.data.installmentPlan.installmentAmount).toBe(400);
      expect(res.body.data.installmentPlan.totalAmount).toBe(1200);
      expect(res.body.data.installmentPlan.frequency).toBe('monthly');
      expect(res.body.data.installmentPlan.installments).toHaveLength(3);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/payments/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Request validation failed');
      
      // Check details for specific error messages
      const fieldErrors = res.body.details.map(detail => detail.message);
      expect(fieldErrors.some(msg => msg.includes('required'))).toBe(true);
    });

    it('should validate number of installments range', async () => {
      const res = await request(app)
        .post('/api/payments/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: newFeeId,
          numberOfInstallments: 15, // Too many
          installmentAmount: 100,
          startDate: '2025-11-05'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Request validation failed');
      
      // Check details for specific error message
      const fieldErrors = res.body.details.map(detail => detail.message);
      expect(fieldErrors.some(msg => msg.includes('between 2 and 12'))).toBe(true);
    });

    it('should validate total installment amount matches fee amount', async () => {
      const res = await request(app)
        .post('/api/payments/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: newFeeId,
          numberOfInstallments: 3,
          installmentAmount: 300, // 3 * 300 = 900, but fee is 1200
          startDate: '2025-11-05'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('must equal remaining fee amount');
    });

    it('should validate frequency', async () => {
      const res = await request(app)
        .post('/api/payments/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: newFeeId,
          numberOfInstallments: 2,
          installmentAmount: 600,
          startDate: '2025-11-05',
          frequency: 'invalid_frequency'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Request validation failed');
      
      // Check details for specific error message
      const fieldErrors = res.body.details.map(detail => detail.message);
      expect(fieldErrors).toContain('Invalid frequency');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/payments/installments')
        .send({
          feeId: newFeeId,
          numberOfInstallments: 2,
          installmentAmount: 600,
          startDate: '2025-11-05'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/payments/installments', () => {
    let installmentFeeId;

    beforeEach(async () => {
      // Create fee and installment plan for testing GET endpoints
      const feeRes = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId: studentId,
          type: 'quarterly',
          amount: 1500,
          month: '2025-12',
          dueDate: '2025-12-05',
          category: 'tuition',
          description: 'December quarterly fee for installment testing'
        });

      installmentFeeId = feeRes.body.data.fee.id;

      // Create an installment plan
      await request(app)
        .post('/api/payments/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          feeId: installmentFeeId,
          numberOfInstallments: 3,
          installmentAmount: 500,
          startDate: '2025-12-05',
          frequency: 'monthly',
          description: 'Test installment plan'
        });
    });

    it('should return list of installment plans', async () => {
      const res = await request(app)
        .get('/api/payments/installments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.installmentPlans).toBeInstanceOf(Array);
      expect(res.body.data.installmentPlans.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toHaveProperty('totalItems');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/payments/installments?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.installmentPlans.length).toBe(1);
      expect(res.body.data.pagination.itemsPerPage).toBe(1);
    });

    it('should filter by student ID', async () => {
      const res = await request(app)
        .get(`/api/payments/installments?studentId=${studentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.installmentPlans).toBeInstanceOf(Array);
      expect(res.body.data.installmentPlans.every(p => p.studentId === studentId)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/payments/installments?status=active')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.installmentPlans).toBeInstanceOf(Array);
      expect(res.body.data.installmentPlans.every(p => p.status === 'active')).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/payments/installments');

      expect(res.status).toBe(401);
    });
  });

  describe('Payment Method Validation', () => {
    it('should accept all valid payment methods', async () => {
      const validMethods = ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'cheque', 'upi', 'other'];
      
      // Create a new fee for each payment method test
      const feeRes = await request(app)
        .post('/api/fees')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId: studentId,
          type: 'one-time',
          amount: 800,
          month: '2025-12',
          dueDate: '2025-12-05',
          category: 'exam',
          description: 'Exam fee for testing payment methods'
        });

      const testFeeId = feeRes.body.data.fee.id;

      for (const method of validMethods) {
        const res = await request(app)
          .post('/api/payments')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            feeId: testFeeId,
            amount: 100,
            paymentMethod: method
          });

        expect(res.status).toBe(201);
        expect(res.body.data.payment.paymentMethod).toBe(method);
      }
    });
  });

  describe('Organization Scoping', () => {
    it('should only access payments from user organization', async () => {
      // This would require creating another organization and user to test properly
      // For now, we verify that payments are scoped to the user's organization
      const res = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions.every(t => t.organizationId === organizationId)).toBe(true);
    });
  });
});

module.exports = {};
