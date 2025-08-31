const request = require('supertest');
const { app } = require('./src/server');

async function debugUserCreation() {
  try {
    console.log('=== Debug User Creation ===');
    
    // Test data generation WITH organizationId
    const userData = {
      email: `test${Date.now()}@example.com`,
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      organizationId: '123e4567-e89b-12d3-a456-426614174000' // Valid UUID format
    };
    
    console.log('Generated user data:', userData);
    
    // Try to register
    const response = await request(app)
      .post('/api/auth/register')
      .send(userData);
    
    console.log('Response status:', response.status);
    console.log('Response body:', response.body);
    
    if (response.status !== 201) {
      console.error('Registration failed!');
    } else {
      console.log('Registration successful!');
    }
    
  } catch (error) {
    console.error('Error during debug:', error.message);
  }
  
  process.exit(0);
}

debugUserCreation();
