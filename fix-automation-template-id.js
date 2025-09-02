/**
 * Fix automation rule template ID
 * This script updates your automation rule to use a valid template ID
 */

const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin if not already done
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

const db = admin.firestore();

async function fixAutomationRuleTemplateId() {
  try {
    console.log('🔧 Fixing automation rule template IDs...');
    
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      console.log(`\n👤 Checking user: ${userDoc.id}`);
      
      try {
        // Get user's automation rules
        const automationDoc = await db
          .collection('users')
          .doc(userDoc.id)
          .collection('whatsapp')
          .doc('automation')
          .get();
        
        if (automationDoc.exists) {
          const automationData = automationDoc.data();
          let updated = false;
          
          // Handle both formats: rules array or individual rule fields
          if (automationData.rules && Array.isArray(automationData.rules)) {
            // Rules array format
            const updatedRules = automationData.rules.map(rule => {
              if (!rule.templateId && rule.name && rule.name.toLowerCase().includes('overdue')) {
                console.log(`  ✏️ Updating rule "${rule.name}" with overdue-notice template`);
                updated = true;
                return {
                  ...rule,
                  templateId: 'overdue-notice'
                };
              } else if (!rule.templateId && rule.name && rule.name.toLowerCase().includes('reminder')) {
                console.log(`  ✏️ Updating rule "${rule.name}" with fee-reminder template`);
                updated = true;
                return {
                  ...rule,
                  templateId: 'fee-reminder'
                };
              } else if (!rule.templateId) {
                console.log(`  ✏️ Updating rule "${rule.name}" with general-template`);
                updated = true;
                return {
                  ...rule,
                  templateId: 'general-template'
                };
              }
              return rule;
            });
            
            if (updated) {
              await db
                .collection('users')
                .doc(userDoc.id)
                .collection('whatsapp')
                .doc('automation')
                .update({
                  rules: updatedRules,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
              console.log(`  ✅ Updated automation rules for user ${userDoc.id}`);
            }
          } else if (automationData.id && !automationData.templateId) {
            // Single rule format
            const templateId = automationData.name && automationData.name.toLowerCase().includes('overdue') 
              ? 'overdue-notice' 
              : 'fee-reminder';
            
            await db
              .collection('users')
              .doc(userDoc.id)
              .collection('whatsapp')
              .doc('automation')
              .update({
                templateId: templateId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            console.log(`  ✅ Updated single automation rule for user ${userDoc.id} with template: ${templateId}`);
          } else {
            console.log(`  ℹ️ User ${userDoc.id} automation rules already have templateId or unsupported format`);
          }
        } else {
          console.log(`  ℹ️ User ${userDoc.id} has no automation rules`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating user ${userDoc.id}:`, error.message);
      }
    }
    
    console.log('\n🎉 Automation rule template ID fix completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Restart your automation server');
    console.log('2. Check if templates are now working');
    console.log('3. Use frontend UI to create custom templates');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

// Run the fix
fixAutomationRuleTemplateId().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
