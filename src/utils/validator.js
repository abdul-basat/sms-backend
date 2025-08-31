/**
 * Data Validation Utilities
 * Provides validation for automation rules, student data, and message templates
 */

class Validator {
  constructor() {
    this.errors = [];
  }

  /**
   * Clear validation errors
   */
  clearErrors() {
    this.errors = [];
  }

  /**
   * Add validation error
   */
  addError(field, message) {
    this.errors.push({ field, message });
  }

  /**
   * Get all validation errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Check if validation passed
   */
  isValid() {
    return this.errors.length === 0;
  }

  /**
   * Validate automation rule
   */
  validateAutomationRule(rule) {
    this.clearErrors();

    // Required fields
    if (!rule.name || typeof rule.name !== 'string' || rule.name.trim().length === 0) {
      this.addError('name', 'Rule name is required and must be a non-empty string');
    }

    if (!rule.templateId || typeof rule.templateId !== 'string') {
      this.addError('templateId', 'Template ID is required and must be a string');
    }

    if (!rule.schedule) {
      this.addError('schedule', 'Schedule configuration is required');
    } else {
      this.validateSchedule(rule.schedule);
    }

    if (rule.criteria) {
      this.validateCriteria(rule.criteria);
    }

    // Optional fields with validation
    if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
      this.addError('enabled', 'Enabled must be a boolean value');
    }

    if (rule.description && typeof rule.description !== 'string') {
      this.addError('description', 'Description must be a string');
    }

    return this.isValid();
  }

  /**
   * Validate schedule configuration
   */
  validateSchedule(schedule) {
    if (!schedule.time || typeof schedule.time !== 'string') {
      this.addError('schedule.time', 'Schedule time is required and must be a string (HH:MM format)');
    } else {
      // Validate time format (HH:MM)
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(schedule.time)) {
        this.addError('schedule.time', 'Schedule time must be in HH:MM format (24-hour)');
      }
    }

    if (!schedule.frequency || !['daily', 'weekly'].includes(schedule.frequency)) {
      this.addError('schedule.frequency', 'Schedule frequency must be either "daily" or "weekly"');
    }

    if (schedule.frequency === 'weekly') {
      if (!schedule.daysOfWeek || !Array.isArray(schedule.daysOfWeek) || schedule.daysOfWeek.length === 0) {
        this.addError('schedule.daysOfWeek', 'Days of week are required for weekly frequency');
      } else {
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const invalidDays = schedule.daysOfWeek.filter(day => !validDays.includes(day.toLowerCase()));
        if (invalidDays.length > 0) {
          this.addError('schedule.daysOfWeek', `Invalid days: ${invalidDays.join(', ')}. Valid days: ${validDays.join(', ')}`);
        }
      }
    }
  }

  /**
   * Validate criteria configuration
   */
  validateCriteria(criteria) {
    // Payment status validation
    if (criteria.paymentStatus) {
      const validStatuses = ['paid', 'unpaid', 'overdue', 'partial'];
      if (!validStatuses.includes(criteria.paymentStatus)) {
        this.addError('criteria.paymentStatus', `Invalid payment status. Valid statuses: ${validStatuses.join(', ')}`);
      }
    }

    // Due date validation
    if (criteria.dueDate) {
      this.validateDueDateCriteria(criteria.dueDate);
    }

    // Class ID validation
    if (criteria.classId && typeof criteria.classId !== 'string') {
      this.addError('criteria.classId', 'Class ID must be a string');
    }

    // Course ID validation
    if (criteria.courseId && typeof criteria.courseId !== 'string') {
      this.addError('criteria.courseId', 'Course ID must be a string');
    }
  }

  /**
   * Validate due date criteria
   */
  validateDueDateCriteria(dueDate) {
    if (!dueDate.condition || !['before', 'after', 'overdue'].includes(dueDate.condition)) {
      this.addError('criteria.dueDate.condition', 'Due date condition must be "before", "after", or "overdue"');
    }

    if (dueDate.condition === 'before' || dueDate.condition === 'after') {
      if (typeof dueDate.days !== 'number' || dueDate.days < 0) {
        this.addError('criteria.dueDate.days', 'Days must be a non-negative number');
      }
    }
  }

  /**
   * Validate student data
   */
  validateStudent(student) {
    this.clearErrors();

    // Required fields
    if (!student.name || typeof student.name !== 'string' || student.name.trim().length === 0) {
      this.addError('name', 'Student name is required and must be a non-empty string');
    }

    if (!student.whatsappNumber || typeof student.whatsappNumber !== 'string') {
      this.addError('whatsappNumber', 'WhatsApp number is required and must be a string');
    } else {
      // Validate phone number format (basic validation)
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      const cleanNumber = student.whatsappNumber.replace(/[\s\-\(\)]/g, '');
      if (!phoneRegex.test(cleanNumber)) {
        this.addError('whatsappNumber', 'WhatsApp number must be a valid international phone number');
      }
    }

    // Optional fields with validation
    if (student.email && typeof student.email !== 'string') {
      this.addError('email', 'Email must be a string');
    } else if (student.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(student.email)) {
        this.addError('email', 'Email must be a valid email address');
      }
    }

    if (student.phone && typeof student.phone !== 'string') {
      this.addError('phone', 'Phone must be a string');
    }

    if (student.className && typeof student.className !== 'string') {
      this.addError('className', 'Class name must be a string');
    }

    if (student.courseName && typeof student.courseName !== 'string') {
      this.addError('courseName', 'Course name must be a string');
    }

    if (student.dueDate) {
      if (typeof student.dueDate === 'string') {
        const date = new Date(student.dueDate);
        if (isNaN(date.getTime())) {
          this.addError('dueDate', 'Due date must be a valid date');
        }
      } else if (!(student.dueDate instanceof Date)) {
        this.addError('dueDate', 'Due date must be a valid date');
      }
    }

    if (student.amount !== undefined) {
      if (typeof student.amount !== 'number' || student.amount < 0) {
        this.addError('amount', 'Amount must be a non-negative number');
      }
    }

    if (student.paymentStatus) {
      const validStatuses = ['paid', 'unpaid', 'overdue', 'partial'];
      if (!validStatuses.includes(student.paymentStatus)) {
        this.addError('paymentStatus', `Invalid payment status. Valid statuses: ${validStatuses.join(', ')}`);
      }
    }

    return this.isValid();
  }

  /**
   * Validate message template
   */
  validateMessageTemplate(template) {
    this.clearErrors();

    // Required fields
    if (!template.name || typeof template.name !== 'string' || template.name.trim().length === 0) {
      this.addError('name', 'Template name is required and must be a non-empty string');
    }

    if (!template.content || typeof template.content !== 'string' || template.content.trim().length === 0) {
      this.addError('content', 'Template content is required and must be a non-empty string');
    }

    // Optional fields with validation
    if (template.description && typeof template.description !== 'string') {
      this.addError('description', 'Description must be a string');
    }

    if (template.category && typeof template.category !== 'string') {
      this.addError('category', 'Category must be a string');
    }

    if (template.enabled !== undefined && typeof template.enabled !== 'boolean') {
      this.addError('enabled', 'Enabled must be a boolean value');
    }

    // Validate placeholders in content
    if (template.content) {
      this.validateTemplatePlaceholders(template.content);
    }

    return this.isValid();
  }

  /**
   * Validate template placeholders
   */
  validateTemplatePlaceholders(content) {
    const validPlaceholders = [
      '{name}', '{class}', '{course}', '{dueDate}', 
      '{amount}', '{phone}', '{email}', '{studentId}'
    ];

    const placeholderRegex = /\{([^}]+)\}/g;
    const foundPlaceholders = [];
    let match;

    while ((match = placeholderRegex.exec(content)) !== null) {
      foundPlaceholders.push(match[0]);
    }

    const invalidPlaceholders = foundPlaceholders.filter(placeholder => 
      !validPlaceholders.includes(placeholder)
    );

    if (invalidPlaceholders.length > 0) {
      this.addError('content', `Invalid placeholders found: ${invalidPlaceholders.join(', ')}. Valid placeholders: ${validPlaceholders.join(', ')}`);
    }
  }

  /**
   * Validate rate limiting rule
   */
  validateRateLimitingRule(rule) {
    this.clearErrors();

    // Required fields
    if (!rule.name || typeof rule.name !== 'string' || rule.name.trim().length === 0) {
      this.addError('name', 'Rule name is required and must be a non-empty string');
    }

    // Optional fields with validation
    if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
      this.addError('enabled', 'Enabled must be a boolean value');
    }

    if (rule.description && typeof rule.description !== 'string') {
      this.addError('description', 'Description must be a string');
    }

    // Business hours validation
    if (rule.businessHours) {
      this.validateBusinessHours(rule.businessHours);
    }

    // Hourly limit validation
    if (rule.hourlyLimit) {
      this.validateHourlyLimit(rule.hourlyLimit);
    }

    // Daily limit validation
    if (rule.dailyLimit) {
      this.validateDailyLimit(rule.dailyLimit);
    }

    // Delay between messages validation
    if (rule.delayBetweenMessages) {
      this.validateDelayBetweenMessages(rule.delayBetweenMessages);
    }

    return this.isValid();
  }

  /**
   * Validate business hours
   */
  validateBusinessHours(businessHours) {
    if (businessHours.enabled !== undefined && typeof businessHours.enabled !== 'boolean') {
      this.addError('businessHours.enabled', 'Business hours enabled must be a boolean value');
    }

    if (businessHours.startHour !== undefined) {
      if (typeof businessHours.startHour !== 'number' || businessHours.startHour < 0 || businessHours.startHour > 23) {
        this.addError('businessHours.startHour', 'Start hour must be a number between 0 and 23');
      }
    }

    if (businessHours.endHour !== undefined) {
      if (typeof businessHours.endHour !== 'number' || businessHours.endHour < 0 || businessHours.endHour > 23) {
        this.addError('businessHours.endHour', 'End hour must be a number between 0 and 23');
      }
    }

    if (businessHours.startHour !== undefined && businessHours.endHour !== undefined) {
      if (businessHours.startHour >= businessHours.endHour) {
        this.addError('businessHours', 'Start hour must be before end hour');
      }
    }

    if (businessHours.daysOfWeek) {
      if (!Array.isArray(businessHours.daysOfWeek)) {
        this.addError('businessHours.daysOfWeek', 'Days of week must be an array');
      } else {
        const validDays = [0, 1, 2, 3, 4, 5, 6]; // Sunday = 0, Saturday = 6
        const invalidDays = businessHours.daysOfWeek.filter(day => !validDays.includes(day));
        if (invalidDays.length > 0) {
          this.addError('businessHours.daysOfWeek', `Invalid days: ${invalidDays.join(', ')}. Valid days: 0-6 (Sunday-Saturday)`);
        }
      }
    }
  }

  /**
   * Validate hourly limit
   */
  validateHourlyLimit(hourlyLimit) {
    if (hourlyLimit.enabled !== undefined && typeof hourlyLimit.enabled !== 'boolean') {
      this.addError('hourlyLimit.enabled', 'Hourly limit enabled must be a boolean value');
    }

    if (hourlyLimit.maxMessages !== undefined) {
      if (typeof hourlyLimit.maxMessages !== 'number' || hourlyLimit.maxMessages < 1) {
        this.addError('hourlyLimit.maxMessages', 'Max messages per hour must be a positive number');
      }
    }
  }

  /**
   * Validate daily limit
   */
  validateDailyLimit(dailyLimit) {
    if (dailyLimit.enabled !== undefined && typeof dailyLimit.enabled !== 'boolean') {
      this.addError('dailyLimit.enabled', 'Daily limit enabled must be a boolean value');
    }

    if (dailyLimit.maxMessages !== undefined) {
      if (typeof dailyLimit.maxMessages !== 'number' || dailyLimit.maxMessages < 1) {
        this.addError('dailyLimit.maxMessages', 'Max messages per day must be a positive number');
      }
    }
  }

  /**
   * Validate delay between messages
   */
  validateDelayBetweenMessages(delayBetweenMessages) {
    if (delayBetweenMessages.enabled !== undefined && typeof delayBetweenMessages.enabled !== 'boolean') {
      this.addError('delayBetweenMessages.enabled', 'Delay between messages enabled must be a boolean value');
    }

    if (delayBetweenMessages.delaySeconds !== undefined) {
      if (typeof delayBetweenMessages.delaySeconds !== 'number' || delayBetweenMessages.delaySeconds < 0) {
        this.addError('delayBetweenMessages.delaySeconds', 'Delay seconds must be a non-negative number');
      }
    }
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }

    const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(cleanNumber);
  }

  /**
   * Validate email format
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate date format
   */
  validateDate(date) {
    if (!date) {
      return false;
    }

    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime());
  }

  /**
   * Sanitize string input
   */
  sanitizeString(input) {
    if (typeof input !== 'string') {
      return '';
    }
    return input.trim().replace(/[<>]/g, '');
  }

  /**
   * Sanitize phone number
   */
  sanitizePhoneNumber(phoneNumber) {
    if (typeof phoneNumber !== 'string') {
      return '';
    }
    return phoneNumber.replace(/[\s\-\(\)]/g, '');
  }
}

// Create singleton instance
const validator = new Validator();

module.exports = validator;
