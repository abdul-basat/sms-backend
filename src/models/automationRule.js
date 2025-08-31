/**
 * Data Models
 * Defines data structures for automation rules, students, and message templates
 */

/**
 * Automation Rule Model
 */
class AutomationRule {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.description = data.description || '';
    this.templateId = data.templateId || '';
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.schedule = new Schedule(data.schedule || {});
    this.criteria = new Criteria(data.criteria || {});
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.lastRun = data.lastRun || null;
    this.nextRun = data.nextRun || null;
    this.runCount = data.runCount || 0;
    this.successCount = data.successCount || 0;
    this.failureCount = data.failureCount || 0;
  }

  /**
   * Validate the automation rule
   */
  validate() {
    const validator = require('../utils/validator');
    return validator.validateAutomationRule(this);
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      templateId: this.templateId,
      enabled: this.enabled,
      schedule: this.schedule.toObject(),
      criteria: this.criteria.toObject(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      runCount: this.runCount,
      successCount: this.successCount,
      failureCount: this.failureCount
    };
  }

  /**
   * Create from plain object
   */
  static fromObject(data) {
    return new AutomationRule(data);
  }

  /**
   * Check if rule should run now
   */
  shouldRunNow() {
    if (!this.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    return this.schedule.shouldRunAt(currentTime, now);
  }

  /**
   * Increment run count
   */
  incrementRunCount() {
    this.runCount++;
    this.lastRun = new Date();
  }

  /**
   * Increment success count
   */
  incrementSuccessCount() {
    this.successCount++;
  }

  /**
   * Increment failure count
   */
  incrementFailureCount() {
    this.failureCount++;
  }

  /**
   * Get success rate
   */
  getSuccessRate() {
    if (this.runCount === 0) {
      return 0;
    }
    return (this.successCount / this.runCount) * 100;
  }
}

/**
 * Schedule Model
 */
class Schedule {
  constructor(data = {}) {
    this.time = data.time || '09:00';
    this.frequency = data.frequency || 'daily';
    this.daysOfWeek = data.daysOfWeek || [];
    this.timezone = data.timezone || 'Asia/Karachi';
  }

  /**
   * Check if schedule should run at given time
   */
  shouldRunAt(time, date = new Date()) {
    // Check time
    if (this.time !== time) {
      return false;
    }

    // Check frequency
    if (this.frequency === 'daily') {
      return true;
    }

    if (this.frequency === 'weekly') {
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      return this.daysOfWeek.includes(dayOfWeek);
    }

    return false;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      time: this.time,
      frequency: this.frequency,
      daysOfWeek: this.daysOfWeek,
      timezone: this.timezone
    };
  }
}

/**
 * Criteria Model
 */
class Criteria {
  constructor(data = {}) {
    this.paymentStatus = data.paymentStatus || null;
    this.dueDate = data.dueDate ? new DueDateCriteria(data.dueDate) : null;
    this.classId = data.classId || null;
    this.courseId = data.courseId || null;
    this.amount = data.amount || null;
    this.customFilters = data.customFilters || [];
  }

  /**
   * Check if student matches criteria
   */
  matchesStudent(student) {
    // Check payment status
    if (this.paymentStatus && student.paymentStatus !== this.paymentStatus) {
      return false;
    }

    // Check due date
    if (this.dueDate && !this.dueDate.matches(student.dueDate)) {
      return false;
    }

    // Check class ID
    if (this.classId && student.classId !== this.classId) {
      return false;
    }

    // Check course ID
    if (this.courseId && student.courseId !== this.courseId) {
      return false;
    }

    // Check amount
    if (this.amount && student.amount !== this.amount) {
      return false;
    }

    // Check custom filters
    for (const filter of this.customFilters) {
      if (!filter.matches(student)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      paymentStatus: this.paymentStatus,
      dueDate: this.dueDate ? this.dueDate.toObject() : null,
      classId: this.classId,
      courseId: this.courseId,
      amount: this.amount,
      customFilters: this.customFilters.map(filter => filter.toObject())
    };
  }
}

/**
 * Due Date Criteria Model
 */
class DueDateCriteria {
  constructor(data = {}) {
    this.condition = data.condition || 'overdue'; // 'before', 'after', 'overdue'
    this.days = data.days || 0;
  }

  /**
   * Check if due date matches criteria
   */
  matches(dueDate) {
    if (!dueDate) {
      return false;
    }

    const due = new Date(dueDate);
    const now = new Date();
    const daysDifference = Math.floor((due - now) / (1000 * 60 * 60 * 24));

    switch (this.condition) {
      case 'overdue':
        return daysDifference < 0;
      case 'before':
        return daysDifference <= this.days && daysDifference >= 0;
      case 'after':
        return daysDifference >= this.days;
      default:
        return false;
    }
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      condition: this.condition,
      days: this.days
    };
  }
}

/**
 * Student Model
 */
class Student {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.whatsappNumber = data.whatsappNumber || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.classId = data.classId || null;
    this.className = data.className || '';
    this.courseId = data.courseId || null;
    this.courseName = data.courseName || '';
    this.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    this.amount = data.amount || 0;
    this.paymentStatus = data.paymentStatus || 'unpaid';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Validate the student data
   */
  validate() {
    const validator = require('../utils/validator');
    return validator.validateStudent(this);
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      whatsappNumber: this.whatsappNumber,
      email: this.email,
      phone: this.phone,
      classId: this.classId,
      className: this.className,
      courseId: this.courseId,
      courseName: this.courseName,
      dueDate: this.dueDate,
      amount: this.amount,
      paymentStatus: this.paymentStatus,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Create from plain object
   */
  static fromObject(data) {
    return new Student(data);
  }

  /**
   * Check if student is overdue
   */
  isOverdue() {
    if (!this.dueDate) {
      return false;
    }
    return new Date() > this.dueDate;
  }

  /**
   * Get days until due date
   */
  getDaysUntilDue() {
    if (!this.dueDate) {
      return null;
    }
    const now = new Date();
    const due = new Date(this.dueDate);
    return Math.floor((due - now) / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if student has valid WhatsApp number
   */
  hasValidWhatsAppNumber() {
    const validator = require('../utils/validator');
    return validator.validatePhoneNumber(this.whatsappNumber);
  }
}

/**
 * Message Template Model
 */
class MessageTemplate {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.description = data.description || '';
    this.content = data.content || '';
    this.category = data.category || 'general';
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.usageCount = data.usageCount || 0;
    this.successCount = data.successCount || 0;
    this.failureCount = data.failureCount || 0;
  }

  /**
   * Validate the message template
   */
  validate() {
    const validator = require('../utils/validator');
    return validator.validateMessageTemplate(this);
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      content: this.content,
      category: this.category,
      enabled: this.enabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      usageCount: this.usageCount,
      successCount: this.successCount,
      failureCount: this.failureCount
    };
  }

  /**
   * Create from plain object
   */
  static fromObject(data) {
    return new MessageTemplate(data);
  }

  /**
   * Format message with student data
   */
  formatMessage(student) {
    let message = this.content;

    // Replace placeholders with student data
    const placeholders = {
      '{name}': student.name || 'Student',
      '{class}': student.className || 'Class',
      '{course}': student.courseName || 'Course',
      '{dueDate}': student.dueDate ? new Date(student.dueDate).toLocaleDateString() : 'Due Date',
      '{amount}': student.amount || 'Amount',
      '{phone}': student.phone || 'Phone',
      '{email}': student.email || 'Email',
      '{studentId}': student.id || 'Student ID'
    };

    for (const [placeholder, value] of Object.entries(placeholders)) {
      message = message.replace(new RegExp(placeholder, 'g'), value);
    }

    return message;
  }

  /**
   * Increment usage count
   */
  incrementUsageCount() {
    this.usageCount++;
  }

  /**
   * Increment success count
   */
  incrementSuccessCount() {
    this.successCount++;
  }

  /**
   * Increment failure count
   */
  incrementFailureCount() {
    this.failureCount++;
  }

  /**
   * Get success rate
   */
  getSuccessRate() {
    if (this.usageCount === 0) {
      return 0;
    }
    return (this.successCount / this.usageCount) * 100;
  }

  /**
   * Get available placeholders
   */
  getAvailablePlaceholders() {
    return [
      '{name}', '{class}', '{course}', '{dueDate}', 
      '{amount}', '{phone}', '{email}', '{studentId}'
    ];
  }
}

/**
 * Rate Limiting Rule Model
 */
class RateLimitingRule {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.description = data.description || '';
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.businessHours = data.businessHours ? new BusinessHours(data.businessHours) : null;
    this.hourlyLimit = data.hourlyLimit ? new HourlyLimit(data.hourlyLimit) : null;
    this.dailyLimit = data.dailyLimit ? new DailyLimit(data.dailyLimit) : null;
    this.delayBetweenMessages = data.delayBetweenMessages ? new DelayBetweenMessages(data.delayBetweenMessages) : null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Validate the rate limiting rule
   */
  validate() {
    const validator = require('../utils/validator');
    return validator.validateRateLimitingRule(this);
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      enabled: this.enabled,
      businessHours: this.businessHours ? this.businessHours.toObject() : null,
      hourlyLimit: this.hourlyLimit ? this.hourlyLimit.toObject() : null,
      dailyLimit: this.dailyLimit ? this.dailyLimit.toObject() : null,
      delayBetweenMessages: this.delayBetweenMessages ? this.delayBetweenMessages.toObject() : null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Create from plain object
   */
  static fromObject(data) {
    return new RateLimitingRule(data);
  }
}

/**
 * Business Hours Model
 */
class BusinessHours {
  constructor(data = {}) {
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.startHour = data.startHour || 9;
    this.endHour = data.endHour || 17;
    this.daysOfWeek = data.daysOfWeek || [1, 2, 3, 4, 5]; // Monday to Friday
  }

  /**
   * Check if current time is within business hours
   */
  isWithinBusinessHours(date = new Date()) {
    if (!this.enabled) {
      return true;
    }

    const currentHour = date.getHours();
    const currentDay = date.getDay();

    // Check if current day is allowed
    if (!this.daysOfWeek.includes(currentDay)) {
      return false;
    }

    // Check if current hour is within business hours
    return currentHour >= this.startHour && currentHour < this.endHour;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      enabled: this.enabled,
      startHour: this.startHour,
      endHour: this.endHour,
      daysOfWeek: this.daysOfWeek
    };
  }
}

/**
 * Hourly Limit Model
 */
class HourlyLimit {
  constructor(data = {}) {
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.maxMessages = data.maxMessages || 10;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      enabled: this.enabled,
      maxMessages: this.maxMessages
    };
  }
}

/**
 * Daily Limit Model
 */
class DailyLimit {
  constructor(data = {}) {
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.maxMessages = data.maxMessages || 100;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      enabled: this.enabled,
      maxMessages: this.maxMessages
    };
  }
}

/**
 * Delay Between Messages Model
 */
class DelayBetweenMessages {
  constructor(data = {}) {
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.delaySeconds = data.delaySeconds || 2;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      enabled: this.enabled,
      delaySeconds: this.delaySeconds
    };
  }
}

module.exports = {
  AutomationRule,
  Schedule,
  Criteria,
  DueDateCriteria,
  Student,
  MessageTemplate,
  RateLimitingRule,
  BusinessHours,
  HourlyLimit,
  DailyLimit,
  DelayBetweenMessages
};
