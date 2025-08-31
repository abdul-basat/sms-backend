/**
 * Simple Routes Test
 */

const express = require('express');
const router = express.Router();

// Import the controller exactly as in the routes file
const { 
  createPaymentTransaction,
  getPaymentTransactions,
  getPaymentTransactionById,
  createInstallmentPlan,
  getInstallmentPlans
} = require('./src/controllers/paymentController');

console.log('After destructuring:');
console.log('createPaymentTransaction:', typeof createPaymentTransaction);
console.log('getPaymentTransactions:', typeof getPaymentTransactions);

// Try to add a simple route
try {
  router.post('/test', createPaymentTransaction);
  console.log('✅ Route creation successful');
} catch (error) {
  console.log('❌ Route creation failed:', error.message);
}

module.exports = router;
