/**
 * Debug script to check why automation rules aren't executing
 * This will help us understand what's happening in the automation processing
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

async function debugAutomationProcessing() {
  console.log('🔍 Debugging automation rule processing...\n');
  
  const now = new Date();
  console.log(`Current time: ${now.toTimeString().slice(0, 8)} (${now.toISOString()})`);
  console.log(`Current time formatted (HH:MM): ${now.toTimeString().slice(0, 5)}`);
  console.log(`Current day of week: ${now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()}\n`);

  try {
    const usersSnapshot = await db.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      
      try {
        const automationRulesSnapshot = await db
          .collection(`users/${userId}/whatsapp-automation/automationRules`)
          .get();

        if (!automationRulesSnapshot.empty) {
          console.log(`🤖 User ${userId} - Automation Rules Debug:`);
          
          automationRulesSnapshot.forEach((ruleDoc, index) => {
            const ruleData = ruleDoc.data();
            const ruleId = ruleDoc.id;
            
            console.log(`\n   Rule ${index + 1}: "${ruleData.name}" (ID: ${ruleId})`);
            console.log(`   ├─ Enabled: ${ruleData.enabled ? 'Yes' : 'No'}`);
            console.log(`   ├─ Template ID: ${ruleData.templateId || 'NOT SET'}`);
            console.log(`   ├─ Schedule Time: ${ruleData.schedule?.time || 'NOT SET'}`);
            console.log(`   ├─ Schedule Frequency: ${ruleData.schedule?.frequency || 'NOT SET'}`);
            console.log(`   ├─ Last Run: ${ruleData.lastRun ? new Date(ruleData.lastRun.seconds * 1000).toLocaleString() : 'Never'}`);
            
            // Check if rule should execute now
            const shouldExecute = checkIfRuleShouldExecute(ruleData, now);
            console.log(`   └─ Should Execute Now: ${shouldExecute ? '✅ YES' : '❌ NO'}`);
            
            if (!shouldExecute) {
              console.log(`      Reason: ${getReasonWhyNotExecuting(ruleData, now)}`);
            }
          });
          
          console.log('\n');
        }
      } catch (error) {
        console.log(`Error checking user ${userId}: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

function checkIfRuleShouldExecute(rule, now) {
  // Check if enabled
  if (!rule.enabled) {
    return false;
  }
  
  // Check template ID
  if (!rule.templateId || rule.templateId === "NOT SET") {
    return false;
  }
  
  // Check schedule time
  if (!rule.schedule?.time) {
    return false;
  }
  
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  const ruleTime = rule.schedule.time;
  
  // Exact time match
  if (currentTime === ruleTime) {
    return checkFrequency(rule, now);
  }
  
  // Grace period check (5 minutes)
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [ruleHour, ruleMinute] = ruleTime.split(':').map(Number);
  const ruleMinutes = ruleHour * 60 + ruleMinute;
  
  const timeDifference = Math.abs(currentMinutes - ruleMinutes);
  const gracePeriodMinutes = 5; // Default grace period
  
  if (timeDifference <= gracePeriodMinutes) {
    return checkFrequency(rule, now);
  }
  
  return false;
}

function checkFrequency(rule, now) {
  if (rule.schedule.frequency === 'daily') {
    return true;
  } else if (rule.schedule.frequency === 'weekly') {
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return rule.schedule.daysOfWeek?.includes(dayOfWeek) || false;
  }
  
  return false;
}

function getReasonWhyNotExecuting(rule, now) {
  if (!rule.enabled) {
    return 'Rule is disabled';
  }
  
  if (!rule.templateId || rule.templateId === "NOT SET") {
    return 'Template ID is missing or NOT SET';
  }
  
  if (!rule.schedule?.time) {
    return 'Schedule time is not set';
  }
  
  const currentTime = now.toTimeString().slice(0, 5);
  const ruleTime = rule.schedule.time;
  
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [ruleHour, ruleMinute] = ruleTime.split(':').map(Number);
  const ruleMinutes = ruleHour * 60 + ruleMinute;
  
  const timeDifference = Math.abs(currentMinutes - ruleMinutes);
  
  if (currentTime !== ruleTime && timeDifference > 5) {
    return `Time mismatch - Current: ${currentTime}, Rule: ${ruleTime} (${timeDifference} min difference)`;
  }
  
  if (rule.schedule.frequency === 'weekly') {
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    if (!rule.schedule.daysOfWeek?.includes(dayOfWeek)) {
      return `Weekly frequency - today (${dayOfWeek}) not in allowed days: ${rule.schedule.daysOfWeek?.join(', ') || 'none'}`;
    }
  }
  
  return 'Unknown reason';
}

debugAutomationProcessing().then(() => {
  console.log('🏁 Debug complete');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
