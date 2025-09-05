/**
 * Organization User Management Controller
 * Handles user creation for organizations using Firebase Admin SDK
 */

const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Helper functions to get Firebase services
const getAuthService = () => {
  const { getAuth } = require('firebase-admin/auth');
  return getAuth();
};

const getDb = () => {
  const { getFirestore } = require('firebase-admin/firestore');
  return getFirestore();
};

// Role permission templates
const ROLE_PERMISSION_TEMPLATES = {
  teacher: {
    role: 'teacher',
    defaultPermissions: [
      {
        resource: 'students',
        actions: ['read', 'write', 'export'],
        scope: 'assigned_classes'
      },
      {
        resource: 'fees',
        actions: ['read', 'export'],
        scope: 'assigned_classes'
      },
      {
        resource: 'attendance',
        actions: ['read', 'write', 'export'],
        scope: 'assigned_classes'
      },
      {
        resource: 'reports',
        actions: ['read', 'export'],
        scope: 'assigned_classes'
      },
      {
        resource: 'whatsapp',
        actions: ['read', 'write'],
        scope: 'assigned_classes'
      },
      {
        resource: 'classes',
        actions: ['read'],
        scope: 'assigned_classes'
      }
    ]
  },
  clerk: {
    role: 'clerk',
    defaultPermissions: [
      {
        resource: 'students',
        actions: ['read', 'write', 'export'],
        scope: 'organization'
      },
      {
        resource: 'fees',
        actions: ['read', 'write', 'export'],
        scope: 'organization'
      },
      {
        resource: 'attendance',
        actions: ['read', 'export'],
        scope: 'organization'
      },
      {
        resource: 'reports',
        actions: ['read', 'export'],
        scope: 'organization'
      },
      {
        resource: 'whatsapp',
        actions: ['read', 'write'],
        scope: 'organization'
      },
      {
        resource: 'classes',
        actions: ['read'],
        scope: 'organization'
      }
    ]
  },
  school_admin: {
    role: 'school_admin',
    defaultPermissions: [
      {
        resource: 'students',
        actions: ['read', 'write', 'delete', 'export', 'import'],
        scope: 'organization'
      },
      {
        resource: 'fees',
        actions: ['read', 'write', 'delete', 'export', 'import'],
        scope: 'organization'
      },
      {
        resource: 'attendance',
        actions: ['read', 'write', 'delete', 'export', 'import'],
        scope: 'organization'
      },
      {
        resource: 'reports',
        actions: ['read', 'write', 'export'],
        scope: 'organization'
      },
      {
        resource: 'settings',
        actions: ['read', 'write'],
        scope: 'organization'
      },
      {
        resource: 'users',
        actions: ['read', 'write', 'delete'],
        scope: 'organization'
      },
      {
        resource: 'whatsapp',
        actions: ['read', 'write'],
        scope: 'organization'
      },
      {
        resource: 'classes',
        actions: ['read', 'write', 'delete', 'export', 'import'],
        scope: 'organization'
      },
      {
        resource: 'templates',
        actions: ['read', 'write', 'delete'],
        scope: 'organization'
      }
    ]
  }
};

/**
 * Create a new user account for an organization
 * Uses Firebase Admin SDK to avoid affecting current session
 */
const createOrganizationUser = async (req, res) => {
  const { 
    email, 
    password, 
    displayName, 
    role, 
    mobileNumber, 
    assignedClasses, 
    assignedModules 
  } = req.body;
  
  const { user } = req; // Current authenticated user (school_admin)

  try {
    // Validate creator permissions
    if (user.role !== 'school_admin' && user.role !== 'app_admin') {
      throw new AppError('Insufficient permissions to create users', 403);
    }

    // Validate required fields
    if (!email || !password || !displayName || !role) {
      throw new AppError('Email, password, display name, and role are required', 400);
    }

    // Validate role
    if (!['teacher', 'clerk', 'school_admin'].includes(role)) {
      throw new AppError('Invalid role. Must be teacher, clerk, or school_admin', 400);
    }

    // Validate teacher has assigned classes
    if (role === 'teacher' && (!assignedClasses || assignedClasses.length === 0)) {
      throw new AppError('Teachers must be assigned to at least one class', 400);
    }

    // Get organization details
    const db = getDb();
    const organizationId = user.organizationId;
    
    if (!organizationId) {
      throw new AppError('User must belong to an organization to create accounts', 400);
    }

    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    if (!orgDoc.exists) {
      throw new AppError('Organization not found', 404);
    }

    const organization = orgDoc.data();

    // Check if user already exists
    const auth = getAuthService();
    let existingUser;
    try {
      existingUser = await auth.getUserByEmail(email);
      if (existingUser) {
        throw new AppError('User with this email already exists', 409);
      }
    } catch (error) {
      // User doesn't exist, which is what we want
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create Firebase user account using Admin SDK
    const firebaseUser = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false
    });

    logger.info(`Firebase user created: ${firebaseUser.uid} (${email})`);

    // Get default permissions for role
    const roleTemplate = ROLE_PERMISSION_TEMPLATES[role];
    const defaultPermissions = roleTemplate ? roleTemplate.defaultPermissions : [];

    // Create extended user document in Firestore
    const userDocData = {
      // Core identity fields
      uid: firebaseUser.uid,
      email: email,
      displayName: displayName,
      photoURL: firebaseUser.photoURL || null,
      
      // Contact information
      mobileNumber: mobileNumber || '',
      
      // Location information
      city: '',
      province: '',
      country: 'Unknown',
      instituteName: organization.name || '',
      
      // Organization and role information
      organizationId: organizationId,
      role: role,
      parentUserId: user.uid || user.id, // Creator's ID
      permissions: defaultPermissions,
      assignedClasses: assignedClasses || [],
      assignedModules: assignedModules || [],
      
      // Status and preferences
      status: 'active',
      dateFormat: 'dd/mm/yyyy',
      currency: 'USD',
      isEmailVerified: false,
      planStatus: 'active',
      planExpiryDate: organization.subscription?.endDate || null,
      
      // Audit trail
      createdBy: user.uid || user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null
    };

    // Save user data to Firestore in BOTH collections for compatibility
    // Legacy apps expect 'users' collection, newer code expects 'userProfiles'
    await Promise.all([
      db.collection('users').doc(firebaseUser.uid).set(userDocData),
      db.collection('userProfiles').doc(firebaseUser.uid).set({
        uid: userDocData.uid,
        organizationId: userDocData.organizationId,
        role: userDocData.role,
        parentUserId: userDocData.parentUserId,
        permissions: userDocData.permissions,
        assignedClasses: userDocData.assignedClasses,
        assignedModules: userDocData.assignedModules,
        status: userDocData.status,
        createdAt: userDocData.createdAt,
        updatedAt: userDocData.updatedAt,
        email: userDocData.email,
        displayName: userDocData.displayName
      })
    ]);

    logger.info(`User document created in both 'users' and 'userProfiles' collections: ${firebaseUser.uid}`);

    // Send email verification (optional)
    try {
      await auth.generateEmailVerificationLink(email);
      logger.info(`Email verification sent to: ${email}`);
    } catch (error) {
      logger.warn(`Failed to send email verification: ${error.message}`);
      // Don't fail the user creation if email verification fails
    }

    // Return success response (without password)
    const responseUser = {
      uid: firebaseUser.uid,
      email: userDocData.email,
      displayName: userDocData.displayName,
      role: userDocData.role,
      organizationId: userDocData.organizationId,
      assignedClasses: userDocData.assignedClasses,
      assignedModules: userDocData.assignedModules,
      status: userDocData.status,
      createdAt: userDocData.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User account created successfully',
      data: {
        user: responseUser
      }
    });

  } catch (error) {
    logger.error('Error creating organization user:', error);
    
    // Clean up Firebase user if Firestore save failed
    if (error.firebaseUser) {
      try {
        await getAuthService().deleteUser(error.firebaseUser.uid);
        logger.info(`Cleaned up Firebase user: ${error.firebaseUser.uid}`);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup Firebase user: ${cleanupError.message}`);
      }
    }
    
    throw error;
  }
};

/**
 * Get organization users
 */
const getOrganizationUsers = async (req, res) => {
  const { user } = req;

  try {
    // Validate permissions
    if (user.role !== 'school_admin' && user.role !== 'app_admin') {
      throw new AppError('Insufficient permissions to view organization users', 403);
    }

    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new AppError('User must belong to an organization', 400);
    }

    const db = getDb();
    const usersQuery = db.collection('users').where('organizationId', '==', organizationId);
    const snapshot = await usersQuery.get();

    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        uid: doc.id,
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        status: userData.status,
        assignedClasses: userData.assignedClasses || [],
        assignedModules: userData.assignedModules || [],
        createdAt: userData.createdAt,
        lastLoginAt: userData.lastLoginAt
      });
    });

    logger.info(`Retrieved ${users.length} users for organization: ${organizationId}`);

    res.json({
      success: true,
      data: {
        users,
        organizationId
      }
    });

  } catch (error) {
    logger.error('Error getting organization users:', error);
    throw error;
  }
};

/**
 * Update user role
 */
const updateUserRole = async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const { user } = req;

  try {
    // Validate permissions
    if (user.role !== 'school_admin' && user.role !== 'app_admin') {
      throw new AppError('Insufficient permissions to update user roles', 403);
    }

    // Validate role
    if (!['teacher', 'clerk', 'school_admin'].includes(role)) {
      throw new AppError('Invalid role. Must be teacher, clerk, or school_admin', 400);
    }

    const db = getDb();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new AppError('User not found', 404);
    }

    const userData = userDoc.data();
    
    // Check if user belongs to same organization
    if (userData.organizationId !== user.organizationId) {
      throw new AppError('Cannot update users from different organizations', 403);
    }

    // Get new role permissions
    const roleTemplate = ROLE_PERMISSION_TEMPLATES[role];
    const newPermissions = roleTemplate ? roleTemplate.defaultPermissions : [];

    // Update user role and permissions
    const updateData = {
      role: role,
      permissions: newPermissions,
      roleChangedBy: user.uid || user.id,
      roleChangedAt: new Date(),
      updatedAt: new Date()
    };

    // Clear role-specific data when changing roles
    if (role !== 'teacher') {
      updateData.assignedClasses = [];
    }
    if (role !== 'clerk') {
      updateData.assignedModules = [];
    }

    await db.collection('users').doc(userId).update(updateData);

    logger.info(`User role updated: ${userId} -> ${role}`);

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        userId,
        newRole: role
      }
    });

  } catch (error) {
    logger.error('Error updating user role:', error);
    throw error;
  }
};

module.exports = {
  createOrganizationUser,
  getOrganizationUsers,
  updateUserRole
};
