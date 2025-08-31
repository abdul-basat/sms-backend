/**
 * Organization Controller
 * Handles all organization-related business logic
 */

const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// In-memory storage for testing (replace with Firebase in production)
const organizations = [];

// Helper function to get Firestore instance (with fallback for testing)
const getDb = () => {
  try {
    const { getFirestore } = require('firebase-admin/firestore');
    return getFirestore();
  } catch (error) {
    // Return null if Firebase is not initialized (testing environment)
    return null;
  }
};

// Helper function to get Auth instance (with fallback for testing)
const getAuthService = () => {
  try {
    const { getAuth } = require('firebase-admin/auth');
    return getAuth();
  } catch (error) {
    // Return null if Firebase is not initialized (testing environment)
    return null;
  }
};

/**
 * Get all organizations or user's organizations
 */
const getOrganizations = async (req, res) => {
  const { user } = req;
  const { page = 1, limit = 10, search, type } = req.query;

  try {
    const db = getDb();
    
    // Use in-memory storage for testing, Firebase for production
    if (!db) {
      // Testing environment - use in-memory storage
      let filteredOrgs = [...organizations];
      
      // Apply search filter
      if (search) {
        filteredOrgs = filteredOrgs.filter(org => 
          org.name.toLowerCase().includes(search.toLowerCase())
        );
      }
      
      // Apply type filter
      if (type) {
        filteredOrgs = filteredOrgs.filter(org => org.type === type);
      }
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedOrgs = filteredOrgs.slice(startIndex, endIndex);
      
      return res.json({
        success: true,
        data: {
          organizations: paginatedOrgs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: filteredOrgs.length,
            pages: Math.ceil(filteredOrgs.length / limit),
          },
        },
      });
    }

    // Production environment - use Firebase
    let query = db.collection('organizations');

    // App admins can see all organizations, others only their own
    if (user.role !== 'app_admin') {
      if (!user.organizationId) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0,
          },
        });
      }
      query = query.where('id', '==', user.organizationId);
    }

    // Add filters
    if (type) {
      query = query.where('type', '==', type);
    }

    // Add search (simplified - in production, use search service)
    if (search) {
      query = query.where('name', '>=', search)
                   .where('name', '<=', search + '\uf8ff');
    }

    // Execute query
    const snapshot = await query.get();
    const orgResults = [];

    snapshot.forEach(doc => {
      orgResults.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Simple pagination (in production, use more efficient pagination)
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrgs = orgResults.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        organizations: paginatedOrgs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: orgResults.length,
          pages: Math.ceil(orgResults.length / limit),
        },
      },
    });

  } catch (error) {
    logger.error('Error fetching organizations:', error);
    throw new AppError('Failed to fetch organizations', 500);
  }
};

/**
 * Create a new organization
 */
const createOrganization = async (req, res) => {
  const { user } = req;
  const { name, type, settings = {}, description, email, phone, address } = req.body;

  try {
    // Check if user can create organizations
    if (user.role !== 'app_admin' && user.organizationId) {
      throw new AppError('User already belongs to an organization', 400);
    }

    const db = getDb();
    const organizationId = uuidv4();
    const now = new Date();

    // Default settings
    const defaultSettings = {
      currency: 'USD',
      timezone: 'UTC',
      allowSubUsers: true,
      maxSubUsers: 10,
      enableMultipleWhatsApp: false,
      whatsAppSettings: {
        maxSessions: 1,
        autoAssignSessions: true,
      },
      ...settings,
    };

    // Default subscription (trial)
    const subscription = {
      planId: 'trial',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
      maxUsers: 5,
      maxWhatsAppSessions: 1,
    };

    const organization = {
      id: organizationId,
      name: name.trim(),
      type,
      email: email || '',
      phone: phone || '',
      address: address || '',
      ownerId: user.id || user.uid,
      description: description || '',
      settings: defaultSettings,
      subscription,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      stats: {
        totalUsers: 1,
        totalStudents: 0,
        totalRevenue: 0,
        activeWhatsAppSessions: 0,
      },
    };

    // Use in-memory storage for testing, Firebase for production
    if (!db) {
      // Testing environment - use in-memory storage
      // Check for duplicate name
      const existingOrg = organizations.find(org => 
        org.name.toLowerCase() === name.toLowerCase().trim()
      );
      
      if (existingOrg) {
        throw new AppError('Organization with this name already exists', 409);
      }
      
      organizations.push(organization);
      
      // Update user's organizationId in test environment
      const { users } = require('../models/dataStore');
      const currentUser = users.get(user.id);
      if (currentUser) {
        currentUser.organizationId = organizationId;
        currentUser.role = user.role === 'app_admin' ? 'app_admin' : 'school_admin';
        users.set(user.id, currentUser);
      }
      
      logger.info(`Organization created: ${name}`, { organizationId });
      
      return res.status(201).json({
        success: true,
        data: {
          organization,
        },
        message: 'Organization created successfully',
      });
    }

    // Production environment - use Firebase
    // Check if organization name already exists
    const existingOrg = await db.collection('organizations')
      .where('name', '==', name.trim())
      .get();

    if (!existingOrg.empty) {
      throw new AppError('Organization with this name already exists', 409);
    }

    // Create organization in Firestore
    await db.collection('organizations').doc(organizationId).set(organization);

    // Update user's custom claims to include organization
    await getAuthService().setCustomUserClaims(user.uid, {
      organizationId,
      role: user.role === 'app_admin' ? 'app_admin' : 'school_admin',
      permissions: getDefaultPermissions('school_admin'),
    });

    // In test environment, also update the shared data store
    if (process.env.NODE_ENV === 'test') {
      const { users } = require('../models/dataStore');
      const currentUser = users.get(user.id);
      if (currentUser) {
        currentUser.organizationId = organizationId;
        currentUser.role = user.role === 'app_admin' ? 'app_admin' : 'school_admin';
        users.set(user.id, currentUser);
      }
    }

    // Create organization-specific collections
    await createOrganizationCollections(organizationId);

    logger.info(`Organization created: ${organizationId} by ${user.email}`);

    res.status(201).json({
      success: true,
      data: organization,
      message: 'Organization created successfully',
    });

  } catch (error) {
    logger.error('Error creating organization:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to create organization', 500);
  }
};

/**
 * Get organization by ID
 */
const getOrganizationById = async (req, res) => {
  const { id } = req.params;

  try {
    const db = getDb();
    
    // Use in-memory storage for testing, Firebase for production
    if (!db) {
      // Testing environment - use in-memory storage
      const organization = organizations.find(org => org.id === id);
      
      if (!organization) {
        throw new AppError('Organization not found', 404);
      }
      
      return res.json({
        success: true,
        data: {
          organization,
        },
      });
    }

    // Production environment - use Firebase
    const doc = await db.collection('organizations').doc(id).get();

    if (!doc.exists) {
      throw new AppError('Organization not found', 404);
    }

    const organization = {
      id: doc.id,
      ...doc.data(),
    };

    res.json({
      success: true,
      data: {
        organization,
      },
    });

  } catch (error) {
    logger.error('Error fetching organization:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch organization', 500);
  }
};

/**
 * Update organization
 */
const updateOrganization = async (req, res) => {
  const { id } = req.params;
  const { user } = req;
  const updates = req.body;

  try {
    const db = getDb();
    
    // Use in-memory storage for testing, Firebase for production
    if (!db) {
      // Testing environment - use in-memory storage
      const orgIndex = organizations.findIndex(org => org.id === id);
      
      if (orgIndex === -1) {
        throw new AppError('Organization not found', 404);
      }
      
      const organization = organizations[orgIndex];
      
      // Check ownership for non-admin users
      if (user.role !== 'app_admin' && organization.ownerId !== (user.id || user.uid)) {
        throw new AppError('Insufficient permissions to update this organization', 403);
      }
      
      // Prepare update data
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };
      
      // Remove read-only fields
      delete updateData.id;
      delete updateData.ownerId;
      delete updateData.createdAt;
      delete updateData.stats;
      
      // Update organization
      organizations[orgIndex] = { ...organization, ...updateData };
      
      return res.json({
        success: true,
        data: {
          organization: organizations[orgIndex]
        },
        message: 'Organization updated successfully',
      });
    }

    // Production environment - use Firebase
    const organizationRef = db.collection('organizations').doc(id);
    const doc = await organizationRef.get();

    if (!doc.exists) {
      throw new AppError('Organization not found', 404);
    }

    const organization = doc.data();

    // Check ownership for non-admin users
    if (user.role !== 'app_admin' && organization.ownerId !== user.uid) {
      throw new AppError('Insufficient permissions to update this organization', 403);
    }

    // Prepare update data
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    // Remove read-only fields
    delete updateData.id;
    delete updateData.ownerId;
    delete updateData.createdAt;
    delete updateData.stats;

    await organizationRef.update(updateData);

    const updatedDoc = await organizationRef.get();
    const updatedOrganization = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    };

    logger.info(`Organization updated: ${id} by ${user.email}`);

    res.json({
      success: true,
      data: {
        organization: updatedOrganization
      },
      message: 'Organization updated successfully',
    });

  } catch (error) {
    logger.error('Error updating organization:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update organization', 500);
  }
};

/**
 * Delete organization
 */
const deleteOrganization = async (req, res) => {
  const { id } = req.params;
  const { user } = req;

  try {
    const db = getDb();
    
    // Use in-memory storage for testing, Firebase for production
    if (!db) {
      // Testing environment - use in-memory storage
      const orgIndex = organizations.findIndex(org => org.id === id);
      
      if (orgIndex === -1) {
        throw new AppError('Organization not found', 404);
      }
      
      // Check permissions - app admin or organization owner can delete
      if (user.role !== 'app_admin' && organizations[orgIndex].ownerId !== user.id) {
        throw new AppError('Insufficient permissions to delete organization', 403);
      }
      
      // Remove organization from in-memory storage
      organizations.splice(orgIndex, 1);
      
      logger.info(`Organization deleted: ${id} by ${user.email || user.id}`);
      
      return res.json({
        success: true,
        message: 'Organization deleted successfully',
      });
    }

    // Production environment - use Firebase
    const organizationRef = db.collection('organizations').doc(id);
    const doc = await organizationRef.get();

    if (!doc.exists) {
      throw new AppError('Organization not found', 404);
    }

    // Only app admins can delete organizations
    if (user.role !== 'app_admin') {
      throw new AppError('Insufficient permissions to delete organization', 403);
    }

    // TODO: Implement soft delete instead of hard delete
    // TODO: Archive organization data
    // TODO: Notify users

    await organizationRef.delete();

    logger.info(`Organization deleted: ${id} by ${user.email}`);

    res.json({
      success: true,
      message: 'Organization deleted successfully',
    });

  } catch (error) {
    logger.error('Error deleting organization:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to delete organization', 500);
  }
};

/**
 * Get organization statistics
 */
const getOrganizationStats = async (req, res) => {
  const { id } = req.params;

  try {
    const db = getDb();
    // Get organization
    const orgDoc = await db.collection('organizations').doc(id).get();
    if (!orgDoc.exists) {
      throw new AppError('Organization not found', 404);
    }

    // Get statistics from various collections
    const [studentsSnapshot, usersSnapshot] = await Promise.all([
      db.collection('organizationData').doc(id).collection('students').get(),
      db.collection('users').where('organizationId', '==', id).get(),
    ]);

    const stats = {
      totalStudents: studentsSnapshot.size,
      totalUsers: usersSnapshot.size,
      totalRevenue: 0, // Calculate from fee records
      activeWhatsAppSessions: 0, // Get from WhatsApp service
      lastUpdated: new Date().toISOString(),
    };

    // Update organization stats
    await db.collection('organizations').doc(id).update({
      'stats': stats,
      'updatedAt': new Date(),
    });

    res.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    logger.error('Error fetching organization stats:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch organization statistics', 500);
  }
};

/**
 * Helper function to create organization-specific collections
 */
const createOrganizationCollections = async (organizationId) => {
  try {
    const db = getDb();
    const orgDataRef = db.collection('organizationData').doc(organizationId);
    
    // Create initial document
    await orgDataRef.set({
      initialized: true,
      createdAt: new Date(),
    });

    // Create subcollections with initial documents
    await Promise.all([
      orgDataRef.collection('students').doc('_init').set({ initialized: true }),
      orgDataRef.collection('feeRecords').doc('_init').set({ initialized: true }),
      orgDataRef.collection('attendance').doc('_init').set({ initialized: true }),
      orgDataRef.collection('classes').doc('_init').set({ initialized: true }),
    ]);

    logger.info(`Organization collections created for: ${organizationId}`);
  } catch (error) {
    logger.error('Error creating organization collections:', error);
    throw error;
  }
};

/**
 * Get default permissions for role
 */
const getDefaultPermissions = (role) => {
  const permissions = {
    app_admin: ['*'],
    school_admin: [
      'read:organization', 'write:organization',
      'read:users', 'write:users',
      'read:students', 'write:students',
      'read:fees', 'write:fees',
      'read:attendance', 'write:attendance',
      'read:stats', 'read:subscription', 'write:subscription',
    ],
    teacher: [
      'read:organization',
      'read:students', 'write:students',
      'read:attendance', 'write:attendance',
      'read:fees',
    ],
    clerk: [
      'read:organization',
      'read:students',
      'read:fees', 'write:fees',
    ],
    user: [
      'read:organization',
      'read:students',
    ],
  };

  return permissions[role] || permissions.user;
};

// Placeholder implementations for additional controller methods
const getOrganizationUsers = async (req, res) => {
  // TODO: Implement user listing for organization
  res.json({ success: true, data: [], message: 'Not implemented yet' });
};

const inviteUser = async (req, res) => {
  // TODO: Implement user invitation
  res.json({ success: true, message: 'User invitation not implemented yet' });
};

const updateUserRole = async (req, res) => {
  // TODO: Implement user role update
  res.json({ success: true, message: 'User role update not implemented yet' });
};

const removeUser = async (req, res) => {
  // TODO: Implement user removal
  res.json({ success: true, message: 'User removal not implemented yet' });
};

const getSubscription = async (req, res) => {
  // TODO: Implement subscription details
  res.json({ success: true, data: {}, message: 'Subscription details not implemented yet' });
};

const updateSubscription = async (req, res) => {
  // TODO: Implement subscription update
  res.json({ success: true, message: 'Subscription update not implemented yet' });
};

const migrateData = async (req, res) => {
  // TODO: Implement data migration
  res.json({ success: true, message: 'Data migration not implemented yet' });
};

module.exports = {
  getOrganizations,
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  getOrganizationStats,
  getOrganizationUsers,
  inviteUser,
  updateUserRole,
  removeUser,
  getSubscription,
  updateSubscription,
  migrateData,
};
