console.log('Script starting...');

import admin from 'firebase-admin';
import dotenv from 'dotenv';

console.log('Imports loaded');

// Load environment variables
dotenv.config();

console.log('Environment loaded, Firebase project:', process.env.FIREBASE_PROJECT_ID);

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  console.log('Initializing Firebase...');
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID || "fees-manager-47e19",
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
  };
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase initialized');
}

const db = admin.firestore();
console.log('Firestore initialized');

// Test simple query
console.log('Testing Firestore connection...');
db.collection('users').limit(1).get()
  .then(snapshot => {
    console.log('✅ Firestore connected successfully');
    console.log('User count test:', snapshot.size);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Firestore error:', error);
    process.exit(1);
  });
