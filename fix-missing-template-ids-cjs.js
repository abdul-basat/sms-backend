/**
 * Fix Missing Template IDs in Automation Rules
 * This script will find automation rules with missing templateIds and assign appropriate ones
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

async function fixMissingTemplateIds() {
  console.log('🔧 Fixing automation rules with missing template IDs...\n');
  console.log('Firebase project:', process.env.FIREBASE_PROJECT_ID);

  try {
    // Get all users from the correct path
    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} users\n`);
    
    if (usersSnapshot.empty) {
      console.log('No users found in the database');
      return;
    }
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`👤 Checking user: ${userId}`);
      
      // Get automation rules for this user
      const rulesSnapshot = await db.collection(`users/${userId}/automationRules`).get();
      
      if (rulesSnapshot.empty) {
        console.log(`   No automation rules found for user ${userId}`);
        continue;
      }

      let fixedCount = 0;
      
      for (const ruleDoc of rulesSnapshot.docs) {
        const ruleData = ruleDoc.data();
        const ruleId = ruleDoc.id;
        
        // Check if templateId is missing or "NOT SET"
        if (!ruleData.templateId || ruleData.templateId === "NOT SET") {
          console.log(`   🔍 Rule "${ruleData.name}" (${ruleId}) has missing templateId`);
          
          // Determine appropriate template ID based on rule name
          let suggestedTemplateId = null;
          const ruleName = ruleData.name?.toLowerCase() || '';
          
          if (ruleName.includes('fee') && ruleName.includes('reminder')) {
            suggestedTemplateId = 'fee-reminder';
          } else if (ruleName.includes('overdue')) {
            suggestedTemplateId = 'overdue-notice';
          } else if (ruleName.includes('payment')) {
            suggestedTemplateId = 'payment-confirmation';
          } else {
            suggestedTemplateId = 'general-template';
          }
          
          // Verify the suggested template exists for this user
          const templateDoc = await db.doc(`users/${userId}/whatsapp-automation/messageTemplates/${suggestedTemplateId}`).get();
          
          if (templateDoc.exists) {
            // Update the rule with the correct templateId
            await db.doc(`users/${userId}/automationRules/${ruleId}`).update({
              templateId: suggestedTemplateId
            });
            
            console.log(`   ✅ Fixed rule "${ruleData.name}" - assigned templateId: "${suggestedTemplateId}"`);
            fixedCount++;
          } else {
            console.log(`   ❌ Template "${suggestedTemplateId}" not found for user ${userId}`);
          }
        } else {
          console.log(`   ✓ Rule "${ruleData.name}" already has templateId: "${ruleData.templateId}"`);
        }
      }
      
      if (fixedCount > 0) {
        console.log(`   🎉 Fixed ${fixedCount} automation rules for user ${userId}\n`);
      } else {
        console.log(`   ✓ All automation rules for user ${userId} already have valid templateIds\n`);
      }
    }
    
    console.log('✅ Template ID fixing complete!');
    
  } catch (error) {
    console.error('❌ Error fixing template IDs:', error);
  }
}

// Run the fix
fixMissingTemplateIds().then(() => {
  console.log('🏁 Process completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
