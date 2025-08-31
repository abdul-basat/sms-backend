/**
 * Fees Manager Backend Server
 * Production-ready Express.js server for multi-tenant fees management
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const { connectRedis } = require('./config/redis');
const { initializeFirebase } = require('./config/firebase');

// Import route handlers
const organizationRoutes = require('./routes/organizations');
const userRoutes = require('./routes/users');
const studentRoutes = require('./routes/students');
const feesRoutes = require('./routes/fees');
const paymentRoutes = require('./routes/payments'); // Phase 5
const attendanceRoutes = require('./routes/attendance');
const whatsappRoutes = require('./routes/whatsapp');
const automationRoutes = require('./routes/automation');
const communicationRoutes = require('./routes/communication'); // Phase 6
const authRoutes = require('./routes/auth');

// Import middleware
const { auth: authMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting (disabled in test environment)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);
}

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Detailed health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      checks: {
        redis: {
          status: global.redisClient ? 'connected' : 'disconnected'
        },
        firebase: {
          status: global.firebaseAdmin ? 'connected' : 'disconnected'
        }
      }
    }
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes); // Let routes handle their own auth
app.use('/api/users', userRoutes); // Let routes handle their own auth
app.use('/api/students', studentRoutes); // Let routes handle their own auth
app.use('/api/fees', feesRoutes); // Let routes handle their own auth
app.use('/api/payments', paymentRoutes); // Phase 5 - Payment transactions and installments
app.use('/api/communication', communicationRoutes); // Phase 6 - Analytics & Management
app.use('/api/attendance', authMiddleware, attendanceRoutes);
app.use('/api/whatsapp', authMiddleware, whatsappRoutes);
app.use('/api/automation', authMiddleware, automationRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize services and start server
async function startServer() {
  try {
    // Initialize Firebase
    await initializeFirebase();
    logger.info('Firebase initialized successfully');

    // Initialize Redis
    await connectRedis();
    logger.info('Redis connected successfully');

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Fees Manager Backend Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close Redis connection
        if (global.redisClient) {
          await global.redisClient.quit();
          logger.info('Redis connection closed');
        }
        
        // Close Firebase connection
        if (global.firebaseAdmin) {
          await global.firebaseAdmin.app().delete();
          logger.info('Firebase connection closed');
        }
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
