/**
 * Student Controller
 * Handles student management business logic
 */

const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { 
  students, 
  getStudentById: getStudentByIdFromStore, 
  getAllStudents, 
  addStudent, 
  updateStudent: updateStudentInStore, 
  deleteStudent: deleteStudentFromStore,
  getStudentsByOrganization,
  getStudentByRollNumberAndOrganization
} = require('../models/dataStore');

// Helper function to generate student ID
const generateStudentId = () => {
  return `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to check if user can access student data
const canAccessStudent = (requestingUser, student) => {
  // Admin can access any student
  if (requestingUser.role === 'app_admin' || requestingUser.role === 'app_admin') {
    return true;
  }
  
  // School admins and teachers can access students in their organization
  if ((requestingUser.role === 'school_admin' || requestingUser.role === 'teacher') && requestingUser.organizationId) {
    return student && student.organizationId === requestingUser.organizationId;
  }
  
  return false;
};

// Helper function to check if user is admin
const isAdmin = (user) => {
  return user.role === 'app_admin' || user.role === 'app_admin';
};

/**
 * Get students for organization with pagination, search, and filtering
 */
const getStudents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      class: studentClass = '',
    } = req.query;

    // Check if user has permission to list students
    if (!isAdmin(req.user) && req.user.role !== 'school_admin' && req.user.role !== 'teacher') {
      throw new AppError('Access denied', 403);
    }

    let filteredStudents = getAllStudents();

    // Filter by organization for non-admin users
    if (!isAdmin(req.user) && req.user.organizationId) {
      filteredStudents = filteredStudents.filter(student => 
        student.organizationId === req.user.organizationId
      );
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredStudents = filteredStudents.filter(student => 
        student.firstName?.toLowerCase().includes(searchLower) ||
        student.lastName?.toLowerCase().includes(searchLower) ||
        student.rollNumber?.toLowerCase().includes(searchLower)
      );
    }

    // Apply class filter
    if (studentClass) {
      filteredStudents = filteredStudents.filter(student => student.class === studentClass);
    }

    // Calculate pagination
    const totalStudents = filteredStudents.length;
    const totalPages = Math.ceil(totalStudents / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);

    // Get paginated results
    const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

    logger.info(`Students retrieved: ${paginatedStudents.length} of ${totalStudents}`, {
      userId: req.user.id,
      organizationId: req.user.organizationId,
      page,
      limit,
      search,
      class: studentClass,
    });

    res.json({
      success: true,
      data: {
        students: paginatedStudents,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalStudents,
          pages: totalPages,
        },
      },
      message: 'Students retrieved successfully',
    });
  } catch (error) {
    logger.error('Error getting students:', error);
    throw error;
  }
};

/**
 * Create new student
 */
const createStudent = async (req, res) => {
  try {
    const studentData = req.body;

    // Check if user has permission to create students
    if (!isAdmin(req.user) && req.user.role !== 'school_admin' && req.user.role !== 'teacher') {
      throw new AppError('Access denied', 403);
    }

    // Check for duplicate roll number within organization
    const existingStudent = getStudentByRollNumberAndOrganization(
      studentData.rollNumber, 
      req.user.organizationId
    );
    
    if (existingStudent) {
      throw new AppError('A student with this roll number already exists in your organization', 409);
    }

    // Create new student
    const newStudent = {
      id: generateStudentId(),
      organizationId: req.user.organizationId,
      firstName: studentData.firstName,
      lastName: studentData.lastName,
      rollNumber: studentData.rollNumber,
      class: studentData.class,
      section: studentData.section || '',
      phone: studentData.phone || '',
      fatherName: studentData.fatherName || '',
      motherName: studentData.motherName || '',
      address: studentData.address || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedStudent = addStudent(newStudent);

    logger.info(`Student created: ${savedStudent.firstName} ${savedStudent.lastName}`, {
      studentId: savedStudent.id,
      organizationId: savedStudent.organizationId,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: { student: savedStudent },
      message: 'Student created successfully',
    });
  } catch (error) {
    logger.error('Error creating student:', error);
    throw error;
  }
};

/**
 * Get student by ID
 */
const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const student = getStudentByIdFromStore(id);
    if (!student) {
      throw new AppError('Student not found', 404);
    }

    // Check permissions
    if (!canAccessStudent(req.user, student)) {
      throw new AppError('Student not found', 404); // Hide existence for security
    }

    logger.info(`Student retrieved: ${student.firstName} ${student.lastName}`, {
      userId: req.user.id,
      studentId: id,
      organizationId: req.user.organizationId,
    });

    res.json({
      success: true,
      data: { student },
      message: 'Student retrieved successfully',
    });
  } catch (error) {
    logger.error('Error getting student by ID:', error);
    throw error;
  }
};

/**
 * Update student
 */
const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const student = getStudentByIdFromStore(id);
    if (!student) {
      throw new AppError('Student not found', 404);
    }

    // Check permissions
    if (!canAccessStudent(req.user, student)) {
      throw new AppError('Student not found', 404); // Hide existence for security
    }

    // Check for duplicate roll number if roll number is being updated
    if (updateData.rollNumber && updateData.rollNumber !== student.rollNumber) {
      const existingStudent = getStudentByRollNumberAndOrganization(
        updateData.rollNumber, 
        student.organizationId
      );
      
      if (existingStudent && existingStudent.id !== id) {
        throw new AppError('A student with this roll number already exists in your organization', 409);
      }
    }

    // Remove undefined values and prepare update data
    const filteredUpdateData = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        filteredUpdateData[key] = updateData[key];
      }
    });

    const updatedStudent = updateStudentInStore(id, filteredUpdateData);

    logger.info(`Student updated: ${updatedStudent.firstName} ${updatedStudent.lastName}`, {
      studentId: id,
      organizationId: updatedStudent.organizationId,
      userId: req.user.id,
      updatedFields: Object.keys(filteredUpdateData),
    });

    res.json({
      success: true,
      data: { student: updatedStudent },
      message: 'Student updated successfully',
    });
  } catch (error) {
    logger.error('Error updating student:', error);
    throw error;
  }
};

/**
 * Delete student
 */
const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = getStudentByIdFromStore(id);
    if (!student) {
      throw new AppError('Student not found', 404);
    }

    // Check permissions
    if (!canAccessStudent(req.user, student)) {
      throw new AppError('Student not found', 404); // Hide existence for security
    }

    const deletedStudent = deleteStudentFromStore(id);

    logger.info(`Student deleted: ${deletedStudent.firstName} ${deletedStudent.lastName}`, {
      studentId: id,
      organizationId: deletedStudent.organizationId,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: { student: deletedStudent },
      message: 'Student deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting student:', error);
    throw error;
  }
};

module.exports = {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
};
