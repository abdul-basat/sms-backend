# API Testing Suite

This directory contains comprehensive API tests for the Fees Manager backend service.

## 🧪 Test Structure

```
tests/
├── setup.js                 # Test configuration and global setup
├── helpers/
│   └── TestHelpers.js       # Reusable test utilities
├── health.test.js           # Health endpoint tests
├── auth.test.js             # Authentication API tests
├── organizations.test.js    # Organization management tests
├── students.test.js         # Student management tests
├── users.test.js            # User management tests
├── integration.test.js      # End-to-end integration tests
├── run-tests.js            # Interactive test runner
└── README.md               # This file
```

## 🚀 Quick Start

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Interactive Test Runner
```bash
node tests/run-tests.js
```

## 📋 Available Test Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:health` | Run health endpoint tests only |
| `npm run test:auth` | Run authentication tests only |
| `npm run test:organizations` | Run organization tests only |
| `npm run test:students` | Run student tests only |
| `npm run test:users` | Run user tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:api` | Run all API tests with verbose output |
| `npm run test:unit` | Run unit tests (excludes integration) |
| `npm run test:ci` | Run tests for CI/CD pipeline |

## 🔧 Test Configuration

### Environment Variables
Tests use the following environment variables:
- `NODE_ENV=test` (automatically set)
- `PORT=3002` (test server port)
- `JWT_SECRET` (for token generation)
- Firebase credentials (mocked in tests)

### Test Database
Tests use mocked Firebase services to avoid hitting real databases. The mock configuration is in `tests/setup.js`.

## 📊 Test Coverage

Our test suite covers:

### Authentication (auth.test.js)
- ✅ User registration with validation
- ✅ User login/logout
- ✅ Token verification
- ✅ Password security
- ✅ Email validation
- ✅ Duplicate email prevention

### Organizations (organizations.test.js)
- ✅ Organization CRUD operations
- ✅ Multi-tenant data isolation
- ✅ Search and pagination
- ✅ Input validation
- ✅ Authorization checks

### Students (students.test.js)
- ✅ Student CRUD operations
- ✅ Roll number uniqueness
- ✅ Class-based filtering
- ✅ Organization-scoped access
- ✅ Search functionality
- ✅ Pagination support

### Users (users.test.js)
- ✅ User management
- ✅ Role-based permissions
- ✅ Profile updates
- ✅ Admin vs user access
- ✅ Self-service capabilities

### Integration (integration.test.js)
- ✅ Complete multi-tenant workflows
- ✅ Cross-service data consistency
- ✅ Role-based access control
- ✅ Error handling
- ✅ Performance under load

### Health (health.test.js)
- ✅ Basic health checks
- ✅ Service connectivity
- ✅ Firebase status
- ✅ Redis status

## 🛠 Test Utilities

### TestHelpers Class
Located in `helpers/TestHelpers.js`, provides:

```javascript
// Create test data
const user = testHelpers.generateTestUser();
const org = await testHelpers.createTestOrganization();
const student = await testHelpers.createTestStudent();

// Authentication
testHelpers.setAuthToken(token);
const authRequest = testHelpers.authenticatedRequest('get', '/api/users');

// Assertions
testHelpers.expectSuccessResponse(response, 200, ['data']);
testHelpers.expectErrorResponse(response, 400, 'validation error');
```

### Global Test Helpers
Available in all tests via `global.testHelpers`:

```javascript
const userData = global.testHelpers.generateTestUser();
const orgData = global.testHelpers.generateTestOrganization();
const studentData = global.testHelpers.generateTestStudent();
```

## 🔍 Test Examples

### Basic API Test
```javascript
it('should create a new student', async () => {
  const studentData = global.testHelpers.generateTestStudent();
  
  const response = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${authToken}`)
    .send(studentData)
    .expect(201);

  expect(response.body.data.student.firstName).toBe(studentData.firstName);
});
```

### Multi-tenant Test
```javascript
it('should isolate organization data', async () => {
  // Create two organizations
  const org1 = await testHelpers.createTestOrganization();
  const org2 = await testHelpers.createTestOrganization();
  
  // Create users in each organization
  const user1 = await testHelpers.createTestUser(null, org1.id);
  const user2 = await testHelpers.createTestUser(null, org2.id);
  
  // Verify user1 cannot access org2 data
  const response = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${user1.token}`)
    .expect(200);
    
  // Should only see org1 students
  response.body.data.students.forEach(student => {
    expect(student.organizationId).toBe(org1.id);
  });
});
```

## 🐛 Debugging Tests

### Running Individual Tests
```bash
# Run specific test file
npx jest tests/auth.test.js

# Run specific test case
npx jest -t "should create a new user"

# Run with verbose output
npx jest --verbose
```

### Debug Mode
```bash
# Run with debug output
DEBUG=* npm test

# Run single test with debugging
npx jest tests/auth.test.js --verbose --no-cache
```

### Common Issues

1. **Port conflicts**: Tests use port 3002-3007. Ensure these are available.
2. **Async cleanup**: Use `afterEach` for proper test cleanup.
3. **Mock issues**: Check Firebase mocks in `setup.js` if Firebase-related tests fail.

## 📈 Performance Testing

Integration tests include performance checks:
- Bulk operations (50+ records)
- Concurrent request handling
- Response time validation
- Memory usage monitoring

## 🔐 Security Testing

Tests verify:
- Authentication requirements
- Authorization levels
- Input validation
- SQL injection prevention
- Cross-tenant data access

## 🚦 CI/CD Integration

For continuous integration:
```bash
# CI-friendly test run
npm run test:ci

# Generate coverage for CI
npm run test:coverage -- --coverage --watchAll=false
```

## 📝 Adding New Tests

1. Create test file in appropriate category
2. Follow naming convention: `feature.test.js`
3. Use TestHelpers for common operations
4. Include both positive and negative test cases
5. Test authentication and authorization
6. Verify multi-tenant isolation
7. Add performance considerations for bulk operations

## 🎯 Test Quality Guidelines

- **Isolation**: Each test should be independent
- **Cleanup**: Always clean up test data
- **Assertions**: Use descriptive expect statements
- **Coverage**: Aim for >90% code coverage
- **Performance**: Keep test execution under 30 seconds total
- **Readability**: Use clear test descriptions and comments
