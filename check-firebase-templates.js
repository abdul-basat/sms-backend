/**
 * Comprehensive Firebase Template Checker
 * This script will check all templates stored in Firebase and their IDs
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

async function checkFirebaseTemplates() {
  try {
    console.log('🔍 Comprehensive Firebase Template Analysis...\n');
    
    // 1. Check messageTemplates collection (backend automation templates)
    console.log('📋 1. Checking messageTemplates collection (Backend Automation):');
    console.log('=' .repeat(60));
    
    const messageTemplatesSnapshot = await db.collection('messageTemplates').get();
    
    if (messageTemplatesSnapshot.empty) {
      console.log('❌ No templates found in messageTemplates collection');
    } else {
      console.log(`✅ Found ${messageTemplatesSnapshot.size} templates in messageTemplates collection:`);
      messageTemplatesSnapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n  ${index + 1}. Template ID: "${doc.id}"`);
        console.log(`     Name: "${data.name || 'No name'}"`);
        console.log(`     Category: "${data.category || 'No category'}"`);
        console.log(`     Organization: "${data.organizationId || 'No organization'}"`);
        console.log(`     Content Preview: "${(data.content || '').substring(0, 50)}..."`);
        console.log(`     Active: ${data.isActive !== false ? 'Yes' : 'No'}`);
        console.log(`     Created: ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString() : 'Unknown'}`);
      });
    }
    
    // 2. Check user-specific template storage
    console.log('\n\n📱 2. Checking User-Specific Templates (Frontend Storage):');
    console.log('=' .repeat(60));
    
    const usersSnapshot = await db.collection('users').get();
    let userTemplatesFound = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        // Check WhatsApp messageTemplates subcollection
        const whatsappTemplatesDoc = await db
          .collection('users')
          .doc(userDoc.id)
          .collection('whatsapp')
          .doc('messageTemplates')
          .get();
        
        if (whatsappTemplatesDoc.exists) {
          const data = whatsappTemplatesDoc.data();
          if (data.templates && data.templates.length > 0) {
            userTemplatesFound++;
            console.log(`\n  👤 User: ${userDoc.id}`);
            console.log(`     Templates Count: ${data.templates.length}`);
            console.log(`     Last Updated: ${data.updatedAt || 'Unknown'}`);
            
            data.templates.forEach((template, index) => {
              console.log(`\n     ${index + 1}. Template ID: "${template.id}"`);
              console.log(`        Name: "${template.name || 'No name'}"`);
              console.log(`        Category: "${template.category || 'No category'}"`);
              console.log(`        Content Preview: "${(template.content || '').substring(0, 50)}..."`);
            });
          }
        }
        
        // Check automation rules and their template references
        const automationDoc = await db
          .collection('users')
          .doc(userDoc.id)
          .collection('whatsapp')
          .doc('automation')
          .get();
        
        if (automationDoc.exists) {
          const automationData = automationDoc.data();
          console.log(`\n  🤖 User ${userDoc.id} - Automation Rules:`);
          
          if (automationData.rules && Array.isArray(automationData.rules)) {
            automationData.rules.forEach((rule, index) => {
              console.log(`     Rule ${index + 1}: "${rule.name || 'No name'}" (ID: ${rule.id})`);
              console.log(`       Template ID: "${rule.templateId || 'NOT SET'}" ${rule.templateId ? '✅' : '❌'}`);
              console.log(`       Enabled: ${rule.enabled ? 'Yes' : 'No'}`);
            });
          } else if (automationData.id) {
            console.log(`     Single Rule: "${automationData.name || 'No name'}" (ID: ${automationData.id})`);
            console.log(`       Template ID: "${automationData.templateId || 'NOT SET'}" ${automationData.templateId ? '✅' : '❌'}`);
            console.log(`       Enabled: ${automationData.enabled ? 'Yes' : 'No'}`);
          }
        }
        
      } catch (error) {
        console.log(`     ⚠️ Error checking user ${userDoc.id}: ${error.message}`);
      }
    }
    
    if (userTemplatesFound === 0) {
      console.log('❌ No user-specific templates found');
    }
    
    // 3. Check adminMessageTemplates collection
    console.log('\n\n🔧 3. Checking adminMessageTemplates collection:');
    console.log('=' .repeat(60));
    
    const adminTemplatesSnapshot = await db.collection('adminMessageTemplates').get();
    
    if (adminTemplatesSnapshot.empty) {
      console.log('❌ No templates found in adminMessageTemplates collection');
    } else {
      console.log(`✅ Found ${adminTemplatesSnapshot.size} admin templates:`);
      adminTemplatesSnapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n  ${index + 1}. Template ID: "${doc.id}"`);
        console.log(`     Name: "${data.name || 'No name'}"`);
        console.log(`     Category: "${data.category || 'No category'}"`);
        console.log(`     Content Preview: "${(data.content || '').substring(0, 50)}..."`);
        console.log(`     Usage Count: ${data.usageCount || 0}`);
      });
    }
    
    // 4. Summary and Recommendations
    console.log('\n\n📊 4. Summary & Analysis:');
    console.log('=' .repeat(60));
    
    const totalBackendTemplates = messageTemplatesSnapshot.size;
    const totalAdminTemplates = adminTemplatesSnapshot.size;
    
    console.log(`📈 Template Storage Summary:`);
    console.log(`   - Backend messageTemplates: ${totalBackendTemplates}`);
    console.log(`   - User-specific templates: ${userTemplatesFound} users have templates`);
    console.log(`   - Admin templates: ${totalAdminTemplates}`);
    
    console.log(`\n🔧 Frontend Template Save Capability:`);
    if (userTemplatesFound > 0) {
      console.log(`   ✅ YES - Frontend IS saving templates to Firebase`);
      console.log(`   ✅ Found templates in users/{userId}/whatsapp/messageTemplates`);
    } else {
      console.log(`   ❌ NO - Frontend is NOT saving templates to Firebase`);
      console.log(`   ⚠️ Templates may only exist in frontend code, not in database`);
    }
    
    console.log(`\n💡 Recommendations:`);
    if (totalBackendTemplates === 0 && userTemplatesFound === 0) {
      console.log(`   1. 🚨 No templates found in Firebase - Backend automation will fail`);
      console.log(`   2. 💾 Save default templates to Firebase via frontend`);
      console.log(`   3. 🔗 Ensure automation rules have valid templateId references`);
    } else if (userTemplatesFound > 0 && totalBackendTemplates === 0) {
      console.log(`   1. ✅ User templates exist but not in backend collection`);
      console.log(`   2. 🔄 Backend should read from users/{userId}/whatsapp/messageTemplates`);
      console.log(`   3. 🔧 Update backend to use correct Firebase path`);
    } else {
      console.log(`   1. ✅ Templates are properly stored in Firebase`);
      console.log(`   2. 🔍 Check automation rules have correct templateId references`);
    }
    
  } catch (error) {
    console.error('❌ Firebase template check failed:', error);
  }
}

// Run the comprehensive check
checkFirebaseTemplates().then(() => {
  console.log('\n🎉 Firebase template analysis completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Analysis failed:', error);
  process.exit(1);
});
