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
const { globalTimeConfigService } = require('./services/globalTimeConfigService');

// Import automation scheduler
const AutomationScheduler = require('./schedulers/automationScheduler');

// Import route handlers
const organizationRoutes = require('./routes/organizations');
const userRoutes = require('./routes/users');
const organizationUserRoutes = require('./routes/organizationUsers');
const studentRoutes = require('./routes/students');
const feesRoutes = require('./routes/fees');
const paymentRoutes = require('./routes/payments'); // Phase 5
const attendanceRoutes = require('./routes/attendance');
const whatsappRoutes = require('./routes/whatsapp');
const automationRoutes = require('./routes/automation');
const globalTimeConfigRoutes = require('./routes/globalTimeConfig');
// const communicationRoutes = require('./routes/communication'); // Phase 6 - temporarily disabled
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
const corsOptions = {
  credentials: true,
  optionsSuccessStatus: 200,
};

// Handle multiple origins from environment variable
const frontendUrls = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = frontendUrls.split(',').map(url => url.trim());

if (allowedOrigins.length === 1) {
  corsOptions.origin = allowedOrigins[0];
} else {
  corsOptions.origin = function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  };
}

app.use(cors(corsOptions));

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
          status: process.env.REDIS_ENABLED === 'false' ? 'disabled' : (global.redisClient ? 'connected' : 'disconnected')
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
app.use('/api/organization/users', organizationUserRoutes); // Organization user management
app.use('/api/students', studentRoutes); // Let routes handle their own auth
app.use('/api/fees', feesRoutes); // Let routes handle their own auth
app.use('/api/payments', paymentRoutes); // Phase 5 - Payment transactions and installments
// app.use('/api/communication', communicationRoutes); // Phase 6 - Analytics & Management - temporarily disabled
app.use('/api/attendance', authMiddleware, attendanceRoutes);
app.use('/api/whatsapp', authMiddleware, whatsappRoutes);
app.use('/api/automation', authMiddleware, automationRoutes);
app.use('/api', authMiddleware, globalTimeConfigRoutes);

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

    // Initialize Global Time Configuration Service
    await globalTimeConfigService.initialize();
    logger.info('Global Time Configuration Service initialized');

    // Initialize Redis (if enabled)
    if (process.env.REDIS_ENABLED !== 'false') {
      await connectRedis();
      logger.info('Redis connected successfully');
    } else {
      logger.info('📱 Redis disabled in development, using in-memory fallbacks');
    }

    // Initialize and start automation scheduler
    let automationScheduler;
    try {
      // Temporarily disable automation scheduler to test HTTP server
      console.log('⏭️ Skipping automation scheduler for testing...');
      logger.info('⏭️ Automation scheduler disabled for testing');
    } catch (error) {
      logger.error('Failed to initialize automation scheduler:', error);
    }

    // Store scheduler globally for graceful shutdown
    if (automationScheduler) {
      global.automationScheduler = automationScheduler;
    }

    // Start HTTP server
    console.log(`Starting HTTP server on port ${PORT}...`);
    const server = app.listen(PORT, () => {
      console.log(`✅ HTTP server started successfully`);
      logger.info(`🚀 Fees Manager Backend Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);
    });

    // Add error handler for server
    server.on('error', (error) => {
      console.error('❌ HTTP server error:', error);
      logger.error('HTTP server error:', error);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Stop automation scheduler
        if (global.automationScheduler) {
          await global.automationScheduler.stop();
          logger.info('Automation scheduler stopped');
        }
        
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
