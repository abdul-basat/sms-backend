const admin = require('firebase-admin');

class FirebaseService {
  constructor() {
    this.initializeFirebase();
    this.db = admin.firestore();
  }

  /**
   * Initialize Firebase Admin SDK
   */
  initializeFirebase() {
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  }

  /**
   * Get all automation rules from Firestore
   * @returns {Promise<Array>} - Array of automation rules
   */
  async getAutomationRules() {
    try {
      console.log('📋 Fetching automation rules from Firebase...');
      
      // Get all users and their automation rules
      const usersSnapshot = await this.db.collection('users').get();
      const allRules = [];
      
      for (const userDoc of usersSnapshot.docs) {
        try {
          // Check if user has WhatsApp automation rules
          const automationDoc = await this.db
            .collection('users')
            .doc(userDoc.id)
            .collection('whatsapp')
            .doc('automation')
            .get();
          
          if (automationDoc.exists) {
            const automationData = automationDoc.data();
            
            // Handle both formats: rules array or individual rule fields
            let userRules = [];
            if (automationData.rules && Array.isArray(automationData.rules)) {
              userRules = automationData.rules;
            } else if (automationData.id) {
              // Single rule format
              userRules = [automationData];
            }
            
            // Add user context to each rule and filter enabled ones
            const enabledUserRules = userRules
              .filter(rule => rule.enabled === true)
              .map(rule => ({
                ...rule,
                userId: userDoc.id,
                organizationId: userDoc.data()?.organizationId || null
              }));
              
            allRules.push(...enabledUserRules);
          }
        } catch (error) {
          console.warn(`⚠️ Error fetching automation rules for user ${userDoc.id}:`, error.message);
          // Continue with other users
        }
      }

      console.log(`✅ Found ${allRules.length} active automation rules across all users`);
      return allRules;
      
    } catch (error) {
      console.error('❌ Failed to fetch automation rules:', error.message);
      throw error;
    }
  }

  /**
   * Get all students from Firestore
   * @returns {Promise<Array>} - Array of students
   */
  async getStudents() {
    try {
      console.log('👥 Fetching students from Firebase...');
      
      const studentsSnapshot = await this.db
        .collection('students')
        .get();

      const students = [];
      studentsSnapshot.forEach(doc => {
        students.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`✅ Found ${students.length} students`);
      return students;
      
    } catch (error) {
      console.error('❌ Failed to fetch students:', error.message);
      throw error;
    }
  }

  /**
   * Get message template by ID
   * @param {string} templateId - Template ID
   * @returns {Promise<Object>} - Message template
   */
  async getTemplate(templateId) {
    try {
      if (!templateId) {
        throw new Error('Template ID is required and cannot be undefined or empty');
      }
      
      console.log(`📝 Fetching template ${templateId} from Firebase...`);
      
      const templateDoc = await this.db
        .collection('messageTemplates')
        .doc(templateId)
        .get();

      if (!templateDoc.exists) {
        throw new Error(`Template ${templateId} not found`);
      }

      const template = {
        id: templateDoc.id,
        ...templateDoc.data()
      };

      console.log(`✅ Found template: ${template.name}`);
      return template;
      
    } catch (error) {
      console.error(`❌ Failed to fetch template ${templateId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get rate limiting rules
   * @returns {Promise<Array>} - Array of rate limiting rules
   */
  async getRateLimitingRules() {
    try {
      console.log('⏱️ Fetching rate limiting rules from Firebase...');
      
      const rulesSnapshot = await this.db
        .collection('rateLimitingRules')
        .where('enabled', '==', true)
        .get();

      const rules = [];
      rulesSnapshot.forEach(doc => {
        rules.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`✅ Found ${rules.length} rate limiting rules`);
      return rules;
      
    } catch (error) {
      console.error('❌ Failed to fetch rate limiting rules:', error.message);
      return []; // Return empty array as fallback
    }
  }

  /**
   * Log message delivery status
   * @param {Object} messageData - Message data
   * @param {string} status - Delivery status (success/failed)
   * @param {string} error - Error message if failed
   */
  async logMessageDelivery(messageData, status, error = null) {
    try {
      const logEntry = {
        phoneNumber: messageData.phoneNumber,
        studentId: messageData.studentId,
        studentName: messageData.studentName,
        ruleId: messageData.ruleId,
        message: messageData.message,
        status: status,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        error: error
      };

      await this.db
        .collection('messageLogs')
        .add(logEntry);

      console.log(`📊 Logged message delivery: ${status} for ${messageData.studentName}`);
      
    } catch (error) {
      console.error('❌ Failed to log message delivery:', error.message);
    }
  }

  /**
   * Update automation rule last run time
   * @param {string} ruleId - Rule ID
   * @param {string} userId - User ID who owns the rule
   */
  async updateRuleLastRun(ruleId, userId) {
    try {
      if (!userId) {
        console.warn(`⚠️ Cannot update last run time for rule ${ruleId}: missing userId`);
        return;
      }
      
      // Get the current automation document
      const automationDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('whatsapp')
        .doc('automation');
        
      const automationDoc = await automationDocRef.get();
      
      if (automationDoc.exists) {
        const automationData = automationDoc.data();
        
        if (automationData.rules && Array.isArray(automationData.rules)) {
          // Update the specific rule in the rules array
          const updatedRules = automationData.rules.map(rule => {
            if (rule.id === ruleId) {
              return {
                ...rule,
                lastRun: admin.firestore.FieldValue.serverTimestamp()
              };
            }
            return rule;
          });
          
          await automationDocRef.update({
            rules: updatedRules,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          console.log(`🔄 Updated last run time for rule ${ruleId} (user: ${userId})`);
        } else if (automationData.id === ruleId) {
          // Single rule format
          await automationDocRef.update({
            lastRun: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          console.log(`🔄 Updated last run time for rule ${ruleId} (user: ${userId})`);
        }
      } else {
        console.warn(`⚠️ No automation document found for user ${userId}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to update last run time for rule ${ruleId}:`, error.message);
    }
  }

  /**
   * Get message delivery statistics
   * @param {Date} startDate - Start date for statistics
   * @param {Date} endDate - End date for statistics
   * @returns {Promise<Object>} - Delivery statistics
   */
  async getMessageStats(startDate, endDate) {
    try {
      const logsSnapshot = await this.db
        .collection('messageLogs')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .get();

      let total = 0;
      let success = 0;
      let failed = 0;

      logsSnapshot.forEach(doc => {
        total++;
        if (doc.data().status === 'success') {
          success++;
        } else {
          failed++;
        }
      });

      return {
        total,
        success,
        failed,
        successRate: total > 0 ? (success / total) * 100 : 0
      };
      
    } catch (error) {
      console.error('❌ Failed to get message stats:', error.message);
      return { total: 0, success: 0, failed: 0, successRate: 0 };
    }
  }

  /**
   * Health check for Firebase connection
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      // Test connection by trying to read a document
      await this.db.collection('automationRules').limit(1).get();
      
      return {
        service: 'firebase',
        connected: true,
        projectId: process.env.FIREBASE_PROJECT_ID,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        service: 'firebase',
        connected: false,
        projectId: process.env.FIREBASE_PROJECT_ID,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = FirebaseService;
