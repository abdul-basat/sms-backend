/**
 * Quick verification - check if NOT SET issue is resolved
 */

const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
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

async function quickCheck() {
  console.log('🔍 Quick check for NOT SET template IDs...\n');

  try {
    const usersSnapshot = await db.collection('users').get();
    let totalRules = 0;
    let notSetCount = 0;
    let fixedCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      
      try {
        const automationRulesSnapshot = await db
          .collection(`users/${userId}/whatsapp-automation/automationRules`)
          .get();

        if (!automationRulesSnapshot.empty) {
          automationRulesSnapshot.forEach((ruleDoc) => {
            const ruleData = ruleDoc.data();
            totalRules++;
            
            if (!ruleData.templateId || ruleData.templateId === "NOT SET") {
              notSetCount++;
              console.log(`❌ User ${userId}: Rule "${ruleData.name}" still has NOT SET`);
            } else {
              fixedCount++;
              console.log(`✅ User ${userId}: Rule "${ruleData.name}" has templateId: "${ruleData.templateId}"`);
            }
          });
        }
      } catch (error) {
        console.log(`Error checking user ${userId}: ${error.message}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`Total automation rules found: ${totalRules}`);
    console.log(`Rules with proper template IDs: ${fixedCount}`);
    console.log(`Rules still with NOT SET: ${notSetCount}`);
    
    if (notSetCount === 0) {
      console.log('\n🎉 SUCCESS: All automation rules now have proper template IDs!');
    } else {
      console.log('\n⚠️  Some rules still need fixing');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

quickCheck().then(() => {
  console.log('\n🏁 Check complete');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
