/**
 * Just fix the automation rules - based on the exact working check script
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

async function fixAutomationRules() {
  console.log('🔧 Fixing automation rules with missing template IDs...\n');

  try {
    // Get users the same way as the working script
    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} users to check`);

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`\n🤖 User ${userId} - Automation Rules:`);
      
      try {
        // Get automation rules
        const automationRulesSnapshot = await db
          .collection(`users/${userId}/whatsapp-automation/automationRules`)
          .get();

        if (automationRulesSnapshot.empty) {
          console.log('     No automation rules found');
          continue;
        }

        let fixedCount = 0;
        automationRulesSnapshot.forEach(async (ruleDoc, index) => {
          const ruleData = ruleDoc.data();
          const ruleId = ruleDoc.id;
          const templateId = ruleData.templateId;
          
          console.log(`     Rule ${index + 1}: "${ruleData.name}" (ID: ${ruleId})`);
          
          if (!templateId || templateId === "NOT SET") {
            console.log(`       Template ID: "NOT SET" ❌`);
            
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
            
            console.log(`       Suggested template: "${suggestedTemplateId}"`);
            
            // Check if suggested template exists
            const templateDoc = await db.doc(`users/${userId}/whatsapp-automation/messageTemplates/${suggestedTemplateId}`).get();
            
            if (templateDoc.exists) {
              // Update the rule
              await db.doc(`users/${userId}/whatsapp-automation/automationRules/${ruleId}`).update({
                templateId: suggestedTemplateId
              });
              
              console.log(`       ✅ Fixed! Assigned template: "${suggestedTemplateId}"`);
              fixedCount++;
            } else {
              console.log(`       ❌ Template "${suggestedTemplateId}" not found`);
            }
          } else {
            console.log(`       Template ID: "${templateId}" ✅`);
          }
        });
        
        if (fixedCount > 0) {
          console.log(`     🎉 Fixed ${fixedCount} automation rules`);
        }
        
      } catch (error) {
        console.log(`     ❌ Error checking automation rules: ${error.message}`);
      }
    }

    console.log('\n✅ Automation rule fixing complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the fix
fixAutomationRules().then(() => {
  console.log('🏁 Done');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
