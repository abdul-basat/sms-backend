/**
 * Test Firebase Connection
 */

require('dotenv').config();
const { initializeFirebase, getFirestore } = require('./src/config/firebase');

async function testFirebaseConnection() {
  console.log('🔍 Testing Firebase Connection...\n');
  
  try {
    console.log('1. Environment Variables:');
    console.log(`   PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log(`   CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL}`);
    console.log(`   PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? 'Set (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'Not set'}`);
    
    console.log('\n2. Initializing Firebase...');
    await initializeFirebase();
    
    console.log('\n3. Testing Database Connection...');
    const db = getFirestore();
    
    console.log('4. Testing simple query...');
    // Test with a simple query to a collection that should exist
    const testQuery = db.collection('test').limit(1);
    const snapshot = await testQuery.get();
    
    console.log(`   ✅ Query successful! Found ${snapshot.size} documents`);
    console.log(`   📊 Query metadata: ${JSON.stringify({
      fromCache: snapshot.metadata.fromCache,
      hasPendingWrites: snapshot.metadata.hasPendingWrites
    })}`);
    
    console.log('\n5. Testing organizations collection...');
    try {
      const orgsQuery = db.collection('organizations').limit(1);
      const orgsSnapshot = await orgsQuery.get();
      console.log(`   ✅ Organizations query successful! Found ${orgsSnapshot.size} organizations`);
    } catch (orgError) {
      console.log(`   ⚠️ Organizations query failed: ${orgError.message}`);
    }
    
    console.log('\n✅ Firebase connection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Firebase connection test failed:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  process.exit(0);
}

testFirebaseConnection();
