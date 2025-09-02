const logger = require('../utils/logger');
const FirebaseService = require('../services/firebaseService');

/**
 * Automation Controller
 * Handles automation rules API endpoints
 */
class AutomationController {
  constructor() {
    this.firebaseService = new FirebaseService();
  }

  /**
   * Get automation rules for an organization
   * GET /api/automation/rules/:organizationId
   */
  async getAutomationRules(req, res) {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      logger.info(`[AutomationController] Getting automation rules for organization: ${organizationId}`);

      // Get all automation rules and filter by organization
      const allRules = await this.firebaseService.getAutomationRules();
      const organizationRules = allRules.filter(rule => rule.organizationId === organizationId);

      logger.info(`[AutomationController] Found ${organizationRules.length} rules for organization ${organizationId}`);

      res.json({
        success: true,
        data: organizationRules
      });

    } catch (error) {
      logger.error('[AutomationController] Get automation rules failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get all automation rules (for admin or system use)
   * GET /api/automation/rules
   */
  async getAllAutomationRules(req, res) {
    try {
      logger.info('[AutomationController] Getting all automation rules');

      const rules = await this.firebaseService.getAutomationRules();

      logger.info(`[AutomationController] Found ${rules.length} total automation rules`);

      res.json({
        success: true,
        data: rules
      });

    } catch (error) {
      logger.error('[AutomationController] Get all automation rules failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Create or update automation rules for a user
   * POST /api/automation/rules
   */
  async saveAutomationRules(req, res) {
    try {
      const { rules, userId, organizationId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      if (!Array.isArray(rules)) {
        return res.status(400).json({
          success: false,
          message: 'Rules must be an array'
        });
      }

      logger.info(`[AutomationController] Saving ${rules.length} automation rules for user: ${userId}`);

      // Add organization context to rules
      const rulesWithContext = rules.map(rule => ({
        ...rule,
        userId,
        organizationId: organizationId || null,
        updatedAt: new Date().toISOString()
      }));

      // Save to Firebase using the same structure as the frontend
      const admin = require('firebase-admin');
      const db = admin.firestore();
      
      const automationDocRef = db
        .collection('users')
        .doc(userId)
        .collection('whatsapp')
        .doc('automation');

      await automationDocRef.set({
        rules: rulesWithContext,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.info(`[AutomationController] Successfully saved automation rules for user: ${userId}`);

      res.json({
        success: true,
        message: 'Automation rules saved successfully',
        data: {
          rulesCount: rules.length,
          userId,
          organizationId
        }
      });

    } catch (error) {
      logger.error('[AutomationController] Save automation rules failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to save automation rules',
        error: error.message
      });
    }
  }

  /**
   * Get automation rule statistics
   * GET /api/automation/stats/:organizationId
   */
  async getAutomationStats(req, res) {
    try {
      const { organizationId } = req.params;

      logger.info(`[AutomationController] Getting automation stats for organization: ${organizationId}`);

      const allRules = await this.firebaseService.getAutomationRules();
      const organizationRules = organizationId 
        ? allRules.filter(rule => rule.organizationId === organizationId)
        : allRules;

      const stats = {
        totalRules: organizationRules.length,
        activeRules: organizationRules.filter(rule => rule.enabled).length,
        inactiveRules: organizationRules.filter(rule => !rule.enabled).length,
        totalMessagesSent: organizationRules.reduce((sum, rule) => sum + (rule.totalSent || 0), 0),
        ruleTypes: {
          reminder: organizationRules.filter(rule => rule.type === 'reminder').length,
          overdue: organizationRules.filter(rule => rule.type === 'overdue').length,
          payment_confirmation: organizationRules.filter(rule => rule.type === 'payment_confirmation').length
        }
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('[AutomationController] Get automation stats failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = AutomationController;
