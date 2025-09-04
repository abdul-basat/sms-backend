/**
 * Authentication Middleware
 * Handles Firebase Authentication and organization context
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Helper function to get Firebase Auth
const getAuthService = () => {
  const { getAuth } = require('firebase-admin/auth');
  return getAuth();
};

// Helper function to get Firestore
const getDb = () => {
  const { getFirestore } = require('firebase-admin/firestore');
  return getFirestore();
};

/**
 * Verify Firebase ID token and extract user information
 */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token required',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the Firebase ID token
    const decodedToken = await getAuthService().verifyIdToken(idToken);
    
    // Fetch user data from Firestore to get complete profile including role and organizationId
    const db = getDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    let userData = {};
    if (userDoc.exists) {
      userData = userDoc.data();
    }
    
    // Add user information to request (combine token data with Firestore data)
    req.user = {
      uid: decodedToken.uid,
      id: decodedToken.uid, // For compatibility with JWT middleware
      email: decodedToken.email || userData.email,
      emailVerified: decodedToken.email_verified || userData.isEmailVerified || false,
      name: decodedToken.name || userData.displayName,
      displayName: userData.displayName || decodedToken.name,
      picture: decodedToken.picture || userData.photoURL,
      
      // Get role and organization from Firestore (more reliable than custom claims)
      role: userData.role || decodedToken.role || 'user',
      organizationId: userData.organizationId || decodedToken.organizationId,
      permissions: userData.permissions || decodedToken.permissions || [],
      
      // Additional user info from Firestore
      instituteName: userData.instituteName,
      mobileNumber: userData.mobileNumber,
      assignedClasses: userData.assignedClasses || [],
      assignedModules: userData.assignedModules || [],
      status: userData.status || 'active'
    };

    logger.debug(`User authenticated: ${req.user.email} (${req.user.uid}) - Role: ${req.user.role}, Org: ${req.user.organizationId}`);
    next();

  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        error: 'Token revoked',
        code: 'TOKEN_REVOKED',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token',
      code: 'INVALID_TOKEN',
    });
  }
};

/**
 * Check if user has specific role
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const userRole = req.user.role;
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!rolesArray.includes(userRole)) {
      logger.warn(`Access denied for user ${req.user.email}. Required: ${rolesArray.join(', ')}, Has: ${userRole}`);
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: rolesArray,
        current: userRole,
      });
    }

    next();
  };
};

/**
 * Check if user has specific permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const userPermissions = req.user.permissions || [];
    
    if (!userPermissions.includes(permission)) {
      logger.warn(`Permission denied for user ${req.user.email}. Required: ${permission}`);
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: permission,
        current: userPermissions,
      });
    }

    next();
  };
};

/**
 * Ensure user belongs to organization (for organization-scoped endpoints)
 */
const requireOrganization = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const organizationId = req.params.organizationId || req.body.organizationId || req.user.organizationId;
  
  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: 'Organization context required',
    });
  }

  // Check if user belongs to the organization
  if (req.user.organizationId !== organizationId && req.user.role !== 'app_admin') {
    logger.warn(`Organization access denied for user ${req.user.email}. Requested: ${organizationId}, User's org: ${req.user.organizationId}`);
    return res.status(403).json({
      success: false,
      error: 'Access denied to this organization',
    });
  }

  req.organizationId = organizationId;
  next();
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await getAuthService().verifyIdToken(idToken);
      
      // Fetch user data from Firestore
      const db = getDb();
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      
      let userData = {};
      if (userDoc.exists) {
        userData = userDoc.data();
      }
      
      req.user = {
        uid: decodedToken.uid,
        id: decodedToken.uid,
        email: decodedToken.email || userData.email,
        emailVerified: decodedToken.email_verified || userData.isEmailVerified || false,
        name: decodedToken.name || userData.displayName,
        displayName: userData.displayName || decodedToken.name,
        picture: decodedToken.picture || userData.photoURL,
        role: userData.role || decodedToken.role || 'user',
        organizationId: userData.organizationId || decodedToken.organizationId,
        permissions: userData.permissions || decodedToken.permissions || [],
      };
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    logger.debug('Optional auth failed:', error.message);
    next();
  }
};

/**
 * JWT Authentication Middleware (for testing and JWT-based auth)
 */
const verifyJWTToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    
    // Fetch fresh user data from database to get updated role and organizationId
    const { users } = require('../models/dataStore');
    const currentUser = users.get(decoded.id);
    
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }
    
    // Add user information to request with fresh data from database
    req.user = {
      id: currentUser.id,
      email: currentUser.email,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      role: currentUser.role, // Fresh role from database
      organizationId: currentUser.organizationId, // Fresh organizationId from database
    };

    next();
  } catch (error) {
    logger.error('JWT Authentication error:', error);
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      error: 'Invalid authentication token',
    });
  }
};

/**
 * Optional JWT Authentication Middleware (for testing)
 */
const optionalJWTAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
      
      req.user = {
        id: decoded.id,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        role: decoded.role,
        organizationId: decoded.organizationId,
      };
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    logger.debug('Optional JWT auth failed:', error.message);
    next();
  }
};

module.exports = {
  auth: verifyFirebaseToken,
  jwtAuth: verifyJWTToken,
  requireRole,
  requirePermission,
  requireOrganization,
  optionalAuth,
  optionalJWTAuth,
};
