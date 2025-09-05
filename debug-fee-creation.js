const { app } = require('./src/server');
const request = require('supertest');

async function testFeeCreation() {
  console.log('Testing fee creation...\n');
  
  // Step 1: Create organization and admin user (like test setup)
  const userData = {
    email: `test${Date.now()}@example.com`,
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
  role: 'school_admin'
  };

  const userResponse = await request(app)
    .post('/api/auth/register')
    .send(userData);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      email: userData.email,
      password: userData.password
    });

  const token = loginResponse.body.data.token;

  const orgData = {
    name: `Test Org ${Date.now()}`,
    email: `org${Date.now()}@example.com`,
    phone: '+1234567890',
    address: '123 Test Street',
    type: 'school'
  };

  const orgResponse = await request(app)
    .post('/api/organizations')
    .set('Authorization', `Bearer ${token}`)
    .send(orgData);

  const organizationId = orgResponse.body.data.organization.id;

  // Step 2: Create admin user for this organization (like the test does)
  const adminUserData = {
    email: `admin${Date.now()}@example.com`,
    password: 'password123',
    firstName: 'Admin',
    lastName: 'User',
    role: 'school_admin',
    organizationId: organizationId
  };

  const adminResponse = await request(app)
    .post('/api/auth/register')
    .send(adminUserData);

  console.log('Admin user created:', adminResponse.status);

  const adminLoginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      email: adminUserData.email,
      password: adminUserData.password
    });

  const adminToken = adminLoginResponse.body.data.token;
  console.log('Admin login successful');

  // Step 3: Create a student
  const studentData = {
    firstName: 'John',
    lastName: 'Doe',
    rollNumber: `STU${Date.now()}`,
    class: '10th',
    section: 'A'
  };

  const studentResponse = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(studentData);

  console.log('Student created:', studentResponse.status);
  const student = studentResponse.body.data.student;

  // Step 4: Now try to create a fee
  const feeData = {
    studentId: student.id,
    type: 'monthly',
    amount: 1000,
    month: '2025-09',
    dueDate: '2025-09-05',
    category: 'tuition',
    description: 'September tuition fee'
  };

  console.log('\nTrying to create fee with data:', feeData);

  const feeResponse = await request(app)
    .post('/api/fees')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(feeData);

  console.log('\nFee creation response:');
  console.log('Status:', feeResponse.status);
  console.log('Body:', feeResponse.body);
  console.log('Text:', feeResponse.text);
}

testFeeCreation().catch(console.error);
