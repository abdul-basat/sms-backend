const request = require('supertest');
const { app } = require('../src/server');
const TestHelpers = require('./helpers/TestHelpers');

describe('Debug Single Fee Test', () => {
  let testHelpers;
  let server;

  beforeAll(async () => {
    server = app.listen(3008);
    global.server = server;
    testHelpers = new TestHelpers(app);
  });

  afterAll(async () => {
    await testHelpers.cleanup();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should create a fee successfully', async () => {
    console.log('\n=== DEBUGGING SINGLE FEE TEST ===\n');
    
    // Create organization and authenticate user
    console.log('1. Creating test organization...');
    const testOrganization = await testHelpers.createTestOrganization();
    console.log('   Organization created:', testOrganization.id);
    
    console.log('2. Creating admin user...');
    const userData = global.testHelpers.generateTestUser();
    userData.organizationId = testOrganization.id;
    userData.role = 'school_admin';
    console.log('   User data:', userData);
    
    const { token } = await testHelpers.createTestUser(userData, testOrganization.id);
    console.log('   Token received, length:', token.length);
    testHelpers.setAuthToken(token);

    // Create a test student for fee creation
    console.log('3. Creating test student...');
    const studentData = global.testHelpers.generateTestStudent();
    console.log('   Student data:', studentData);
    const testStudent = await testHelpers.createTestStudent(studentData);
    console.log('   Student created:', testStudent.id);

    console.log('4. Creating fee...');
    const feeData = {
      studentId: testStudent.id,
      type: 'monthly',
      amount: 1000,
      month: '2025-09',
      dueDate: '2025-09-05',
      category: 'tuition',
      description: 'September tuition fee'
    };
    console.log('   Fee data:', feeData);
    
    const response = await request(app)
      .post('/api/fees')
      .set('Authorization', `Bearer ${token}`)
      .send(feeData);
      
    console.log('   Response status:', response.status);
    console.log('   Response body:', response.body);
    
    if (response.status !== 201) {
      console.log('   Response text:', response.text);
      throw new Error(`Expected 201, got ${response.status}`);
    }
    
    console.log('\n=== SUCCESS! ===\n');
    expect(response.status).toBe(201);
    expect(response.body.data.fee.studentId).toBe(testStudent.id);
  });
});
