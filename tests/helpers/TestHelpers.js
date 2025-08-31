const request = require('supertest');
const jwt = require('jsonwebtoken');

/**
 * Test utilities for API testing
 */
class TestHelpers {
  constructor(app) {
    this.app = app;
    this.request = request(app);
    this.authToken = null;
    this.testUsers = [];
    this.testOrganizations = [];
  }

  /**
   * Generate a valid JWT token for testing
   */
  generateAuthToken(userId = 'test-user-id', organizationId = 'test-org-id', role = 'admin') {
    return jwt.sign(
      { 
        userId, 
        organizationId, 
        role,
        email: 'test@example.com'
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  }

  /**
   * Set auth token for subsequent requests
   */
  setAuthToken(token) {
    this.authToken = token;
    return this;
  }

  /**
   * Make authenticated request
   */
  authenticatedRequest(method, endpoint) {
    const req = this.request[method.toLowerCase()](endpoint);
    if (this.authToken) {
      req.set('Authorization', `Bearer ${this.authToken}`);
    }
    return req;
  }

  /**
   * Create test organization
   */
  async createTestOrganization(orgData = null) {
    const organizationData = orgData || global.testHelpers.generateTestOrganization();
    
    // Always register and login a fresh user for organization creation
    const userData = global.testHelpers.generateTestUser();
    
    // Register user
    await this.request
      .post('/api/auth/register')
      .send(userData)
      .expect(201);
    
    // Login user
    const loginResponse = await this.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password
      })
      .expect(200);
    
    const orgToken = loginResponse.body.data.token;
    
    const response = await this.request
      .post('/api/organizations')
      .set('Authorization', `Bearer ${orgToken}`)
      .send(organizationData)
      .expect(201);

    this.testOrganizations.push(response.body.data.organization);
    return response.body.data.organization;
  }

  /**
   * Create test user with authentication
   */
  async createTestUser(userData = null, organizationId = null) {
    const userRegistrationData = userData || global.testHelpers.generateTestUser();
    
    if (organizationId) {
      userRegistrationData.organizationId = organizationId;
    }

    const response = await this.request
      .post('/api/auth/register')
      .send(userRegistrationData)
      .expect(201);

    this.testUsers.push(response.body.data.user);
    return {
      user: response.body.data.user,
      token: response.body.data.token
    };
  }

  /**
   * Login test user
   */
  async loginTestUser(email, password) {
    const response = await this.request
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    this.setAuthToken(response.body.data.token);
    return response.body.data;
  }

  /**
   * Create test student
   */
  async createTestStudent(studentData = null, authToken = null) {
    const student = studentData || global.testHelpers.generateTestStudent();
    
    const req = this.request
      .post('/api/students')
      .send(student);

    if (authToken || this.authToken) {
      req.set('Authorization', `Bearer ${authToken || this.authToken}`);
    }

    const response = await req.expect(201);
    return response.body.data.student;
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    // In a real scenario, you'd delete test data from the database
    // For now, we'll just clear the arrays
    this.testUsers = [];
    this.testOrganizations = [];
    this.authToken = null;
  }

  /**
   * Wait for a specified time (useful for async operations)
   */
  async wait(ms = 1000) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Expect error response format
   */
  expectErrorResponse(response, statusCode, message = null) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('success', false);
    
    // Our error handler uses 'error' property, not 'message'
    const errorMessage = response.body.error || response.body.message;
    expect(errorMessage).toBeDefined();
    
    if (message) {
      expect(errorMessage).toContain(message);
    }
  }

  /**
   * Expect success response format
   */
  expectSuccessResponse(response, statusCode = 200, dataProperties = []) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('success', true);
    
    // Only expect data if dataProperties are specified
    if (dataProperties.length > 0) {
      expect(response.body).toHaveProperty('data');
      dataProperties.forEach(prop => {
        expect(response.body.data).toHaveProperty(prop);
      });
    }
  }
}

module.exports = TestHelpers;
