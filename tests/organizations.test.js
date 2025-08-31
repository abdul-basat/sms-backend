const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Organizations API', () => {
  let testHelpers;
  let server;
  let authToken;
  let testOrganization;

  beforeAll(async () => {
    server = app.listen(3004);
    global.server = server;
    testHelpers = new TestHelpers(app);
  });

  beforeEach(async () => {
    // Create and login a test user for each test
    const userData = global.testHelpers.generateTestUser();
    userData.role = 'admin'; // Admin role for organization management
    
    await request(app)
      .post('/api/auth/register')
      .send(userData);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password
      });

    authToken = loginResponse.body.data.token;
    testHelpers.setAuthToken(authToken);
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

  describe('POST /api/organizations', () => {
    it('should create a new organization successfully', async () => {
      const orgData = global.testHelpers.generateTestOrganization();
      
      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orgData)
        .expect(201);

      testHelpers.expectSuccessResponse(response, 201, ['organization']);
      expect(response.body.data.organization.name).toBe(orgData.name);
      expect(response.body.data.organization.email).toBe(orgData.email);
      expect(response.body.data.organization.phone).toBe(orgData.phone);
      expect(response.body.data.organization.id).toBeDefined();
      expect(response.body.data.organization.createdAt).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
      expect(response.body.message).toContain('validation');
    });

    it('should validate email format', async () => {
      const orgData = global.testHelpers.generateTestOrganization();
      orgData.email = 'invalid-email';

      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orgData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400, 'email');
    });

    it('should validate phone format', async () => {
      const orgData = global.testHelpers.generateTestOrganization();
      orgData.phone = 'invalid-phone';

      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orgData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });

    it('should require authentication', async () => {
      const orgData = global.testHelpers.generateTestOrganization();
      
      const response = await request(app)
        .post('/api/organizations')
        .send(orgData)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });

    it('should not allow duplicate organization names', async () => {
      const orgData = global.testHelpers.generateTestOrganization();
      
      // First creation
      await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orgData)
        .expect(201);

      // Duplicate creation
      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orgData)
        .expect(409);

      testHelpers.expectErrorResponse(response, 409, 'already exists');
    });
  });

  describe('GET /api/organizations', () => {
    beforeEach(async () => {
      // Create test organizations
      for (let i = 0; i < 3; i++) {
        await testHelpers.createTestOrganization();
      }
    });

    it('should return list of organizations', async () => {
      const response = await request(app)
        .get('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['organizations']);
      expect(Array.isArray(response.body.data.organizations)).toBe(true);
      expect(response.body.data.organizations.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/organizations?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['organizations', 'pagination']);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 2);
      expect(response.body.data.pagination).toHaveProperty('total');
    });

    it('should support search by name', async () => {
      const orgData = global.testHelpers.generateTestOrganization();
      orgData.name = 'Unique Test School';
      
      await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orgData);

      const response = await request(app)
        .get('/api/organizations?search=Unique')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['organizations']);
      expect(response.body.data.organizations.length).toBeGreaterThan(0);
      expect(response.body.data.organizations[0].name).toContain('Unique');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/organizations')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('GET /api/organizations/:id', () => {
    beforeEach(async () => {
      testOrganization = await testHelpers.createTestOrganization();
    });

    it('should return organization by ID', async () => {
      const response = await request(app)
        .get(`/api/organizations/${testOrganization.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['organization']);
      expect(response.body.data.organization.id).toBe(testOrganization.id);
      expect(response.body.data.organization.name).toBe(testOrganization.name);
    });

    it('should return 404 for non-existent organization', async () => {
      const response = await request(app)
        .get('/api/organizations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/organizations/${testOrganization.id}`)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('PUT /api/organizations/:id', () => {
    beforeEach(async () => {
      testOrganization = await testHelpers.createTestOrganization();
    });

    it('should update organization successfully', async () => {
      const updateData = {
        name: 'Updated Organization Name',
        phone: '+9876543210'
      };

      const response = await request(app)
        .put(`/api/organizations/${testOrganization.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['organization']);
      expect(response.body.data.organization.name).toBe(updateData.name);
      expect(response.body.data.organization.phone).toBe(updateData.phone);
      expect(response.body.data.organization.email).toBe(testOrganization.email); // Unchanged
    });

    it('should validate email format on update', async () => {
      const updateData = {
        email: 'invalid-email'
      };

      const response = await request(app)
        .put(`/api/organizations/${testOrganization.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400, 'email');
    });

    it('should return 404 for non-existent organization', async () => {
      const updateData = { name: 'Updated Name' };

      const response = await request(app)
        .put('/api/organizations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const updateData = { name: 'Updated Name' };

      const response = await request(app)
        .put(`/api/organizations/${testOrganization.id}`)
        .send(updateData)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('DELETE /api/organizations/:id', () => {
    beforeEach(async () => {
      testOrganization = await testHelpers.createTestOrganization();
    });

    it('should delete organization successfully', async () => {
      const response = await request(app)
        .delete(`/api/organizations/${testOrganization.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent organization', async () => {
      const response = await request(app)
        .delete('/api/organizations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/organizations/${testOrganization.id}`)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });

    it('should verify organization is actually deleted', async () => {
      // Delete organization
      await request(app)
        .delete(`/api/organizations/${testOrganization.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to get deleted organization
      const response = await request(app)
        .get(`/api/organizations/${testOrganization.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });
  });
});
