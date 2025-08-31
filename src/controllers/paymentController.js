/**
 * Payment Controller (Phase 5)
 * Handles payment transaction and installment plan management
 */

const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { 
  paymentTransactions,
  installmentPlans,
  getPaymentTransactionById: getPaymentTransactionByIdFromStore,
  getAllPaymentTransactions,
  addPaymentTransaction,
  updatePaymentTransaction,
  deletePaymentTransaction,
  getPaymentTransactionsByOrganization,
  getPaymentTransactionsByStudent,
  getPaymentTransactionsByFee,
  getInstallmentPlanById,
  getAllInstallmentPlans,
  addInstallmentPlan,
  updateInstallmentPlan,
  deleteInstallmentPlan,
  getInstallmentPlansByOrganization,
  getInstallmentPlansByStudent,
  getInstallmentPlansByFee,
  getFeeById: getFeeByIdFromStore,
  updateFee: updateFeeInStore,
  getStudentById: getStudentByIdFromStore
} = require('../models/dataStore');

// Helper function to generate payment transaction ID
const generatePaymentTransactionId = () => {
  return `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to generate installment plan ID
const generateInstallmentPlanId = () => {
  return `installment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to check if user can access payment data
const canAccessPaymentData = (requestingUser, organizationId) => {
  // Admin can access any payment data
  if (requestingUser.role === 'app_admin' || requestingUser.role === 'admin') {
    return true;
  }
  
  // School admins, teachers, and clerks can access payments in their organization
  if (['school_admin', 'teacher', 'clerk'].includes(requestingUser.role) && requestingUser.organizationId) {
    return organizationId === requestingUser.organizationId;
  }
  
  return false;
};

// Helper function to check if user can manage payments
const canManagePayments = (user) => {
  return ['app_admin', 'admin', 'school_admin', 'clerk'].includes(user.role);
};

// Helper function to validate payment method
const isValidPaymentMethod = (method) => {
  const validMethods = ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'cheque', 'upi', 'other'];
  return validMethods.includes(method);
};

// Helper function to calculate late fees
const calculateLateFee = (fee, lateFeeConfig = {}) => {
  const { 
    percentage = 5, 
    fixedAmount = 0, 
    gracePeriodDays = 7 
  } = lateFeeConfig;
  
  const dueDate = new Date(fee.dueDate);
  const currentDate = new Date();
  const graceEndDate = new Date(dueDate.getTime() + (gracePeriodDays * 24 * 60 * 60 * 1000));
  
  // No late fee if still within grace period or fee is already paid
  if (currentDate <= graceEndDate || fee.status === 'paid') {
    return 0;
  }
  
  // Calculate late fee based on percentage or fixed amount
  let lateFee = fixedAmount;
  if (percentage > 0) {
    lateFee += (fee.amount * percentage) / 100;
  }
  
  return Math.round(lateFee * 100) / 100; // Round to 2 decimal places
};

/**
 * CREATE PAYMENT TRANSACTION
 * POST /api/payments
 */
const createPaymentTransaction = async (req, res) => {
  try {
    const { 
      feeId, 
      amount, 
      paymentMethod, 
      transactionId, 
      notes,
      paymentDate 
    } = req.body;

    // Validate required fields
    if (!feeId || !amount || !paymentMethod) {
      throw new AppError('Fee ID, amount, and payment method are required', 400);
    }

    // Validate payment method
    if (!isValidPaymentMethod(paymentMethod)) {
      throw new AppError('Invalid payment method', 400);
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      throw new AppError('Amount must be a positive number', 400);
    }

    // Get the fee
    const fee = getFeeByIdFromStore(feeId);
    if (!fee) {
      throw new AppError('Fee not found', 404);
    }

    // Check permissions
    if (!canAccessPaymentData(req.user, fee.organizationId)) {
      throw new AppError('Access denied', 403);
    }

    if (!canManagePayments(req.user)) {
      throw new AppError('Insufficient permissions to manage payments', 403);
    }

    // Check if payment exceeds remaining amount
    const remainingAmount = fee.amount - fee.paidAmount;
    if (amount > remainingAmount) {
      throw new AppError(`Payment amount (${amount}) exceeds remaining fee amount (${remainingAmount})`, 400);
    }

    // Create payment transaction
    const paymentTransaction = {
      id: generatePaymentTransactionId(),
      organizationId: fee.organizationId,
      studentId: fee.studentId,
      feeId: feeId,
      amount: amount,
      paymentMethod: paymentMethod,
      transactionId: transactionId || null,
      paymentDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.id
    };

    // Add payment transaction to store
    addPaymentTransaction(paymentTransaction);

    // Update fee payment status
    const newPaidAmount = fee.paidAmount + amount;
    const newRemainingAmount = fee.amount - newPaidAmount;
    const newStatus = newRemainingAmount <= 0 ? 'paid' : 'partial';

    const updatedFee = updateFeeInStore(feeId, {
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      status: newStatus,
      paidDate: newStatus === 'paid' ? new Date().toISOString() : fee.paidDate,
      paymentMethod: paymentMethod,
      transactionId: transactionId || fee.transactionId
    });

    // Get student information for response
    const student = getStudentByIdFromStore(fee.studentId);

    logger.info('Payment transaction created:', {
      paymentId: paymentTransaction.id,
      feeId: feeId,
      amount: amount,
      organizationId: fee.organizationId,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: {
        payment: paymentTransaction,
        updatedFee: {
          ...updatedFee,
          student: student ? {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            rollNumber: student.rollNumber
          } : null
        }
      },
      message: 'Payment transaction created successfully'
    });

  } catch (error) {
    logger.error('Error creating payment transaction:', error);
    throw error;
  }
};

/**
 * GET ALL PAYMENT TRANSACTIONS
 * GET /api/payments
 */
const getPaymentTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      studentId, 
      feeId,
      paymentMethod,
      fromDate,
      toDate
    } = req.query;

    // Get transactions for organization
    let transactions = getPaymentTransactionsByOrganization(req.user.organizationId);

    // Apply filters
    if (studentId) {
      transactions = transactions.filter(t => t.studentId === studentId);
    }

    if (feeId) {
      transactions = transactions.filter(t => t.feeId === feeId);
    }

    if (paymentMethod) {
      transactions = transactions.filter(t => t.paymentMethod === paymentMethod);
    }

    if (fromDate) {
      const from = new Date(fromDate);
      transactions = transactions.filter(t => new Date(t.paymentDate) >= from);
    }

    if (toDate) {
      const to = new Date(toDate);
      transactions = transactions.filter(t => new Date(t.paymentDate) <= to);
    }

    // Sort by payment date (newest first)
    transactions.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));

    // Enrich with fee and student information
    const enrichedTransactions = paginatedTransactions.map(transaction => {
      const fee = getFeeByIdFromStore(transaction.feeId);
      const student = getStudentByIdFromStore(transaction.studentId);

      return {
        ...transaction,
        fee: fee ? {
          id: fee.id,
          type: fee.type,
          category: fee.category,
          month: fee.month,
          amount: fee.amount
        } : null,
        student: student ? {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          rollNumber: student.rollNumber
        } : null
      };
    });

    logger.info('Payment transactions retrieved:', {
      count: enrichedTransactions.length,
      total: transactions.length,
      userId: req.user.id,
      organizationId: req.user.organizationId,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        transactions: enrichedTransactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(transactions.length / parseInt(limit)),
          totalItems: transactions.length,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Error retrieving payment transactions:', error);
    throw error;
  }
};

/**
 * GET PAYMENT TRANSACTION BY ID
 * GET /api/payments/:id
 */
const getPaymentTransactionByIdEndpoint = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = getPaymentTransactionByIdFromStore(id);
    if (!transaction) {
      throw new AppError('Payment transaction not found', 404);
    }

    // Check permissions
    if (!canAccessPaymentData(req.user, transaction.organizationId)) {
      throw new AppError('Access denied', 403);
    }

    // Enrich with fee and student information
    const fee = getFeeByIdFromStore(transaction.feeId);
    const student = getStudentByIdFromStore(transaction.studentId);

    const enrichedTransaction = {
      ...transaction,
      fee: fee ? {
        id: fee.id,
        type: fee.type,
        category: fee.category,
        month: fee.month,
        amount: fee.amount,
        dueDate: fee.dueDate,
        status: fee.status
      } : null,
      student: student ? {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber,
        class: student.academicInfo?.class,
        section: student.academicInfo?.section
      } : null
    };

    logger.info('Payment transaction retrieved:', {
      paymentId: id,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        payment: enrichedTransaction
      }
    });

  } catch (error) {
    logger.error('Error getting payment transaction by ID:', error);
    throw error;
  }
};

/**
 * CREATE INSTALLMENT PLAN
 * POST /api/payments/installments
 */
const createInstallmentPlan = async (req, res) => {
  try {
    const { 
      feeId, 
      numberOfInstallments, 
      installmentAmount,
      startDate,
      frequency,
      description 
    } = req.body;

    // Validate required fields
    if (!feeId || !numberOfInstallments || !installmentAmount || !startDate) {
      throw new AppError('Fee ID, number of installments, installment amount, and start date are required', 400);
    }

    // Validate installment parameters
    if (numberOfInstallments < 2 || numberOfInstallments > 12) {
      throw new AppError('Number of installments must be between 2 and 12', 400);
    }

    if (typeof installmentAmount !== 'number' || installmentAmount <= 0) {
      throw new AppError('Installment amount must be a positive number', 400);
    }

    // Validate frequency
    const validFrequencies = ['weekly', 'monthly', 'quarterly'];
    if (frequency && !validFrequencies.includes(frequency)) {
      throw new AppError('Invalid frequency. Must be weekly, monthly, or quarterly', 400);
    }

    // Get the fee
    const fee = getFeeByIdFromStore(feeId);
    if (!fee) {
      throw new AppError('Fee not found', 404);
    }

    // Check permissions
    if (!canAccessPaymentData(req.user, fee.organizationId)) {
      throw new AppError('Access denied', 403);
    }

    if (!canManagePayments(req.user)) {
      throw new AppError('Insufficient permissions to manage payments', 403);
    }

    // Check if total installment amount matches fee amount
    const totalInstallmentAmount = installmentAmount * numberOfInstallments;
    if (Math.abs(totalInstallmentAmount - fee.remainingAmount) > 0.01) {
      throw new AppError(`Total installment amount (${totalInstallmentAmount}) must equal remaining fee amount (${fee.remainingAmount})`, 400);
    }

    // Generate installment schedule
    const installments = [];
    const start = new Date(startDate);
    
    for (let i = 0; i < numberOfInstallments; i++) {
      const dueDate = new Date(start);
      
      switch (frequency || 'monthly') {
        case 'weekly':
          dueDate.setDate(start.getDate() + (i * 7));
          break;
        case 'quarterly':
          dueDate.setMonth(start.getMonth() + (i * 3));
          break;
        case 'monthly':
        default:
          dueDate.setMonth(start.getMonth() + i);
          break;
      }

      installments.push({
        installmentNumber: i + 1,
        amount: installmentAmount,
        dueDate: dueDate.toISOString(),
        status: 'pending',
        paidDate: null,
        transactionId: null
      });
    }

    // Create installment plan
    const installmentPlan = {
      id: generateInstallmentPlanId(),
      organizationId: fee.organizationId,
      studentId: fee.studentId,
      feeId: feeId,
      numberOfInstallments: numberOfInstallments,
      installmentAmount: installmentAmount,
      totalAmount: totalInstallmentAmount,
      frequency: frequency || 'monthly',
      startDate: start.toISOString(),
      status: 'active',
      description: description || '',
      installments: installments,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.id
    };

    // Add installment plan to store
    addInstallmentPlan(installmentPlan);

    // Update fee status to indicate installment plan
    updateFeeInStore(feeId, {
      hasInstallmentPlan: true,
      installmentPlanId: installmentPlan.id,
      status: 'installment'
    });

    // Get student information for response
    const student = getStudentByIdFromStore(fee.studentId);

    logger.info('Installment plan created:', {
      planId: installmentPlan.id,
      feeId: feeId,
      numberOfInstallments: numberOfInstallments,
      organizationId: fee.organizationId,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: {
        installmentPlan: {
          ...installmentPlan,
          fee: {
            id: fee.id,
            type: fee.type,
            category: fee.category,
            month: fee.month
          },
          student: student ? {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            rollNumber: student.rollNumber
          } : null
        }
      },
      message: 'Installment plan created successfully'
    });

  } catch (error) {
    logger.error('Error creating installment plan:', error);
    throw error;
  }
};

/**
 * GET INSTALLMENT PLANS
 * GET /api/payments/installments
 */
const getInstallmentPlans = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      studentId, 
      feeId,
      status
    } = req.query;

    // Get installment plans for organization
    let plans = getInstallmentPlansByOrganization(req.user.organizationId);

    // Apply filters
    if (studentId) {
      plans = plans.filter(p => p.studentId === studentId);
    }

    if (feeId) {
      plans = plans.filter(p => p.feeId === feeId);
    }

    if (status) {
      plans = plans.filter(p => p.status === status);
    }

    // Sort by creation date (newest first)
    plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedPlans = plans.slice(skip, skip + parseInt(limit));

    // Enrich with fee and student information
    const enrichedPlans = paginatedPlans.map(plan => {
      const fee = getFeeByIdFromStore(plan.feeId);
      const student = getStudentByIdFromStore(plan.studentId);

      return {
        ...plan,
        fee: fee ? {
          id: fee.id,
          type: fee.type,
          category: fee.category,
          month: fee.month,
          amount: fee.amount
        } : null,
        student: student ? {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          rollNumber: student.rollNumber
        } : null
      };
    });

    logger.info('Installment plans retrieved:', {
      count: enrichedPlans.length,
      total: plans.length,
      userId: req.user.id,
      organizationId: req.user.organizationId
    });

    res.json({
      success: true,
      data: {
        installmentPlans: enrichedPlans,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(plans.length / parseInt(limit)),
          totalItems: plans.length,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Error retrieving installment plans:', error);
    throw error;
  }
};

module.exports = {
  createPaymentTransaction,
  getPaymentTransactions,
  getPaymentTransactionById: getPaymentTransactionByIdEndpoint,
  createInstallmentPlan,
  getInstallmentPlans,
  calculateLateFee
};
