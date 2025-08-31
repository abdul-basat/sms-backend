const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Integration Tests', () => {
  let testHelpers;
  let server;

  beforeAll(async () => {
    server = app.listen(3007);
    global.server = server;
    testHelpers = new TestHelpers(app);
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

  describe('Complete Multi-tenant Workflow', () => {
    it('should complete full organization setup and management workflow', async () => {
      // 1. Create Organization
      const orgData = global.testHelpers.generateTestOrganization();
      orgData.name = 'Complete Test School';
      
      const orgResponse = await request(app)
        .post('/api/organizations')
        .send(orgData)
        .expect(201);

      const organization = orgResponse.body.data.organization;
      expect(organization.name).toBe(orgData.name);

      // 2. Register Admin User
      const adminData = global.testHelpers.generateTestUser();
      adminData.organizationId = organization.id;
      adminData.role = 'admin';
      adminData.email = 'admin@completeschool.com';
      
      const adminRegResponse = await request(app)
        .post('/api/auth/register')
        .send(adminData)
        .expect(201);

      const { user: admin, token: adminToken } = adminRegResponse.body.data;
      expect(admin.role).toBe('admin');
      expect(adminToken).toBeDefined();

      // 3. Admin Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: adminData.email,
          password: adminData.password
        })
        .expect(200);

      expect(loginResponse.body.data.token).toBeDefined();

      // 4. Create Teacher Users
      const teacherData = global.testHelpers.generateTestUser();
      teacherData.organizationId = organization.id;
      teacherData.role = 'teacher';
      teacherData.email = 'teacher@completeschool.com';
      
      const teacherRegResponse = await request(app)
        .post('/api/auth/register')
        .send(teacherData)
        .expect(201);

      const teacher = teacherRegResponse.body.data.user;
      
      // 5. Admin creates multiple students
      const students = [];
      for (let i = 1; i <= 5; i++) {
        const studentData = global.testHelpers.generateTestStudent();
        studentData.firstName = `Student${i}`;
        studentData.rollNumber = `CS${i.toString().padStart(3, '0')}`;
        studentData.class = i <= 3 ? '10th' : '11th';
        
        const studentResponse = await request(app)
          .post('/api/students')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(studentData)
          .expect(201);

        students.push(studentResponse.body.data.student);
      }

      expect(students).toHaveLength(5);

      // 6. Get all students (verify organization isolation)
      const allStudentsResponse = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(allStudentsResponse.body.data.students).toHaveLength(5);
      allStudentsResponse.body.data.students.forEach(student => {
        expect(student.organizationId).toBe(organization.id);
      });

      // 7. Filter students by class
      const class10Students = await request(app)
        .get('/api/students?class=10th')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(class10Students.body.data.students).toHaveLength(3);

      // 8. Update organization details
      const orgUpdateData = {
        name: 'Complete Test School - Updated',
        phone: '+9876543210'
      };

      const updatedOrgResponse = await request(app)
        .put(`/api/organizations/${organization.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orgUpdateData)
        .expect(200);

      expect(updatedOrgResponse.body.data.organization.name).toBe(orgUpdateData.name);

      // 9. Get user profile
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(profileResponse.body.data.user.email).toBe(adminData.email);

      // 10. Admin manages users
      const usersResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(usersResponse.body.data.users.length).toBeGreaterThanOrEqual(2); // Admin + Teacher

      // 11. Update student information
      const studentToUpdate = students[0];
      const studentUpdateData = {
        firstName: 'Updated Student Name',
        class: '12th'
      };

      const updatedStudentResponse = await request(app)
        .put(`/api/students/${studentToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(studentUpdateData)
        .expect(200);

      expect(updatedStudentResponse.body.data.student.firstName).toBe(studentUpdateData.firstName);

      // 12. Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(logoutResponse.body.message).toContain('logged out');
    });

    it('should ensure multi-tenant data isolation', async () => {
      // Create two separate organizations
      const org1Data = global.testHelpers.generateTestOrganization();
      org1Data.name = 'Organization 1';
      
      const org2Data = global.testHelpers.generateTestOrganization();
      org2Data.name = 'Organization 2';

      const org1Response = await request(app)
        .post('/api/organizations')
        .send(org1Data)
        .expect(201);

      const org2Response = await request(app)
        .post('/api/organizations')
        .send(org2Data)
        .expect(201);

      const org1 = org1Response.body.data.organization;
      const org2 = org2Response.body.data.organization;

      // Create admin users for both organizations
      const admin1Data = global.testHelpers.generateTestUser();
      admin1Data.organizationId = org1.id;
      admin1Data.role = 'admin';
      admin1Data.email = 'admin1@org1.com';

      const admin2Data = global.testHelpers.generateTestUser();
      admin2Data.organizationId = org2.id;
      admin2Data.role = 'admin';
      admin2Data.email = 'admin2@org2.com';

      const admin1RegResponse = await request(app)
        .post('/api/auth/register')
        .send(admin1Data)
        .expect(201);

      const admin2RegResponse = await request(app)
        .post('/api/auth/register')
        .send(admin2Data)
        .expect(201);

      const admin1Token = admin1RegResponse.body.data.token;
      const admin2Token = admin2RegResponse.body.data.token;

      // Create students in both organizations
      const org1StudentData = global.testHelpers.generateTestStudent();
      org1StudentData.firstName = 'Org1Student';
      org1StudentData.rollNumber = 'ORG1001';

      const org2StudentData = global.testHelpers.generateTestStudent();
      org2StudentData.firstName = 'Org2Student';
      org2StudentData.rollNumber = 'ORG2001';

      const org1StudentResponse = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${admin1Token}`)
        .send(org1StudentData)
        .expect(201);

      const org2StudentResponse = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${admin2Token}`)
        .send(org2StudentData)
        .expect(201);

      const org1Student = org1StudentResponse.body.data.student;
      const org2Student = org2StudentResponse.body.data.student;

      // Verify data isolation - Admin1 can only see Org1 students
      const admin1StudentsResponse = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${admin1Token}`)
        .expect(200);

      expect(admin1StudentsResponse.body.data.students).toHaveLength(1);
      expect(admin1StudentsResponse.body.data.students[0].firstName).toBe('Org1Student');
      expect(admin1StudentsResponse.body.data.students[0].organizationId).toBe(org1.id);

      // Verify data isolation - Admin2 can only see Org2 students
      const admin2StudentsResponse = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${admin2Token}`)
        .expect(200);

      expect(admin2StudentsResponse.body.data.students).toHaveLength(1);
      expect(admin2StudentsResponse.body.data.students[0].firstName).toBe('Org2Student');
      expect(admin2StudentsResponse.body.data.students[0].organizationId).toBe(org2.id);

      // Verify Admin1 cannot access Org2 student
      const crossAccessResponse = await request(app)
        .get(`/api/students/${org2Student.id}`)
        .set('Authorization', `Bearer ${admin1Token}`)
        .expect(404);

      expect(crossAccessResponse.body.success).toBe(false);

      // Verify Admin2 cannot access Org1 student
      const crossAccessResponse2 = await request(app)
        .get(`/api/students/${org1Student.id}`)
        .set('Authorization', `Bearer ${admin2Token}`)
        .expect(404);

      expect(crossAccessResponse2.body.success).toBe(false);
    });

    it('should handle role-based permissions correctly', async () => {
      // Create organization and users with different roles
      const orgData = global.testHelpers.generateTestOrganization();
      const orgResponse = await request(app)
        .post('/api/organizations')
        .send(orgData)
        .expect(201);

      const organization = orgResponse.body.data.organization;

      // Create admin, teacher, and regular user
      const roles = ['admin', 'teacher', 'user'];
      const users = {};
      
      for (const role of roles) {
        const userData = global.testHelpers.generateTestUser();
        userData.organizationId = organization.id;
        userData.role = role;
        userData.email = `${role}@roletest.com`;
        
        const userResponse = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        users[role] = {
          user: userResponse.body.data.user,
          token: userResponse.body.data.token
        };
      }

      // Test admin permissions
      const adminUsersResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .expect(200);

      expect(adminUsersResponse.body.data.users.length).toBeGreaterThanOrEqual(3);

      // Test teacher permissions (can view users but can't delete)
      const teacherUsersResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${users.teacher.token}`)
        .expect(200);

      expect(teacherUsersResponse.body.data.users.length).toBeGreaterThanOrEqual(3);

      const teacherDeleteResponse = await request(app)
        .delete(`/api/users/${users.user.user.id}`)
        .set('Authorization', `Bearer ${users.teacher.token}`)
        .expect(403);

      expect(teacherDeleteResponse.body.success).toBe(false);

      // Test regular user permissions (limited access)
      const userListResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${users.user.token}`)
        .expect(403);

      expect(userListResponse.body.success).toBe(false);

      // But user can access their own profile
      const userProfileResponse = await request(app)
        .get(`/api/users/${users.user.user.id}`)
        .set('Authorization', `Bearer ${users.user.token}`)
        .expect(200);

      expect(userProfileResponse.body.data.user.id).toBe(users.user.user.id);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent student creation with same roll number', async () => {
      // Create organization and admin
      const orgData = global.testHelpers.generateTestOrganization();
      const orgResponse = await request(app)
        .post('/api/organizations')
        .send(orgData)
        .expect(201);

      const adminData = global.testHelpers.generateTestUser();
      adminData.organizationId = orgResponse.body.data.organization.id;
      adminData.role = 'admin';
      
      const adminRegResponse = await request(app)
        .post('/api/auth/register')
        .send(adminData)
        .expect(201);

      const adminToken = adminRegResponse.body.data.token;

      // Try to create students with same roll number concurrently
      const studentData1 = global.testHelpers.generateTestStudent();
      studentData1.rollNumber = 'DUPLICATE001';
      
      const studentData2 = global.testHelpers.generateTestStudent();
      studentData2.rollNumber = 'DUPLICATE001'; // Same roll number

      const promises = [
        request(app)
          .post('/api/students')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(studentData1),
        request(app)
          .post('/api/students')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(studentData2)
      ];

      const results = await Promise.allSettled(promises);
      
      // One should succeed, one should fail
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);
      const failed = results.filter(r => r.status === 'fulfilled' && r.value.status === 409);
      
      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);
    });

    it('should handle large dataset operations efficiently', async () => {
      // Create organization and admin
      const orgData = global.testHelpers.generateTestOrganization();
      const orgResponse = await request(app)
        .post('/api/organizations')
        .send(orgData)
        .expect(201);

      const adminData = global.testHelpers.generateTestUser();
      adminData.organizationId = orgResponse.body.data.organization.id;
      adminData.role = 'admin';
      
      const adminRegResponse = await request(app)
        .post('/api/auth/register')
        .send(adminData)
        .expect(201);

      const adminToken = adminRegResponse.body.data.token;

      // Create many students
      const studentPromises = [];
      for (let i = 1; i <= 50; i++) {
        const studentData = global.testHelpers.generateTestStudent();
        studentData.rollNumber = `BULK${i.toString().padStart(3, '0')}`;
        studentData.firstName = `BulkStudent${i}`;
        
        studentPromises.push(
          request(app)
            .post('/api/students')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(studentData)
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(studentPromises);
      const endTime = Date.now();

      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe(201);
      });

      // Should complete in reasonable time (adjust threshold as needed)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(30000); // 30 seconds max

      // Verify pagination works with large dataset
      const paginatedResponse = await request(app)
        .get('/api/students?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(paginatedResponse.body.data.students).toHaveLength(10);
      expect(paginatedResponse.body.data.pagination.total).toBe(50);
    });

    it('should handle invalid authentication tokens gracefully', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'expired-token',
        'malformed.jwt.token',
        ''
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/students')
          .set('Authorization', token)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/token|unauthorized|authentication/i);
      }
    });
  });
});
