/**
 * Shared Data Store
 * Centralized in-memory storage for testing (replace with database in production)
 */

// User storage
const users = new Map();

// Organization storage (if needed for future integration)
const organizations = new Map();

// Student storage (for future use)
const students = new Map();

// Fee storage (for future use)
const fees = new Map();

// Payment transactions storage (Phase 5)
const paymentTransactions = new Map();

// Fee installment plans storage (Phase 5)
const installmentPlans = new Map();

// Communication Analytics & Management storage (Phase 6)
const analytics = new Map();
const communicationLogs = new Map();
const communicationSettings = new Map();
const parentContacts = new Map();
const communicationPreferences = new Map();
const optOutRecords = new Map();
const communicationHistory = new Map();

module.exports = {
  users,
  organizations,
  students,
  fees,
  paymentTransactions,
  installmentPlans,
  
  // Communication Analytics & Management
  analytics,
  communicationLogs,
  communicationSettings,
  parentContacts,
  communicationPreferences,
  optOutRecords,
  communicationHistory,
  
  // Helper methods
  clearAll() {
    users.clear();
    organizations.clear();
    students.clear();
    fees.clear();
    paymentTransactions.clear();
    installmentPlans.clear();
    
    // Clear communication storage
    analytics.clear();
    communicationLogs.clear();
    communicationSettings.clear();
    parentContacts.clear();
    communicationPreferences.clear();
    optOutRecords.clear();
    communicationHistory.clear();
  },

  clear() {
    this.clearAll();
  },
  
  getUserById(id) {
    return users.get(id);
  },
  
  getAllUsers() {
    return Array.from(users.values());
  },
  
  addUser(user) {
    users.set(user.id, user);
    return user;
  },
  
  updateUser(id, updateData) {
    const user = users.get(id);
    if (!user) return null;
    
    const updatedUser = { ...user, ...updateData, updatedAt: new Date().toISOString() };
    users.set(id, updatedUser);
    return updatedUser;
  },
  
  deleteUser(id) {
    const user = users.get(id);
    if (!user) return null;
    
    users.delete(id);
    return user;
  },

  // Student management methods
  getStudentById(id) {
    return students.get(id);
  },
  
  getAllStudents() {
    return Array.from(students.values());
  },
  
  addStudent(student) {
    students.set(student.id, student);
    return student;
  },
  
  updateStudent(id, updateData) {
    const student = students.get(id);
    if (!student) return null;
    
    const updatedStudent = { ...student, ...updateData, updatedAt: new Date().toISOString() };
    students.set(id, updatedStudent);
    return updatedStudent;
  },
  
  deleteStudent(id) {
    const student = students.get(id);
    if (!student) return null;
    
    students.delete(id);
    return student;
  },

  getStudentsByOrganization(organizationId) {
    return Array.from(students.values()).filter(student => student.organizationId === organizationId);
  },

  getStudentByRollNumberAndOrganization(rollNumber, organizationId) {
    return Array.from(students.values()).find(student => 
      student.rollNumber === rollNumber && student.organizationId === organizationId
    );
  },

  // Fee management methods
  getFeeById(id) {
    return fees.get(id);
  },
  
  getAllFees() {
    return Array.from(fees.values());
  },
  
  addFee(fee) {
    fees.set(fee.id, fee);
    return fee;
  },
  
  updateFee(id, updateData) {
    const fee = fees.get(id);
    if (!fee) return null;
    
    const updatedFee = { ...fee, ...updateData, updatedAt: new Date().toISOString() };
    fees.set(id, updatedFee);
    return updatedFee;
  },
  
  deleteFee(id) {
    const fee = fees.get(id);
    if (!fee) return null;
    
    fees.delete(id);
    return fee;
  },

  getFeesByOrganization(organizationId) {
    return Array.from(fees.values()).filter(fee => fee.organizationId === organizationId);
  },

  getFeesByStudent(studentId) {
    return Array.from(fees.values()).filter(fee => fee.studentId === studentId);
  },

  getFeesByOrganizationAndType(organizationId, type) {
    return Array.from(fees.values()).filter(fee => 
      fee.organizationId === organizationId && fee.type === type
    );
  },

  getFeesByOrganizationAndMonth(organizationId, month) {
    return Array.from(fees.values()).filter(fee => 
      fee.organizationId === organizationId && fee.month === month
    );
  },

  getFeeByStudentAndMonth(studentId, month) {
    return Array.from(fees.values()).find(fee => 
      fee.studentId === studentId && fee.month === month
    );
  },

  // Payment Transaction management methods (Phase 5)
  getPaymentTransactionById(id) {
    return paymentTransactions.get(id);
  },
  
  getAllPaymentTransactions() {
    return Array.from(paymentTransactions.values());
  },
  
  addPaymentTransaction(transaction) {
    paymentTransactions.set(transaction.id, transaction);
    return transaction;
  },
  
  updatePaymentTransaction(id, updateData) {
    const transaction = paymentTransactions.get(id);
    if (!transaction) return null;
    
    const updatedTransaction = { ...transaction, ...updateData, updatedAt: new Date().toISOString() };
    paymentTransactions.set(id, updatedTransaction);
    return updatedTransaction;
  },
  
  deletePaymentTransaction(id) {
    const transaction = paymentTransactions.get(id);
    if (!transaction) return null;
    
    paymentTransactions.delete(id);
    return transaction;
  },

  getPaymentTransactionsByOrganization(organizationId) {
    return Array.from(paymentTransactions.values()).filter(transaction => transaction.organizationId === organizationId);
  },

  getPaymentTransactionsByStudent(studentId) {
    return Array.from(paymentTransactions.values()).filter(transaction => transaction.studentId === studentId);
  },

  getPaymentTransactionsByFee(feeId) {
    return Array.from(paymentTransactions.values()).filter(transaction => transaction.feeId === feeId);
  },

  // Installment Plan management methods (Phase 5)
  getInstallmentPlanById(id) {
    return installmentPlans.get(id);
  },
  
  getAllInstallmentPlans() {
    return Array.from(installmentPlans.values());
  },
  
  addInstallmentPlan(plan) {
    installmentPlans.set(plan.id, plan);
    return plan;
  },
  
  updateInstallmentPlan(id, updateData) {
    const plan = installmentPlans.get(id);
    if (!plan) return null;
    
    const updatedPlan = { ...plan, ...updateData, updatedAt: new Date().toISOString() };
    installmentPlans.set(id, updatedPlan);
    return updatedPlan;
  },
  
  deleteInstallmentPlan(id) {
    const plan = installmentPlans.get(id);
    if (!plan) return null;
    
    installmentPlans.delete(id);
    return plan;
  },

  getInstallmentPlansByOrganization(organizationId) {
    return Array.from(installmentPlans.values()).filter(plan => plan.organizationId === organizationId);
  },

  getInstallmentPlansByStudent(studentId) {
    return Array.from(installmentPlans.values()).filter(plan => plan.studentId === studentId);
  },

  getInstallmentPlansByFee(feeId) {
    return Array.from(installmentPlans.values()).filter(plan => plan.feeId === feeId);
  }
};
