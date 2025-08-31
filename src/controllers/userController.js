/**
 * User Controller
 * Handles user management business logic
 */

const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { users, getUserById, getAllUsers, addUser, updateUser: updateUserInStore, deleteUser: deleteUserFromStore } = require('../models/dataStore');

// Helper function to generate user ID
const generateUserId = () => {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to check if user can access another user's data
const canAccessUser = (requestingUser, targetUserId) => {
  // Admin can access any user (both 'admin' and 'app_admin' roles)
  if (requestingUser.role === 'app_admin' || requestingUser.role === 'admin') {
    return true;
  }
  
  // Users can access their own profile
  if (requestingUser.id === targetUserId) {
    return true;
  }
  
  // School admins and teachers can access users in their organization
  if ((requestingUser.role === 'school_admin' || requestingUser.role === 'teacher') && requestingUser.organizationId) {
    const targetUser = getUserById(targetUserId);
    return targetUser && targetUser.organizationId === requestingUser.organizationId;
  }
  
  return false;
};

// Helper function to check if user is admin
const isAdmin = (user) => {
  return user.role === 'app_admin' || user.role === 'admin';
};

// Helper function to filter sensitive fields based on user role
const filterUserFields = (user, requestingUser) => {
  const publicFields = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  // Admin can see all fields except password
  if (isAdmin(requestingUser)) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Users can see their own additional fields
  if (requestingUser.id === user.id) {
    return {
      ...publicFields,
      phone: user.phone,
    };
  }

  return publicFields;
};

/**
 * Get all users with pagination, search, and filtering
 */
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = '',
    } = req.query;

    // Check if user has permission to list users
    if (!isAdmin(req.user) && req.user.role !== 'school_admin' && req.user.role !== 'teacher') {
      throw new AppError('admin access required', 403);
    }

    let filteredUsers = getAllUsers();

    // Filter by organization for non-admin users
    if (!isAdmin(req.user) && req.user.organizationId) {
      filteredUsers = filteredUsers.filter(user => 
        user.organizationId === req.user.organizationId
      );
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = filteredUsers.filter(user => 
        user.firstName?.toLowerCase().includes(searchLower) ||
        user.lastName?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower)
      );
    }

    // Apply role filter
    if (role) {
      filteredUsers = filteredUsers.filter(user => user.role === role);
    }

    // Calculate pagination
    const totalUsers = filteredUsers.length;
    const totalPages = Math.ceil(totalUsers / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);

    // Get paginated results
    const paginatedUsers = filteredUsers
      .slice(startIndex, endIndex)
      .map(user => filterUserFields(user, req.user));

    logger.info(`Users retrieved: ${paginatedUsers.length} of ${totalUsers}`, {
      userId: req.user.id,
      page,
      limit,
      search,
      role,
    });

    res.json({
      success: true,
      data: {
        users: paginatedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalUsers,
          pages: totalPages,
        },
      },
      message: 'Users retrieved successfully',
    });
  } catch (error) {
    logger.error('Error getting users:', error);
    throw error;
  }
};

/**
 * Get user by ID
 */
const getUserByIdEndpoint = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = getUserById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check permissions
    if (!canAccessUser(req.user, id)) {
      throw new AppError('access denied', 403);
    }

    const filteredUser = filterUserFields(user, req.user);

    logger.info(`User retrieved: ${user.email}`, {
      userId: req.user.id,
      targetUserId: id,
    });

    res.json({
      success: true,
      data: { user: filteredUser },
      message: 'User retrieved successfully',
    });
  } catch (error) {
    logger.error('Error getting user by ID:', error);
    throw error;
  }
};

/**
 * Update user profile
 */
const updateUserEndpoint = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const user = getUserById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check permissions
    if (!canAccessUser(req.user, id)) {
      throw new AppError('access denied', 403);
    }

    // Restrict what regular users can update
    const allowedFields = ['firstName', 'lastName', 'phone'];
    if (!isAdmin(req.user) && req.user.id === id) {
      // Users can only update their own profile with limited fields
      const restrictedUpdate = {};
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          restrictedUpdate[field] = updateData[field];
        }
      });
      
      // Users cannot change their role or email
      if (updateData.role && updateData.role !== user.role) {
        throw new AppError('cannot modify role', 403);
      }
      
      Object.assign(updateData, restrictedUpdate);
    }

    // Check email uniqueness if email is being updated
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = getAllUsers().find(u => 
        u.email === updateData.email && u.id !== id
      );
      if (existingUser) {
        throw new AppError('Email already exists', 409);
      }
    }

    // Update user
    const updatedUser = updateUserInStore(id, updateData);

    const filteredUser = filterUserFields(updatedUser, req.user);

    logger.info(`User updated: ${updatedUser.email}`, {
      userId: req.user.id,
      targetUserId: id,
      updatedFields: Object.keys(updateData),
    });

    res.json({
      success: true,
      data: { user: filteredUser },
      message: 'User updated successfully',
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    throw error;
  }
};

/**
 * Delete user
 */
const deleteUserEndpoint = async (req, res) => {
  try {
    const { id } = req.params;

    const user = getUserById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check user permission and specific delete rules
    if (!isAdmin(req.user)) {
      // If user is trying to delete themselves
      if (req.user.id === id) {
        throw new AppError('cannot delete yourself', 403);
      }
      // If user is trying to delete others
      throw new AppError('admin access required', 403);
    }

    // Even admins cannot delete themselves (prevent lockout)
    if (req.user.id === id) {
      throw new AppError('cannot delete yourself', 403);
    }

    deleteUserFromStore(id);

    logger.info(`User deleted: ${user.email}`, {
      userId: req.user.id,
      deletedUserId: id,
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    throw error;
  }
};

/**
 * Update user role
 */
const updateUserRoleEndpoint = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const user = getUserById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Only admins can change roles
    if (!isAdmin(req.user)) {
      throw new AppError('Only administrators can update user roles', 403);
    }

    // Update user role
    const updatedUser = updateUserInStore(id, { role });

    const filteredUser = filterUserFields(updatedUser, req.user);

    logger.info(`User role updated: ${updatedUser.email} -> ${role}`, {
      userId: req.user.id,
      targetUserId: id,
      newRole: role,
      oldRole: user.role,
    });

    res.json({
      success: true,
      data: { user: filteredUser },
      message: 'User role updated successfully',
    });
  } catch (error) {
    logger.error('Error updating user role:', error);
    throw error;
  }
};

// Export functions for testing
const testHelpers = {
  addUser: (userData) => {
    const id = generateUserId();
    const user = {
      id,
      ...userData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return addUser(user);
  },
  clearUsers: () => {
    users.clear();
  },
  getUser: (id) => {
    return getUserById(id);
  },
  getAllUsers: () => {
    return getAllUsers();
  },
};

module.exports = {
  getUsers,
  getUserById: getUserByIdEndpoint,
  updateUser: updateUserEndpoint,
  deleteUser: deleteUserEndpoint,
  updateUserRole: updateUserRoleEndpoint,
  testHelpers,
};
