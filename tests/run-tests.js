#!/usr/bin/env node

/**
 * API Test Runner Script
 * Provides easy test execution with detailed reporting
 */

const { execSync } = require('child_process');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n${description}`, 'cyan');
  log('='.repeat(50), 'blue');
  
  try {
    execSync(command, { 
      stdio: 'inherit', 
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' }
    });
    log(`✅ ${description} completed successfully!`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description} failed!`, 'red');
    return false;
  }
}

function showMenu() {
  log('\n🧪 API Testing Suite', 'bright');
  log('==================', 'blue');
  log('1. Run All Tests', 'yellow');
  log('2. Run Health Tests', 'yellow');
  log('3. Run Authentication Tests', 'yellow');
  log('4. Run Organization Tests', 'yellow');
  log('5. Run Student Tests', 'yellow');
  log('6. Run User Tests', 'yellow');
  log('7. Run Integration Tests', 'yellow');
  log('8. Run Tests with Coverage', 'yellow');
  log('9. Run Tests in Watch Mode', 'yellow');
  log('10. Run CI Tests', 'yellow');
  log('0. Exit', 'red');
  log('==================', 'blue');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    function askChoice() {
      showMenu();
      rl.question('\nSelect an option (0-10): ', (choice) => {
        handleChoice(choice, rl);
      });
    }

    askChoice();
  } else {
    // Command line mode
    const choice = args[0];
    handleChoice(choice);
  }
}

function handleChoice(choice, rl = null) {
  let success = true;

  switch (choice) {
    case '1':
      success = runCommand('npm test', 'Running All API Tests');
      break;
    case '2':
      success = runCommand('npm run test:health', 'Running Health Endpoint Tests');
      break;
    case '3':
      success = runCommand('npm run test:auth', 'Running Authentication Tests');
      break;
    case '4':
      success = runCommand('npm run test:organizations', 'Running Organization Tests');
      break;
    case '5':
      success = runCommand('npm run test:students', 'Running Student Tests');
      break;
    case '6':
      success = runCommand('npm run test:users', 'Running User Tests');
      break;
    case '7':
      success = runCommand('npm run test:integration', 'Running Integration Tests');
      break;
    case '8':
      success = runCommand('npm run test:coverage', 'Running Tests with Coverage Report');
      break;
    case '9':
      success = runCommand('npm run test:watch', 'Running Tests in Watch Mode');
      break;
    case '10':
      success = runCommand('npm run test:ci', 'Running CI Tests');
      break;
    case '0':
      log('\n👋 Goodbye!', 'cyan');
      if (rl) rl.close();
      process.exit(0);
      break;
    default:
      log('\n❌ Invalid choice. Please select 0-10.', 'red');
      break;
  }

  if (rl) {
    // Interactive mode - ask for next choice
    setTimeout(() => {
      log('\nPress Enter to continue...', 'yellow');
      rl.question('', () => {
        handleChoice('menu', rl);
      });
    }, 1000);
  } else {
    // Command line mode - exit with appropriate code
    process.exit(success ? 0 : 1);
  }
}

// Add menu option
if (process.argv.includes('menu') || process.argv.includes('--interactive')) {
  main();
} else {
  // Check if we need to show the menu
  if (process.argv.length === 2) {
    main();
  } else {
    const choice = process.argv[2];
    handleChoice(choice);
  }
}

module.exports = { runCommand, handleChoice };
