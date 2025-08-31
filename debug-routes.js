console.log('Step 1: Testing express');
const express = require('express');
console.log('Express loaded');

console.log('Step 2: Testing controller import');
const controller = require('./src/controllers/paymentController');
console.log('Controller loaded, functions:', Object.keys(controller));

console.log('Step 3: Testing destructuring');
const { 
  createPaymentTransaction,
  getPaymentTransactions,
  getPaymentTransactionById,
  createInstallmentPlan,
  getInstallmentPlans
} = controller;

console.log('Step 4: Testing function types');
console.log('createPaymentTransaction:', typeof createPaymentTransaction);
console.log('getPaymentTransactions:', typeof getPaymentTransactions);
console.log('getPaymentTransactionById:', typeof getPaymentTransactionById);
console.log('createInstallmentPlan:', typeof createInstallmentPlan);
console.log('getInstallmentPlans:', typeof getInstallmentPlans);

console.log('Step 5: Testing middleware imports');
const { authenticateToken } = require('./src/middleware/auth');
const { validateRequest } = require('./src/middleware/validation');
console.log('Middleware loaded');

console.log('Step 6: Testing router creation');
const router = express.Router();
console.log('Router created');

console.log('Step 7: Testing router.post with function');
try {
  router.post('/test', createPaymentTransaction);
  console.log('Router.post worked successfully');
} catch (error) {
  console.error('Router.post failed:', error.message);
}
