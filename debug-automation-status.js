/**
 * Debug script to check automation system status
 */

require('dotenv').config();
const AutomationScheduler = require('./src/schedulers/automationScheduler');
const AutomatedFeeNotificationsService = require('./src/services/automatedFeeNotificationsService');
const HumanBehaviorService = require('./src/services/humanBehaviorService');
const logger = require('./src/utils/logger');

async function debugAutomationStatus() {
  console.log('🔍 Debugging Automation System Status...\n');
  
  try {
    // 0. Initialize Firebase first
    console.log('0. Initializing Firebase...');
    const { initializeFirebase } = require('./src/config/firebase');
    await initializeFirebase();
    console.log('   ✅ Firebase initialized successfully');
    
    // 1. Check if automation scheduler can be initialized
    console.log('1. Checking AutomationScheduler...');
    const scheduler = new AutomationScheduler();
    console.log('   ✅ AutomationScheduler can be initialized');
    
    // 2. Check fee notifications service
    console.log('\n2. Checking AutomatedFeeNotificationsService...');
    const feeService = new AutomatedFeeNotificationsService();
    console.log('   ✅ AutomatedFeeNotificationsService can be initialized');
    
    // 3. Check business hours logic
    console.log('\n3. Testing Business Hours Logic...');
    const humanBehavior = new HumanBehaviorService();
    
    const testBusinessHours = {
      startTime: '09:00',
      endTime: '17:00',
      daysOfWeek: [1, 2, 3, 4, 5] // Monday to Friday
    };
    
    const timezone = 'Asia/Karachi';
    const isWithinHours = humanBehavior.isWithinBusinessHours(timezone, testBusinessHours);
    
    const now = new Date();
    const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    
    console.log(`   Current time in ${timezone}: ${userTime.toLocaleString()}`);
    console.log(`   Is within business hours: ${isWithinHours}`);
    console.log(`   Business hours: ${testBusinessHours.startTime} - ${testBusinessHours.endTime}`);
    console.log(`   Business days: ${testBusinessHours.daysOfWeek.join(', ')} (1=Mon, 7=Sun)`);
    console.log(`   Current day: ${userTime.getDay()} (0=Sun, 6=Sat)`);
    
    // 4. Check environment variables
    console.log('\n4. Checking Environment Variables...');
    console.log(`   TZ: ${process.env.TZ || 'not set'}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`   PORT: ${process.env.PORT || 'not set'}`);
    console.log(`   FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? 'set' : 'not set'}`);
    console.log(`   REDIS_URL: ${process.env.REDIS_URL ? 'set' : 'not set'}`);
    
    // 5. Test a manual fee reminder check
    console.log('\n5. Testing Manual Fee Reminder Check...');
    
    // Debug: Check if db is accessible
    const { db } = require('./src/config/firebase');
    console.log(`   DB status: ${db ? 'available' : 'null'}`);
    if (db) {
      console.log(`   DB type: ${typeof db}`);
      console.log(`   DB constructor: ${db.constructor.name}`);
    }
    
    try {
      const result = await feeService.checkAndSendDueDateReminders();
      console.log('   Manual check result:', result);
    } catch (error) {
      console.log('   ❌ Manual check failed:', error.message);
    }
    
    console.log('\n✅ Automation Status Check Complete!');
    
  } catch (error) {
    console.error('❌ Automation debug failed:', error);
  }
}

// Run the debug
debugAutomationStatus().then(() => {
  console.log('\n🔍 Debug completed. Check the output above for issues.');
  process.exit(0);
}).catch(error => {
  console.error('Debug script failed:', error);
  process.exit(1);
});
