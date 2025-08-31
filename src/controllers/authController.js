/**
 * Authentication Controller
 * Handles authentication-related business logic
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { users } = require('../models/dataStore');

// Helper functions to get Firebase services
const getAuthService = () => {
  const { getAuth } = require('firebase-admin/auth');
  return getAuth();
};

const getDb = () => {
  const { getFirestore } = require('firebase-admin/firestore');
  return getFirestore();
};

/**
 * Generate JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id,  // Use 'id' to match JWT middleware expectation
      email: user.email, 
      firstName: user.firstName,
      lastName: user.lastName,
      organizationId: user.organizationId,
      role: user.role 
    },
    process.env.JWT_SECRET || 'test-secret-key',
    { expiresIn: '24h' }
  );
};

/**
 * Register a new user
 */
const register = async (req, res) => {
  const { email, password, firstName, lastName, role = 'user', organizationId } = req.body;

  try {
    // Check if user already exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user = {
      id: userId,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      organizationId: organizationId || null, // Don't auto-assign organization in testing
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.set(userId, user);

    // Generate token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = { ...user };
    delete userResponse.password;

    logger.info(`User registered: ${email}`, { userId });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    throw error;
  }
};

/**
 * Login user
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Generate token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = { ...user };
    delete userResponse.password;

    logger.info(`User logged in: ${email}`, { userId: user.id });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    throw error;
  }
};

/**
 * Logout user
 */
const logout = async (req, res) => {
  try {
    // In a real implementation, you might blacklist the token
    // For now, just return success
    logger.info(`User logged out`, { userId: req.user.userId });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    throw error;
  }
};

/**
 * Get current user
 */
const getCurrentUser = async (req, res) => {
  try {
    // Support both JWT (id) and Firebase (userId) user identification
    const userId = req.user.id || req.user.userId;
    
    // Debug logging
    logger.debug('getCurrentUser debug:', {
      reqUser: req.user,
      userId: userId,
      allUserIds: Array.from(users.keys()),
      userExists: users.has(userId)
    });
    
    const user = users.get(userId);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Remove password from response
    const userResponse = { ...user };
    delete userResponse.password;

    res.json({
      success: true,
      data: {
        user: userResponse
      }
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    throw error;
  }
};

/**
 * Verify Firebase ID token
 */
const verifyToken = async (req, res) => {
  const { idToken } = req.body;

  try {
    const decodedToken = await getAuthService().verifyIdToken(idToken);
    
    // Get additional user data from Firestore
    const db = getDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      displayName: decodedToken.name || userData.displayName,
      photoURL: decodedToken.picture || userData.photoURL,
      phoneNumber: decodedToken.phone_number || userData.phoneNumber,
      organizationId: decodedToken.organizationId || userData.organizationId,
      role: decodedToken.role || userData.role || 'user',
      permissions: decodedToken.permissions || userData.permissions || [],
      lastLoginAt: new Date().toISOString(),
    };

    // Update last login time
    await db.collection('users').doc(decodedToken.uid).set({
      ...userData,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    res.json({
      success: true,
      data: { user },
      message: 'Token verified successfully',
    });
  } catch (error) {
    logger.error('Token verification error:', error);
    if (error.code === 'auth/id-token-expired') {
      throw new AppError('Token expired', 401);
    }
    if (error.code === 'auth/id-token-revoked') {
      throw new AppError('Token revoked', 401);
    }
    throw new AppError('Invalid token', 401);
  }
};

/**
 * Refresh authentication token
 */
const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  try {
    // In Firebase, you would use the refresh token to get a new ID token
    // For now, we'll just validate and return success
    logger.info('Token refresh requested');

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        idToken: 'new-id-token', // In real implementation, get from Firebase
        refreshToken: 'new-refresh-token'
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    throw new AppError('Failed to refresh token', 400);
  }
};

/**
 * Update current user information
 */
const updateCurrentUser = async (req, res) => {
  const { displayName, phoneNumber } = req.body;
  const userId = req.user.uid || req.user.userId;

  try {
    const db = getDb();
    const updateData = {
      updatedAt: new Date(),
    };

    if (displayName) updateData.displayName = displayName;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    await db.collection('users').doc(userId).update(updateData);

    // Get updated user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: userData }
    });
  } catch (error) {
    logger.error('Update user error:', error);
    throw new AppError('Failed to update user', 400);
  }
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  verifyToken,
  refreshToken,
  updateCurrentUser,
};
