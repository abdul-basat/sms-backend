/**
 * Message Template Service
 * Handles message templates for automated communications
 */

const { db } = require('../config/firebase');
const logger = require('../utils/logger');

class MessageTemplateService {
  constructor() {
    this.templateCache = new Map(); // organizationId -> templates
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Create a new message template
   * @param {string} organizationId - Organization ID
   * @param {Object} templateData - Template data
   * @returns {Promise<Object>} - Created template
   */
  async createTemplate(organizationId, templateData) {
    try {
      logger.info(`[MessageTemplateService] Creating template for organization: ${organizationId}`);

      const template = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        name: templateData.name,
        category: templateData.category,
        content: templateData.content,
        language: templateData.language || 'en',
        variables: this.extractVariables(templateData.content),
        isActive: templateData.isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        createdBy: templateData.createdBy
      };

      // Validate template
      const validation = this.validateTemplate(template);
      if (!validation.isValid) {
        throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
      }

      // Save to database
      await db.collection('messageTemplates').doc(template.id).set(template);

      // Clear cache for organization
      this.clearOrganizationCache(organizationId);

      logger.info(`[MessageTemplateService] Template created successfully: ${template.id}`);
      
      return { success: true, template };

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to create template for organization ${organizationId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get templates for organization
   * @param {string} organizationId - Organization ID
   * @param {Object} filters - Filters (category, isActive, language)
   * @returns {Promise<Array>} - Templates
   */
  async getTemplates(organizationId, filters = {}) {
    try {
      // Check cache first
      const cacheKey = `${organizationId}_${JSON.stringify(filters)}`;
      const cached = this.templateCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        logger.info(`[MessageTemplateService] Returning cached templates for organization: ${organizationId}`);
        return cached.templates;
      }

      logger.info(`[MessageTemplateService] Fetching templates for organization: ${organizationId}`);

      let query = db.collection('messageTemplates')
        .where('organizationId', '==', organizationId);

      // Apply filters
      if (filters.category) {
        query = query.where('category', '==', filters.category);
      }
      
      if (filters.isActive !== undefined) {
        query = query.where('isActive', '==', filters.isActive);
      }

      if (filters.language) {
        query = query.where('language', '==', filters.language);
      }

      const snapshot = await query.orderBy('createdAt', 'desc').get();
      
      const templates = [];
      snapshot.forEach(doc => {
        templates.push({ id: doc.id, ...doc.data() });
      });

      // Cache the results
      this.templateCache.set(cacheKey, {
        templates,
        timestamp: Date.now()
      });

      logger.info(`[MessageTemplateService] Found ${templates.length} templates for organization: ${organizationId}`);
      
      return templates;

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to get templates for organization ${organizationId}:`, error);
      return [];
    }
  }

  /**
   * Get template by ID
   * @param {string} templateId - Template ID
   * @param {string} organizationId - Organization ID (for security)
   * @returns {Promise<Object|null>} - Template or null
   */
  async getTemplate(templateId, organizationId) {
    try {
      const doc = await db.collection('messageTemplates').doc(templateId).get();
      
      if (!doc.exists) {
        return null;
      }

      const template = { id: doc.id, ...doc.data() };
      
      // Verify organization ownership
      if (template.organizationId !== organizationId) {
        logger.warn(`[MessageTemplateService] Unauthorized access attempt to template ${templateId} by organization ${organizationId}`);
        return null;
      }

      return template;

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to get template ${templateId}:`, error);
      return null;
    }
  }

  /**
   * Update template
   * @param {string} templateId - Template ID
   * @param {string} organizationId - Organization ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} - Update result
   */
  async updateTemplate(templateId, organizationId, updateData) {
    try {
      // Get existing template
      const existingTemplate = await this.getTemplate(templateId, organizationId);
      
      if (!existingTemplate) {
        return { success: false, error: 'Template not found or access denied' };
      }

      logger.info(`[MessageTemplateService] Updating template: ${templateId}`);

      const updatedTemplate = {
        ...existingTemplate,
        ...updateData,
        variables: updateData.content ? this.extractVariables(updateData.content) : existingTemplate.variables,
        updatedAt: new Date(),
        version: existingTemplate.version + 1
      };

      // Validate updated template
      const validation = this.validateTemplate(updatedTemplate);
      if (!validation.isValid) {
        return { success: false, error: `Template validation failed: ${validation.errors.join(', ')}` };
      }

      // Update in database
      await db.collection('messageTemplates').doc(templateId).update({
        ...updateData,
        variables: updatedTemplate.variables,
        updatedAt: updatedTemplate.updatedAt,
        version: updatedTemplate.version
      });

      // Clear cache for organization
      this.clearOrganizationCache(organizationId);

      logger.info(`[MessageTemplateService] Template updated successfully: ${templateId}`);
      
      return { success: true, template: updatedTemplate };

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to update template ${templateId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete template
   * @param {string} templateId - Template ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} - Delete result
   */
  async deleteTemplate(templateId, organizationId) {
    try {
      // Verify ownership
      const template = await this.getTemplate(templateId, organizationId);
      
      if (!template) {
        return { success: false, error: 'Template not found or access denied' };
      }

      logger.info(`[MessageTemplateService] Deleting template: ${templateId}`);

      // Soft delete by marking as inactive
      await db.collection('messageTemplates').doc(templateId).update({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date()
      });

      // Clear cache for organization
      this.clearOrganizationCache(organizationId);

      logger.info(`[MessageTemplateService] Template deleted successfully: ${templateId}`);
      
      return { success: true };

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to delete template ${templateId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Render template with variables
   * @param {Object} template - Template object
   * @param {Object} variables - Variables to substitute
   * @returns {string} - Rendered content
   */
  renderTemplate(template, variables) {
    try {
      let content = template.content;

      // Replace variables in format {variableName}
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        content = content.replace(regex, value || '');
      }

      // Log any unreplaced variables
      const unreplacedVariables = content.match(/\{[^}]+\}/g);
      if (unreplacedVariables) {
        logger.warn(`[MessageTemplateService] Unreplaced variables in template ${template.id}: ${unreplacedVariables.join(', ')}`);
      }

      return content;

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to render template ${template.id}:`, error);
      return template.content; // Return original content as fallback
    }
  }

  /**
   * Get template by category and organization
   * @param {string} organizationId - Organization ID
   * @param {string} category - Template category
   * @param {string} language - Language (optional)
   * @returns {Promise<Object|null>} - Template or null
   */
  async getTemplateByCategory(organizationId, category, language = 'en') {
    try {
      const templates = await this.getTemplates(organizationId, {
        category,
        isActive: true,
        language
      });

      if (templates.length === 0) {
        logger.warn(`[MessageTemplateService] No active template found for category ${category} in organization ${organizationId}`);
        return null;
      }

      // Return the most recent template
      return templates[0];

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to get template by category ${category}:`, error);
      return null;
    }
  }

  /**
   * Extract variables from template content
   * @param {string} content - Template content
   * @returns {Array} - Array of variable names
   */
  extractVariables(content) {
    const matches = content.match(/\{([^}]+)\}/g);
    if (!matches) return [];

    return [...new Set(matches.map(match => match.slice(1, -1)))];
  }

  /**
   * Validate template
   * @param {Object} template - Template to validate
   * @returns {Object} - Validation result
   */
  validateTemplate(template) {
    const errors = [];

    // Required fields
    if (!template.name || template.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!template.content || template.content.trim().length === 0) {
      errors.push('Template content is required');
    }

    if (!template.category) {
      errors.push('Template category is required');
    }

    // Valid categories
    const validCategories = [
      'fee_reminder',
      'payment_confirmation',
      'enrollment',
      'attendance_absent',
      'attendance_sick_leave',
      'attendance_casual_leave',
      'announcement',
      'custom'
    ];

    if (template.category && !validCategories.includes(template.category)) {
      errors.push(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }

    // Content length
    if (template.content && template.content.length > 4096) {
      errors.push('Template content cannot exceed 4096 characters');
    }

    // Language code
    if (template.language && !/^[a-z]{2}$/.test(template.language)) {
      errors.push('Language must be a valid 2-letter language code');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Clear organization cache
   * @param {string} organizationId - Organization ID
   */
  clearOrganizationCache(organizationId) {
    const keysToDelete = [];
    for (const key of this.templateCache.keys()) {
      if (key.startsWith(organizationId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.templateCache.delete(key));
    logger.info(`[MessageTemplateService] Cleared cache for organization: ${organizationId}`);
  }

  /**
   * Get default templates for organization
   * @param {string} organizationId - Organization ID
   * @returns {Array} - Default templates
   */
  getDefaultTemplates(organizationId) {
    return [
      {
        name: 'Fee Payment Reminder',
        category: 'fee_reminder',
        content: 'Dear {studentName}, your fee payment of {feeAmount} is due on {dueDate}. Please make the payment to avoid late charges. Class: {className}',
        language: 'en',
        isActive: true
      },
      {
        name: 'Payment Confirmation',
        category: 'payment_confirmation',
        content: 'Dear {studentName}, we have received your fee payment of {paidAmount} on {paymentDate}. Thank you for your prompt payment. Class: {className}',
        language: 'en',
        isActive: true
      },
      {
        name: 'Absent Notification',
        category: 'attendance_absent',
        content: 'Dear Parent, {studentName} was absent from class {className} on {date}. Please contact us if this absence was due to any emergency.',
        language: 'en',
        isActive: true
      },
      {
        name: 'Sick Leave Notification',
        category: 'attendance_sick_leave',
        content: 'Dear Parent, {studentName} was marked as sick leave for class {className} on {date}. We hope they recover soon.',
        language: 'en',
        isActive: true
      },
      {
        name: 'Casual Leave Notification',
        category: 'attendance_casual_leave',
        content: 'Dear Parent, {studentName} was granted casual leave for class {className} on {date}.',
        language: 'en',
        isActive: true
      }
    ];
  }

  /**
   * Create default templates for organization
   * @param {string} organizationId - Organization ID
   * @param {string} createdBy - User ID who created the templates
   * @returns {Promise<Object>} - Creation result
   */
  async createDefaultTemplates(organizationId, createdBy) {
    try {
      logger.info(`[MessageTemplateService] Creating default templates for organization: ${organizationId}`);

      const defaultTemplates = this.getDefaultTemplates(organizationId);
      const results = [];

      for (const templateData of defaultTemplates) {
        const result = await this.createTemplate(organizationId, {
          ...templateData,
          createdBy
        });
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      
      logger.info(`[MessageTemplateService] Created ${successCount}/${defaultTemplates.length} default templates for organization: ${organizationId}`);
      
      return {
        success: true,
        created: successCount,
        total: defaultTemplates.length,
        results
      };

    } catch (error) {
      logger.error(`[MessageTemplateService] Failed to create default templates for organization ${organizationId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = MessageTemplateService;
