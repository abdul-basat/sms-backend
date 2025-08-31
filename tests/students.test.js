const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Students API', () => {
  let testHelpers;
  let server;
  let authToken;
  let testOrganization;
  let testStudent;

  beforeAll(async () => {
    server = app.listen(3005);
    global.server = server;
    testHelpers = new TestHelpers(app);
  });

  beforeEach(async () => {
    // Create organization and authenticate user
    testOrganization = await testHelpers.createTestOrganization();
    
    const userData = global.testHelpers.generateTestUser();
    userData.organizationId = testOrganization.id;
    userData.role = 'teacher'; // Teacher role for student management
    
    const { token } = await testHelpers.createTestUser(userData, testOrganization.id);
    authToken = token;
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

  describe('POST /api/students', () => {
    it('should create a new student successfully', async () => {
      const studentData = global.testHelpers.generateTestStudent();
      
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData)
        .expect(201);

      testHelpers.expectSuccessResponse(response, 201, ['student']);
      expect(response.body.data.student.firstName).toBe(studentData.firstName);
      expect(response.body.data.student.lastName).toBe(studentData.lastName);
      expect(response.body.data.student.rollNumber).toBe(studentData.rollNumber);
      expect(response.body.data.student.class).toBe(studentData.class);
      expect(response.body.data.student.id).toBeDefined();
      expect(response.body.data.student.organizationId).toBe(testOrganization.id);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
      expect(response.body.message).toContain('validation');
    });

    it('should validate roll number uniqueness within organization', async () => {
      const studentData = global.testHelpers.generateTestStudent();
      
      // First student
      await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData)
        .expect(201);

      // Duplicate roll number
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData)
        .expect(409);

      testHelpers.expectErrorResponse(response, 409, 'roll number already exists');
    });

    it('should validate phone number format', async () => {
      const studentData = global.testHelpers.generateTestStudent();
      studentData.phone = 'invalid-phone';

      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });

    it('should require authentication', async () => {
      const studentData = global.testHelpers.generateTestStudent();
      
      const response = await request(app)
        .post('/api/students')
        .send(studentData)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });

    it('should set correct organization ID automatically', async () => {
      const studentData = global.testHelpers.generateTestStudent();
      
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData)
        .expect(201);

      expect(response.body.data.student.organizationId).toBe(testOrganization.id);
    });
  });

  describe('GET /api/students', () => {
    beforeEach(async () => {
      // Create test students
      for (let i = 0; i < 5; i++) {
        const studentData = global.testHelpers.generateTestStudent();
        studentData.rollNumber = `STU${Date.now()}-${i}`;
        studentData.class = i < 3 ? '10th' : '11th';
        
        await request(app)
          .post('/api/students')
          .set('Authorization', `Bearer ${authToken}`)
          .send(studentData);
      }
    });

    it('should return list of students for organization', async () => {
      const response = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['students']);
      expect(Array.isArray(response.body.data.students)).toBe(true);
      expect(response.body.data.students.length).toBe(5);
      
      // Verify all students belong to the same organization
      response.body.data.students.forEach(student => {
        expect(student.organizationId).toBe(testOrganization.id);
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/students?page=1&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['students', 'pagination']);
      expect(response.body.data.students.length).toBe(3);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 3);
      expect(response.body.data.pagination).toHaveProperty('total', 5);
    });

    it('should filter by class', async () => {
      const response = await request(app)
        .get('/api/students?class=10th')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['students']);
      expect(response.body.data.students.length).toBe(3);
      response.body.data.students.forEach(student => {
        expect(student.class).toBe('10th');
      });
    });

    it('should search by name', async () => {
      // Create a student with unique name
      const uniqueStudent = global.testHelpers.generateTestStudent();
      uniqueStudent.firstName = 'UniqueFirstName';
      uniqueStudent.rollNumber = `UNIQUE${Date.now()}`;
      
      await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(uniqueStudent);

      const response = await request(app)
        .get('/api/students?search=UniqueFirstName')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['students']);
      expect(response.body.data.students.length).toBe(1);
      expect(response.body.data.students[0].firstName).toBe('UniqueFirstName');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/students')
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('GET /api/students/:id', () => {
    beforeEach(async () => {
      const studentData = global.testHelpers.generateTestStudent();
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData);
      
      testStudent = response.body.data.student;
    });

    it('should return student by ID', async () => {
      const response = await request(app)
        .get(`/api/students/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['student']);
      expect(response.body.data.student.id).toBe(testStudent.id);
      expect(response.body.data.student.firstName).toBe(testStudent.firstName);
      expect(response.body.data.student.organizationId).toBe(testOrganization.id);
    });

    it('should return 404 for non-existent student', async () => {
      const response = await request(app)
        .get('/api/students/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should not allow access to students from other organizations', async () => {
      // Create another organization with its own user and student
      const otherUserData = global.testHelpers.generateTestUser();
      
      // Register the other user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(otherUserData)
        .expect(201);
      
      // Login the other user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: otherUserData.email,
          password: otherUserData.password
        })
        .expect(200);
      
      const otherToken = loginResponse.body.data.token;
      
      // Create organization with the other user
      const otherOrgData = global.testHelpers.generateTestOrganization();
      const orgResponse = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(otherOrgData)
        .expect(201);
      
      // Create student in the other organization
      const otherStudentData = global.testHelpers.generateTestStudent();
      const otherStudentResponse = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(otherStudentData)
        .expect(201);

      const otherStudent = otherStudentResponse.body.data.student;

      // Try to access other organization's student with our token
      const response = await request(app)
        .get(`/api/students/${otherStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/students/${testStudent.id}`)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('PUT /api/students/:id', () => {
    beforeEach(async () => {
      const studentData = global.testHelpers.generateTestStudent();
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData);
      
      testStudent = response.body.data.student;
    });

    it('should update student successfully', async () => {
      const updateData = {
        firstName: 'Updated First Name',
        class: '12th',
        section: 'B'
      };

      const response = await request(app)
        .put(`/api/students/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200, ['student']);
      expect(response.body.data.student.firstName).toBe(updateData.firstName);
      expect(response.body.data.student.class).toBe(updateData.class);
      expect(response.body.data.student.section).toBe(updateData.section);
      expect(response.body.data.student.lastName).toBe(testStudent.lastName); // Unchanged
    });

    it('should validate phone number format on update', async () => {
      const updateData = {
        phone: 'invalid-phone-format'
      };

      const response = await request(app)
        .put(`/api/students/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      testHelpers.expectErrorResponse(response, 400);
    });

    it('should return 404 for non-existent student', async () => {
      const updateData = { firstName: 'Updated Name' };

      const response = await request(app)
        .put('/api/students/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const updateData = { firstName: 'Updated Name' };

      const response = await request(app)
        .put(`/api/students/${testStudent.id}`)
        .send(updateData)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });
  });

  describe('DELETE /api/students/:id', () => {
    beforeEach(async () => {
      const studentData = global.testHelpers.generateTestStudent();
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send(studentData);
      
      testStudent = response.body.data.student;
    });

    it('should delete student successfully', async () => {
      const response = await request(app)
        .delete(`/api/students/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      testHelpers.expectSuccessResponse(response, 200);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent student', async () => {
      const response = await request(app)
        .delete('/api/students/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/students/${testStudent.id}`)
        .expect(401);

      testHelpers.expectErrorResponse(response, 401, 'No token provided');
    });

    it('should verify student is actually deleted', async () => {
      // Delete student
      await request(app)
        .delete(`/api/students/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to get deleted student
      const response = await request(app)
        .get(`/api/students/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testHelpers.expectErrorResponse(response, 404, 'not found');
    });
  });
});
