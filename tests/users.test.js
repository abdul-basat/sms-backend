const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Users API', () => {
  let testHelpers;
  let server;
  let adminToken;
  let userToken;
  let testOrganization;
  let testUser;

  beforeAll(async () => {
    server = app.listen(3006);
    global.server = server;
    testHelpers = new TestHelpers(app);
  });

  beforeEach(async () => {
    // Create organization
    testOrganization = await testHelpers.createTestOrganization();
    
    // Create admin user
    const adminData = global.testHelpers.generateTestUser();
    adminData.organizationId = testOrganization.id;
    adminData.role = 'admin';
    
    const { token: adminAuthToken } = await testHelpers.createTestUser(adminData, testOrganization.id);
    adminToken = adminAuthToken;
    
    // Create regular user
    const userData = global.testHelpers.generateTestUser();
    userData.organizationId = testOrganization.id;
  // Updated default role to 'school_admin' (legacy 'user' removed)
  userData.role = 'school_admin';
    
    const { user, token: userAuthToken } = await testHelpers.createTestUser(userData, testOrganization.id);
    userToken = userAuthToken;
    testUser = user;
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

  describe('GET /api/users', () => {
    beforeEach(async () => {
      // Create additional test users
      for (let i = 0; i < 3; i++) {
        const userData = global.testHelpers.generateTestUser();
        userData.organizationId = testOrganization.id;
        userData.role = i % 2 === 0 ? 'teacher' : 'user';
        
        await testHelpers.createTestUser(userData, testOrganization.id);
      }
    });

    it('should return list of users for admin', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['users']);
      expect(Array.isArray(response.body.data.users)).toBe(true);
      expect(response.body.data.users.length).toBeGreaterThan(3); // At least admin + regular user + 3 additional
      
      // Verify all users belong to the same organization
      response.body.data.users.forEach(user => {
        expect(user.organizationId).toBe(testOrganization.id);
        expect(user).not.toHaveProperty('password'); // Password should not be returned
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/users?page=1&limit=3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['users', 'pagination']);
      expect(response.body.data.users.length).toBeLessThanOrEqual(3);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 3);
      expect(response.body.data.pagination).toHaveProperty('total');
    });

    it('should filter by role', async () => {
      const response = await request(app)
        .get('/api/users?role=teacher')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['users']);
      response.body.data.users.forEach(user => {
        expect(user.role).toBe('teacher');
      });
    });

    it('should search by name or email', async () => {
      // Create user with unique name
      const uniqueUserData = global.testHelpers.generateTestUser();
      uniqueUserData.firstName = 'UniqueTestUser';
      uniqueUserData.organizationId = testOrganization.id;
      
      await testHelpers.createTestUser(uniqueUserData, testOrganization.id);

      const response = await request(app)
        .get('/api/users?search=UniqueTestUser')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['users']);
      expect(response.body.data.users.length).toBe(1);
      expect(response.body.data.users[0].firstName).toBe('UniqueTestUser');
    });

    it('should require admin role', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'admin access required');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/users')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user by ID for admin', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['user']);
      expect(response.body.data.user.id).toBe(testUser.id);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should allow user to access their own profile', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['user']);
      expect(response.body.data.user.id).toBe(testUser.id);
    });

    it('should not allow user to access other users profiles', async () => {
      // Create another user
      const otherUserData = global.testHelpers.generateTestUser();
      otherUserData.organizationId = testOrganization.id;
      const { user: otherUser } = await testHelpers.createTestUser(otherUserData, testOrganization.id);

      const response = await request(app)
        .get(`/api/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'access denied');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update user for admin', async () => {
      const updateData = {
        firstName: 'Updated First Name',
        lastName: 'Updated Last Name',
        role: 'teacher'
      };

      const response = await request(app)
        .put(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['user']);
      expect(response.body.data.user.firstName).toBe(updateData.firstName);
      expect(response.body.data.user.lastName).toBe(updateData.lastName);
      expect(response.body.data.user.role).toBe(updateData.role);
      expect(response.body.data.user.email).toBe(testUser.email); // Unchanged
    });

    it('should allow user to update their own profile (limited fields)', async () => {
      const updateData = {
        firstName: 'Self Updated Name',
        lastName: 'Self Updated Last'
      };

      const response = await request(app)
        .put(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['user']);
      expect(response.body.data.user.firstName).toBe(updateData.firstName);
      expect(response.body.data.user.lastName).toBe(updateData.lastName);
      expect(response.body.data.user.role).toBe(testUser.role); // Should remain unchanged
    });

    it('should not allow user to change their role', async () => {
      const updateData = {
        role: 'admin' // User trying to make themselves admin
      };

      const response = await request(app)
        .put(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'cannot modify role');
    });

    it('should not allow user to update other users', async () => {
      // Create another user
      const otherUserData = global.testHelpers.generateTestUser();
      otherUserData.organizationId = testOrganization.id;
      const { user: otherUser } = await testHelpers.createTestUser(otherUserData, testOrganization.id);

      const updateData = { firstName: 'Hacked Name' };

      const response = await request(app)
        .put(`/api/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'access denied');
    });

    it('should validate email format', async () => {
      const updateData = {
        email: 'invalid-email-format'
      };

      const response = await request(app)
        .put(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400, 'email');
    });

    it('should return 404 for non-existent user', async () => {
      const updateData = { firstName: 'Updated Name' };

      const response = await request(app)
        .put('/api/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const updateData = { firstName: 'Updated Name' };

      const response = await request(app)
        .put(`/api/users/${testUser.id}`)
        .send(updateData)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('DELETE /api/users/:id', () => {
    let targetUser;

    beforeEach(async () => {
      // Create user to delete
      const userData = global.testHelpers.generateTestUser();
      userData.organizationId = testOrganization.id;
      const { user } = await testHelpers.createTestUser(userData, testOrganization.id);
      targetUser = user;
    });

    it('should delete user for admin', async () => {
      const response = await request(app)
        .delete(`/api/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200);
      expect(response.body.message).toContain('deleted');
    });

    it('should not allow user to delete themselves', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'cannot delete yourself');
    });

    it('should not allow user to delete other users', async () => {
      const response = await request(app)
        .delete(`/api/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'admin access required');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/users/${targetUser.id}`)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });

    it('should verify user is actually deleted', async () => {
      // Delete user
      await request(app)
        .delete(`/api/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Try to get deleted user
      const response = await request(app)
        .get(`/api/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });
  });

  describe('User Role Permissions', () => {
    let teacherToken;

    beforeEach(async () => {
      // Create teacher user
      const teacherData = global.testHelpers.generateTestUser();
      teacherData.organizationId = testOrganization.id;
      teacherData.role = 'teacher';
      
      const { token } = await testHelpers.createTestUser(teacherData, testOrganization.id);
      teacherToken = token;
    });

    it('should allow teacher to view users list', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['users']);
    });

    it('should not allow teacher to delete users', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(403);

      testHelpers.expectErrorResponse(response, 403, 'admin access required');
    });

    it('should allow teacher to view user profiles', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['user']);
    });
  });
});
