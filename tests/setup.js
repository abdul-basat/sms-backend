const { config } = require('dotenv');
const path = require('path');

// Load test environment variables
config({ path: path.resolve(__dirname, '../.env') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = 3002; // Use different port for testing

// Global test timeout
jest.setTimeout(30000);

// Mock Firebase Admin SDK for testing
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(() => ({}))
  },
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        get: jest.fn()
      })),
      orderBy: jest.fn(() => ({
        get: jest.fn()
      })),
      limit: jest.fn(() => ({
        get: jest.fn()
      }))
    }))
  })),
  auth: jest.fn(() => ({
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    getUser: jest.fn(),
    verifyIdToken: jest.fn()
  }))
}));

// Global test helpers
global.testHelpers = {
  generateTestUser: () => ({
    email: `test${Date.now()}@example.com`,
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    role: 'user'
  }),
  
  generateTestOrganization: () => ({
    name: `Test Org ${Date.now()}`,
    email: `org${Date.now()}@example.com`,
    phone: '+1234567890',
    address: '123 Test Street',
    type: 'school'
  }),
  
  generateTestStudent: () => ({
    firstName: 'John',
    lastName: 'Doe',
    rollNumber: `STU${Date.now()}`,
    class: '10th',
    section: 'A',
    fatherName: 'John Sr.',
    motherName: 'Jane Doe',
    phone: '+1234567890',
    address: '123 Student Street'
  })
};

// Clean up after tests
afterAll(async () => {
  // Close any open connections
  if (global.server) {
    await new Promise((resolve) => {
      global.server.close(resolve);
    });
  }
});
