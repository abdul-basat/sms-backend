const { app } = require('./src/server');
const request = require('supertest');

async function testUserCreation() {
  console.log('Testing user creation with UUID organizationId...\n');
  
  // First create an organization to get a proper UUID
  const userData = {
    email: `test${Date.now()}@example.com`,
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
  role: 'school_admin'
  };

  console.log('1. Creating user for organization setup...');
  const userResponse = await request(app)
    .post('/api/auth/register')
    .send(userData);
    
  console.log('User registration response:', userResponse.status, userResponse.body);

  if (userResponse.status !== 201) {
    console.log('Failed to create initial user. Stopping.');
    return;
  }

  // Login to get token
  console.log('\n2. Logging in user...');
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      email: userData.email,
      password: userData.password
    });
    
  console.log('Login response:', loginResponse.status);
  
  if (loginResponse.status !== 200) {
    console.log('Failed to login. Stopping.');
    return;
  }

  const token = loginResponse.body.data.token;

  // Create organization
  console.log('\n3. Creating organization...');
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
    
  console.log('Organization creation response:', orgResponse.status);
  console.log('Organization data:', orgResponse.body);

  if (orgResponse.status !== 201) {
    console.log('Failed to create organization. Stopping.');
    return;
  }

  const organizationId = orgResponse.body.data.organization.id;
  console.log('\nOrganization ID (UUID):', organizationId);
  console.log('Is valid UUID format:', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId));

  // Now try to create a user with this organizationId
  console.log('\n4. Creating user with organizationId...');
  const newUserData = {
    email: `newuser${Date.now()}@example.com`,
    password: 'password123',
    firstName: 'New',
    lastName: 'User',
    role: 'school_admin',
    organizationId: organizationId
  };

  console.log('User data being sent:', newUserData);

  const newUserResponse = await request(app)
    .post('/api/auth/register')
    .send(newUserData);
    
  console.log('\nNew user registration response:', newUserResponse.status);
  console.log('Response body:', newUserResponse.body);
  console.log('Response text:', newUserResponse.text);
}

testUserCreation().catch(console.error);
