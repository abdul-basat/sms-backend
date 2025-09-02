/**
 * Firebase Configuration
 * Manages Firebase Admin SDK settings and connection parameters
 */

class FirebaseConfig {
  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment variables
   */
  loadConfig() {
    return {
      // Project configuration
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      
      // Connection settings
      timeout: parseInt(process.env.FIREBASE_TIMEOUT) || 30000, // 30 seconds
      maxRetries: parseInt(process.env.FIREBASE_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.FIREBASE_RETRY_DELAY) || 1000, // 1 second
      
      // Firestore settings
      firestore: {
        host: process.env.FIRESTORE_HOST || 'firestore.googleapis.com',
        port: parseInt(process.env.FIRESTORE_PORT) || 443,
        ssl: process.env.FIRESTORE_SSL !== 'false', // Default true
        maxIdleChannels: parseInt(process.env.FIRESTORE_MAX_IDLE_CHANNELS) || 1,
        maxConcurrentStreams: parseInt(process.env.FIRESTORE_MAX_CONCURRENT_STREAMS) || 100
      },
      
      // Collection names
      collections: {
        automationRules: process.env.FIREBASE_COLLECTION_AUTOMATION_RULES || 'automationRules',
        students: process.env.FIREBASE_COLLECTION_STUDENTS || 'students',
        messageTemplates: process.env.FIREBASE_COLLECTION_MESSAGE_TEMPLATES || 'messageTemplates',
        rateLimitingRules: process.env.FIREBASE_COLLECTION_RATE_LIMITING_RULES || 'rateLimitingRules',
        messageLogs: process.env.FIREBASE_COLLECTION_MESSAGE_LOGS || 'messageLogs',
        users: process.env.FIREBASE_COLLECTION_USERS || 'users',
        settings: process.env.FIREBASE_COLLECTION_SETTINGS || 'settings'
      },
      
      // Caching settings
      cache: {
        enabled: process.env.FIREBASE_CACHE_ENABLED !== 'false', // Default true
        ttl: parseInt(process.env.FIREBASE_CACHE_TTL) || 300000, // 5 minutes
        maxSize: parseInt(process.env.FIREBASE_CACHE_MAX_SIZE) || 1000
      },
      
      // Logging settings
      logging: {
        enabled: process.env.FIREBASE_LOGGING_ENABLED !== 'false', // Default true
        level: process.env.FIREBASE_LOG_LEVEL || 'info',
        includeMetadata: process.env.FIREBASE_LOG_INCLUDE_METADATA !== 'false' // Default true
      }
    };
  }

  /**
   * Get project ID
   */
  getProjectId() {
    return this.config.projectId;
  }

  /**
   * Get private key
   */
  getPrivateKey() {
    return this.config.privateKey?.replace(/\\n/g, '\n');
  }

  /**
   * Get client email
   */
  getClientEmail() {
    return this.config.clientEmail;
  }

  /**
   * Get timeout setting
   */
  getTimeout() {
    return this.config.timeout;
  }

  /**
   * Get max retries setting
   */
  getMaxRetries() {
    return this.config.maxRetries;
  }

  /**
   * Get retry delay setting
   */
  getRetryDelay() {
    return this.config.retryDelay;
  }

  /**
   * Get Firestore settings
   */
  getFirestoreSettings() {
    return this.config.firestore;
  }

  /**
   * Get collection name
   * @param {string} collectionKey - Collection key
   * @returns {string} - Collection name
   */
  getCollectionName(collectionKey) {
    return this.config.collections[collectionKey];
  }

  /**
   * Get all collection names
   */
  getCollectionNames() {
    return this.config.collections;
  }

  /**
   * Get cache settings
   */
  getCacheSettings() {
    return this.config.cache;
  }

  /**
   * Check if caching is enabled
   */
  isCachingEnabled() {
    return this.config.cache.enabled;
  }

  /**
   * Get cache TTL
   */
  getCacheTTL() {
    return this.config.cache.ttl;
  }

  /**
   * Get cache max size
   */
  getCacheMaxSize() {
    return this.config.cache.maxSize;
  }

  /**
   * Get logging settings
   */
  getLoggingSettings() {
    return this.config.logging;
  }

  /**
   * Check if logging is enabled
   */
  isLoggingEnabled() {
    return this.config.logging.enabled;
  }

  /**
   * Get log level
   */
  getLogLevel() {
    return this.config.logging.level;
  }

  /**
   * Check if metadata should be included in logs
   */
  shouldIncludeMetadata() {
    return this.config.logging.includeMetadata;
  }

  /**
   * Get service account configuration
   */
  getServiceAccount() {
    return {
      project_id: this.config.projectId,
      private_key: this.getPrivateKey(), 
      client_email: this.config.clientEmail
    };
  }

  /**
   * Get Firebase Admin SDK initialization options
   */
  getAdminSDKOptions() {
    return {
      credential: {
        projectId: this.config.projectId,
        privateKey: this.getPrivateKey(),
        clientEmail: this.config.clientEmail
      },
      projectId: this.config.projectId,
      databaseURL: `https://${this.config.projectId}.firebaseio.com`,
      storageBucket: `${this.config.projectId}.appspot.com`
    };
  }

  /**
   * Get Firestore settings for initialization
   */
  getFirestoreOptions() {
    return {
      projectId: this.config.projectId,
      host: this.config.firestore.host,
      port: this.config.firestore.port,
      ssl: this.config.firestore.ssl,
      maxIdleChannels: this.config.firestore.maxIdleChannels,
      maxConcurrentStreams: this.config.firestore.maxConcurrentStreams
    };
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];

    if (!this.config.projectId) {
      errors.push('FIREBASE_PROJECT_ID is required');
    }

    if (!this.config.privateKey) {
      errors.push('FIREBASE_PRIVATE_KEY is required');
    }

    if (!this.config.clientEmail) {
      errors.push('FIREBASE_CLIENT_EMAIL is required');
    }

    if (this.config.timeout < 1000) {
      errors.push('FIREBASE_TIMEOUT must be at least 1000ms');
    }

    if (this.config.maxRetries < 1) {
      errors.push('FIREBASE_MAX_RETRIES must be at least 1');
    }

    if (this.config.retryDelay < 100) {
      errors.push('FIREBASE_RETRY_DELAY must be at least 100ms');
    }

    if (this.config.cache.ttl < 1000) {
      errors.push('FIREBASE_CACHE_TTL must be at least 1000ms');
    }

    if (this.config.cache.maxSize < 1) {
      errors.push('FIREBASE_CACHE_MAX_SIZE must be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration summary (without sensitive data)
   */
  getSummary() {
    return {
      projectId: this.config.projectId,
      clientEmail: this.config.clientEmail,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      firestore: this.config.firestore,
      collections: this.config.collections,
      cache: this.config.cache,
      logging: this.config.logging
    };
  }

  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   */
  updateConfig(updates) {
    Object.assign(this.config, updates);
    console.log('🔄 Firebase configuration updated');
  }

  /**
   * Get environment variables template
   */
  getEnvironmentTemplate() {
    return {
      FIREBASE_PROJECT_ID: 'your-project-id',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
      FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com',
      FIREBASE_TIMEOUT: '30000',
      FIREBASE_MAX_RETRIES: '3',
      FIREBASE_RETRY_DELAY: '1000',
      FIRESTORE_HOST: 'firestore.googleapis.com',
      FIRESTORE_PORT: '443',
      FIRESTORE_SSL: 'true',
      FIRESTORE_MAX_IDLE_CHANNELS: '1',
      FIRESTORE_MAX_CONCURRENT_STREAMS: '100',
      FIREBASE_COLLECTION_AUTOMATION_RULES: 'automationRules',
      FIREBASE_COLLECTION_STUDENTS: 'students',
      FIREBASE_COLLECTION_MESSAGE_TEMPLATES: 'messageTemplates',
      FIREBASE_COLLECTION_RATE_LIMITING_RULES: 'rateLimitingRules',
      FIREBASE_COLLECTION_MESSAGE_LOGS: 'messageLogs',
      FIREBASE_COLLECTION_USERS: 'users',
      FIREBASE_COLLECTION_SETTINGS: 'settings',
      FIREBASE_CACHE_ENABLED: 'true',
      FIREBASE_CACHE_TTL: '300000',
      FIREBASE_CACHE_MAX_SIZE: '1000',
      FIREBASE_LOGGING_ENABLED: 'true',
      FIREBASE_LOG_LEVEL: 'info',
      FIREBASE_LOG_INCLUDE_METADATA: 'true'
    };
  }
}

// Create singleton instance
const firebaseConfig = new FirebaseConfig();

/**
 * Initialize Firebase Admin SDK
 */
async function initializeFirebase() {
  try {
    const admin = require('firebase-admin');
    
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      console.log('Firebase already initialized');
      return admin.app();
    }

    // Check if we have valid credentials
    const serviceAccount = firebaseConfig.getServiceAccount();
    
    // If using placeholder values, skip Firebase initialization
    if (!serviceAccount.project_id || 
        serviceAccount.project_id === 'your-project-id' ||
        serviceAccount.project_id === 'your-actual-project-id' ||
        !serviceAccount.private_key || 
        serviceAccount.private_key === 'your-private-key' ||
        serviceAccount.private_key === '"-----BEGIN PRIVATE KEY-----\\nYOUR_PRIVATE_KEY_HERE\\n-----END PRIVATE KEY-----\\n"' ||
        !serviceAccount.client_email ||
        serviceAccount.client_email === 'your-service-account-email' ||
        serviceAccount.client_email === 'your-service-account@project.iam.gserviceaccount.com' ||
        serviceAccount.client_email === 'firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com' ||
        serviceAccount.private_key.includes('YOUR_PRIVATE_KEY_HERE')) {
      console.warn('⚠️  Firebase credentials not configured. Skipping Firebase initialization.');
      console.warn('   Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env file');
      return null;
    }
    
    // Initialize Firebase Admin
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });

    // Store globally for access across modules
    global.firebaseAdmin = admin;
    global.firebaseApp = app;
    
    // Update the db export immediately after initialization
    const db = admin.firestore();
    module.exports.db = db;
    
    console.log('✅ Firebase Admin SDK initialized successfully');
    return app;

  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error.message);
    console.warn('⚠️  Server will continue without Firebase. Set proper credentials in .env file');
    return null;
  }
}

/**
 * Get Firebase Admin instance
 */
function getFirebaseAdmin() {
  if (!global.firebaseAdmin) {
    console.warn('⚠️  Firebase Admin not available. Configure Firebase credentials in .env file');
    return null;
  }
  return global.firebaseAdmin;
}

/**
 * Get Firestore database instance
 */
function getFirestore() {
  if (global.firebaseAdmin) {
    return global.firebaseAdmin.firestore();
  }
  
  // If Firebase failed, try mock service for development
  if (process.env.NODE_ENV === 'development') {
    const { createMockFirestore } = require('../services/mockFirebaseService');
    console.log('⚠️ Using Mock Firebase Service for development');
    return createMockFirestore();
  }
  
  throw new Error('Firebase Admin not initialized. Call initializeFirebase() first.');
}

// Create database instance for backward compatibility
let db = null;

module.exports = {
  config: firebaseConfig,
  initializeFirebase,
  getFirebaseAdmin,
  getFirestore,
  get db() {
    // Dynamic getter that returns current db instance
    if (global.firebaseAdmin) {
      return global.firebaseAdmin.firestore();
    }
    
    // Fallback to mock service in development
    if (process.env.NODE_ENV === 'development') {
      const { createMockFirestore } = require('../services/mockFirebaseService');
      return createMockFirestore();
    }
    
    return null;
  }
};
