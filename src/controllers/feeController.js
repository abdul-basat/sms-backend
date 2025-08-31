/**
 * Fee Controller
 * Handles fee management business logic
 */

const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { 
  fees, 
  getFeeById: getFeeByIdFromStore, 
  getAllFees, 
  addFee, 
  updateFee: updateFeeInStore, 
  deleteFee: deleteFeeFromStore,
  getFeesByOrganization,
  getFeesByStudent,
  getFeesByOrganizationAndType,
  getFeesByOrganizationAndMonth,
  getFeeByStudentAndMonth,
  getStudentById: getStudentByIdFromStore
} = require('../models/dataStore');

// Helper function to generate fee record ID
const generateFeeId = () => {
  return `fee_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to check if user can access fee data
const canAccessFee = (requestingUser, fee) => {
  // Admin can access any fee
  if (requestingUser.role === 'app_admin' || requestingUser.role === 'admin') {
    return true;
  }
  
  // School admins and teachers can access fees in their organization
  if ((requestingUser.role === 'school_admin' || requestingUser.role === 'teacher') && requestingUser.organizationId) {
    return fee && fee.organizationId === requestingUser.organizationId;
  }
  
  return false;
};

// Helper function to check if user can manage fees
const canManageFees = (user) => {
  return user.role === 'app_admin' || user.role === 'admin' || user.role === 'school_admin';
};

// Helper function to validate month format (YYYY-MM)
const isValidMonth = (month) => {
  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(month)) return false;
  
  const [year, monthNum] = month.split('-').map(Number);
  return year >= 2020 && year <= 2030 && monthNum >= 1 && monthNum <= 12;
};

/**
 * Get fees for organization with pagination, search, and filtering
 */
const getFees = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      month = '',
      studentId = '',
      type = ''
    } = req.query;

    const offset = (page - 1) * limit;
    const requestingUser = req.user;

    // Get fees based on user permissions
    let allFees = [];
    if (requestingUser.role === 'app_admin' || requestingUser.role === 'admin') {
      allFees = getAllFees();
    } else if (requestingUser.organizationId) {
      allFees = getFeesByOrganization(requestingUser.organizationId);
    } else {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to access fees',
        code: 403
      });
    }

    // Apply filters
    let filteredFees = allFees;

    if (status) {
      filteredFees = filteredFees.filter(fee => fee.status === status);
    }

    if (month) {
      filteredFees = filteredFees.filter(fee => fee.month === month);
    }

    if (studentId) {
      filteredFees = filteredFees.filter(fee => fee.studentId === studentId);
    }

    if (type) {
      filteredFees = filteredFees.filter(fee => fee.type === type);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredFees = filteredFees.filter(fee => {
        const student = getStudentByIdFromStore(fee.studentId);
        const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';
        return (
          fee.type.toLowerCase().includes(searchLower) ||
          fee.month.includes(searchLower) ||
          studentName.includes(searchLower) ||
          fee.status.toLowerCase().includes(searchLower)
        );
      });
    }

    // Pagination
    const total = filteredFees.length;
    const paginatedFees = filteredFees.slice(offset, offset + parseInt(limit));

    // Add student information to fees
    const feesWithStudentInfo = paginatedFees.map(fee => {
      const student = getStudentByIdFromStore(fee.studentId);
      return {
        ...fee,
        student: student ? {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          rollNumber: student.rollNumber
        } : null
      };
    });

    logger.info(`Fees retrieved: ${paginatedFees.length} of ${total}`, {
      userId: requestingUser.id,
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      status,
      month,
      studentId,
      type
    });

    res.json({
      success: true,
      data: {
        fees: feesWithStudentInfo,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      },
      message: 'Fees retrieved successfully'
    });
  } catch (error) {
    logger.error('Error getting fees:', error);
    throw new AppError('Failed to retrieve fees', 500);
  }
};

/**
 * Get fee by ID
 */
const getFeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = req.user;

    const fee = getFeeByIdFromStore(id);
    
    if (!fee) {
      throw new AppError('Fee not found', 404);
    }

    // Check permissions
    if (!canAccessFee(requestingUser, fee)) {
      throw new AppError('Insufficient permissions to access this fee', 403);
    }

    // Add student information
    const student = getStudentByIdFromStore(fee.studentId);
    const feeWithStudentInfo = {
      ...fee,
      student: student ? {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber,
        class: student.academicInfo?.class,
        section: student.academicInfo?.section
      } : null
    };

    logger.info(`Fee retrieved: ${fee.id}`, {
      userId: requestingUser.id,
      feeId: fee.id
    });

    res.json({
      success: true,
      data: { fee: feeWithStudentInfo },
      message: 'Fee retrieved successfully'
    });
  } catch (error) {
    if (error instanceof AppError) {
      logger.error('Error getting fee by ID:', error.message, {
        statusCode: error.statusCode,
        code: error.code,
        isOperational: error.isOperational,
        stack: error.stack
      });
      throw error;
    }
    logger.error('Error getting fee by ID:', error);
    throw new AppError('Failed to retrieve fee', 500);
  }
};

/**
 * Create new fee record
 */
const createFee = async (req, res) => {
  try {
    const requestingUser = req.user;

    // Check permissions
    if (!canManageFees(requestingUser)) {
      throw new AppError('Insufficient permissions to create fees', 403);
    }

    const {
      studentId,
      type,
      amount,
      month,
      dueDate,
      description = '',
      category = 'tuition'
    } = req.body;

    // Validate student exists and is in the same organization
    const student = getStudentByIdFromStore(studentId);
    if (!student) {
      throw new AppError('Student not found', 404);
    }

    // For non-admin users, ensure student is in their organization
    if (requestingUser.role !== 'app_admin' && requestingUser.role !== 'admin') {
      if (student.organizationId !== requestingUser.organizationId) {
        throw new AppError('Cannot create fee for student in different organization', 403);
      }
    }

    // Validate month format
    if (!isValidMonth(month)) {
      throw new AppError('Invalid month format. Use YYYY-MM', 400);
    }

    // Check for duplicate fee record for same student and month
    const existingFee = getFeeByStudentAndMonth(studentId, month);
    if (existingFee) {
      throw new AppError('Fee record already exists for this student and month', 409);
    }

    // Create fee record
    const feeId = generateFeeId();
    const feeData = {
      id: feeId,
      organizationId: student.organizationId,
      studentId,
      type,
      amount: parseFloat(amount),
      month,
      dueDate: new Date(dueDate).toISOString(),
      paidDate: null,
      status: 'pending',
      paidAmount: 0,
      remainingAmount: parseFloat(amount),
      description,
      category,
      paymentMethod: null,
      transactionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newFee = addFee(feeData);

    logger.info('Fee created:', newFee.id, {
      feeId: newFee.id,
      userId: requestingUser.id,
      studentId,
      amount: parseFloat(amount),
      month
    });

    // Add student info for response
    const feeWithStudentInfo = {
      ...newFee,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber
      }
    };

    res.status(201).json({
      success: true,
      data: { fee: feeWithStudentInfo },
      message: 'Fee created successfully'
    });
  } catch (error) {
    if (error instanceof AppError) {
      logger.error('Error creating fee:', error.message, {
        statusCode: error.statusCode,
        code: error.code,
        isOperational: error.isOperational,
        stack: error.stack
      });
      throw error;
    }
    logger.error('Error creating fee:', error);
    throw new AppError('Failed to create fee', 500);
  }
};

/**
 * Update fee record
 */
const updateFee = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = req.user;

    const fee = getFeeByIdFromStore(id);
    
    if (!fee) {
      throw new AppError('Fee not found', 404);
    }

    // Check permissions
    if (!canAccessFee(requestingUser, fee) || !canManageFees(requestingUser)) {
      throw new AppError('Insufficient permissions to update this fee', 403);
    }

    const {
      amount,
      dueDate,
      status,
      paidAmount,
      paymentMethod,
      transactionId,
      description,
      paidDate
    } = req.body;

    const updateData = {};

    // Only allow certain fields to be updated
    if (amount !== undefined) {
      updateData.amount = parseFloat(amount);
      updateData.remainingAmount = parseFloat(amount) - (fee.paidAmount || 0);
    }

    if (dueDate !== undefined) {
      updateData.dueDate = new Date(dueDate).toISOString();
    }

    if (status !== undefined) {
      updateData.status = status;
      
      // If marking as paid, set paidDate
      if (status === 'paid' && !fee.paidDate) {
        updateData.paidDate = new Date().toISOString();
        updateData.paidAmount = fee.amount;
        updateData.remainingAmount = 0;
      }
    }

    if (paidAmount !== undefined) {
      const newPaidAmount = parseFloat(paidAmount);
      updateData.paidAmount = newPaidAmount;
      updateData.remainingAmount = fee.amount - newPaidAmount;
      
      // Update status based on payment
      if (newPaidAmount === 0) {
        updateData.status = 'pending';
        updateData.paidDate = null;
      } else if (newPaidAmount >= fee.amount) {
        updateData.status = 'paid';
        updateData.paidDate = updateData.paidDate || new Date().toISOString();
      } else {
        updateData.status = 'partial';
      }
    }

    if (paymentMethod !== undefined) {
      updateData.paymentMethod = paymentMethod;
    }

    if (transactionId !== undefined) {
      updateData.transactionId = transactionId;
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    if (paidDate !== undefined) {
      updateData.paidDate = paidDate ? new Date(paidDate).toISOString() : null;
    }

    const updatedFee = updateFeeInStore(id, updateData);

    logger.info('Fee updated:', updatedFee.id, {
      feeId: updatedFee.id,
      userId: requestingUser.id,
      updatedFields: Object.keys(updateData)
    });

    // Add student info for response
    const student = getStudentByIdFromStore(updatedFee.studentId);
    const feeWithStudentInfo = {
      ...updatedFee,
      student: student ? {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber
      } : null
    };

    res.json({
      success: true,
      data: { fee: feeWithStudentInfo },
      message: 'Fee updated successfully'
    });
  } catch (error) {
    if (error instanceof AppError) {
      logger.error('Error updating fee:', error.message, {
        statusCode: error.statusCode,
        code: error.code,
        isOperational: error.isOperational,
        stack: error.stack
      });
      throw error;
    }
    logger.error('Error updating fee:', error);
    throw new AppError('Failed to update fee', 500);
  }
};

/**
 * Delete fee record
 */
const deleteFee = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = req.user;

    const fee = getFeeByIdFromStore(id);
    
    if (!fee) {
      throw new AppError('Fee not found', 404);
    }

    // Check permissions
    if (!canAccessFee(requestingUser, fee) || !canManageFees(requestingUser)) {
      throw new AppError('Insufficient permissions to delete this fee', 403);
    }

    // Prevent deletion of paid fees
    if (fee.status === 'paid' || fee.paidAmount > 0) {
      throw new AppError('Cannot delete fee record with payments', 400);
    }

    const deletedFee = deleteFeeFromStore(id);

    logger.info('Fee deleted:', deletedFee.id, {
      feeId: deletedFee.id,
      userId: requestingUser.id
    });

    res.json({
      success: true,
      message: 'Fee deleted successfully'
    });
  } catch (error) {
    if (error instanceof AppError) {
      logger.error('Error deleting fee:', error.message, {
        statusCode: error.statusCode,
        code: error.code,
        isOperational: error.isOperational,
        stack: error.stack
      });
      throw error;
    }
    logger.error('Error deleting fee:', error);
    throw new AppError('Failed to delete fee', 500);
  }
};

module.exports = {
  getFees,
  getFeeById,
  createFee,
  updateFee,
  deleteFee
};
