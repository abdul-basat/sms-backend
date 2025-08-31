const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Authentication API', () => {
  let testHelpers;
  let server;

  beforeAll(async () => {
    server = app.listen(3003);
    global.server = server;
    testHelpers = new TestHelpers(app);
  });

  afterAll(async () => {
    await testHelpers.cleanup();
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = global.testHelpers.generateTestUser();
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      testHelpers.expectSuccessResponse(response, 201, ['user', 'token']);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.firstName).toBe(userData.firstName);
      expect(response.body.data.user.lastName).toBe(userData.lastName);
      expect(response.body.data.user).not.toHaveProperty('password');
      expect(response.body.data.token).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
      // Don't check specific message content, just that it's a validation error
    });

    it('should validate email format', async () => {
      const userData = global.testHelpers.generateTestUser();
      userData.email = 'invalid-email';

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });

    it('should validate password strength', async () => {
      const userData = global.testHelpers.generateTestUser();
      userData.password = '123'; // Too short

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });

    it('should not allow duplicate email registration', async () => {
      const userData = global.testHelpers.generateTestUser();
      
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      testHelpers.expectErrorResponse(response, 409, 'already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;

    beforeEach(async () => {
      // Create a test user for login tests
      const userData = global.testHelpers.generateTestUser();
      await request(app)
        .post('/api/auth/register')
        .send(userData);
      testUser = userData;
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['user', 'token']);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.token).toBeDefined();
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password
        })
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'Invalid credentials');
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        })
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'Invalid credentials');
    });

    it('should validate required login fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });

    it('should validate email format in login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });
  });

  describe('POST /api/auth/logout', () => {
    let authToken;

    beforeEach(async () => {
      // Create and login a test user
      const userData = global.testHelpers.generateTestUser();
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
    });

    it('should logout authenticated user', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200);
      expect(response.body.message || response.body.data?.message).toContain('Logged out');
    });

    it('should require authentication for logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401);
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401);
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken;
    let testUser;

    beforeEach(async () => {
      // Create and login a test user
      const userData = global.testHelpers.generateTestUser();
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
      testUser = loginResponse.body.data.user;
    });

    it('should return current user profile', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['user']);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401);
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401);
    });
  });
});
