const request = require('supertest');
const { app } = require('../src/server');

describe('Health Endpoint', () => {
  let server;

  beforeAll(async () => {
    // Start server for testing
    server = app.listen(3002);
    global.server = server;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('GET /health', () => {
    it('should return 200 and health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
    });

    it('should return valid timestamp format', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should return numeric uptime', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /api/health', () => {
    it('should return detailed health check', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status', 'healthy');
      expect(response.body.data).toHaveProperty('checks');
      expect(response.body.data.checks).toHaveProperty('firebase');
      expect(response.body.data.checks).toHaveProperty('redis');
    });

    it('should check Firebase connection', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.checks.firebase).toHaveProperty('status');
      expect(['connected', 'disconnected', 'error']).toContain(
        response.body.data.checks.firebase.status
      );
    });

    it('should check Redis connection', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.checks.redis).toHaveProperty('status');
      expect(['connected', 'disconnected', 'error']).toContain(
        response.body.data.checks.redis.status
      );
    });
  });

  describe('Invalid endpoints', () => {
    it('should return 404 for non-existent endpoints', async () => {
      await request(app)
        .get('/non-existent-endpoint')
        .expect(404);
    });

    it('should return 404 for invalid API endpoints', async () => {
      await request(app)
        .get('/api/non-existent')
        .expect(404);
    });
  });
});
