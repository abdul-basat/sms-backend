const controller = require('./src/controllers/paymentController');

console.log('Available functions:');
console.log(Object.keys(controller));

console.log('\nTesting createPaymentTransaction:');
console.log(typeof controller.createPaymentTransaction);

const { createPaymentTransaction } = controller;
console.log('Destructured createPaymentTransaction:', typeof createPaymentTransaction);

// Test the exact same imports as in the routes file
const { 
  createPaymentTransaction: createPaymentTransaction2,
  getPaymentTransactions,
  getPaymentTransactionById,
  createInstallmentPlan,
  getInstallmentPlans
} = require('./src/controllers/paymentController');

console.log('\nAll destructured functions:');
console.log('createPaymentTransaction2:', typeof createPaymentTransaction2);
console.log('getPaymentTransactions:', typeof getPaymentTransactions);
console.log('getPaymentTransactionById:', typeof getPaymentTransactionById);
console.log('createInstallmentPlan:', typeof createInstallmentPlan);
console.log('getInstallmentPlans:', typeof getInstallmentPlans);
