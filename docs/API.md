# Fees Manager WhatsApp Automation - API Documentation

Comprehensive API documentation for the Fees Manager WhatsApp Automation backend services.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Application Commands](#application-commands)
3. [Service APIs](#service-apis)
4. [Data Models](#data-models)
5. [Error Handling](#error-handling)
6. [Examples](#examples)

---

## 🎯 Overview

The Fees Manager WhatsApp Automation backend provides a comprehensive API for managing automated WhatsApp messaging. The system is built with Node.js and uses various services for different functionalities.

### **Architecture**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Commands  │    │   Service APIs  │    │   External APIs │
│   (scheduler.js)│◄──►│   (Services)    │◄──►│   (Firebase,    │
└─────────────────┘    └─────────────────┘    │   WPPConnect)   │
                                             └─────────────────┘
```

### **Core Services**
- **AutomationService** - Main orchestration service
- **WPPConnectClient** - WhatsApp API communication
- **FirebaseService** - Data storage and retrieval
- **QueueService** - Message queuing and processing
- **RateLimitService** - Rate limiting enforcement
- **LoggerService** - Logging and monitoring

---

## 🔧 Application Commands

### **Main Application Interface**

The application is controlled through the main scheduler script with various commands:

```bash
# Start the automation service
node src/scheduler.js start

# Stop the automation service
node src/scheduler.js stop

# Check application status
node src/scheduler.js status

# Run health check
node src/scheduler.js health

# Run in test mode
node src/scheduler.js test
```

### **Command Reference**

#### **Start Command**
```bash
node src/scheduler.js start
```
**Description**: Starts the automation scheduler and all services
**Returns**: Application startup status
**Example Output**:
```json
{
  "status": "started",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "automation": "running",
    "redis": "connected",
    "firebase": "connected",
    "wppconnect": "connected"
  }
}
```

#### **Stop Command**
```bash
node src/scheduler.js stop
```
**Description**: Gracefully stops the automation scheduler
**Returns**: Application shutdown status
**Example Output**:
```json
{
  "status": "stopped",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "message": "Graceful shutdown completed"
}
```

#### **Status Command**
```bash
node src/scheduler.js status
```
**Description**: Returns current application status
**Returns**: Detailed status information
**Example Output**:
```json
{
  "application": {
    "name": "fees-manager-automation",
    "version": "1.0.0",
    "running": true,
    "pid": 12345,
    "uptime": 3600,
    "memory": {
      "rss": 52428800,
      "heapTotal": 20971520,
      "heapUsed": 10485760
    }
  },
  "scheduler": {
    "status": "running",
    "lastRun": "2024-01-01T09:00:00.000Z",
    "nextRun": "2024-01-01T10:00:00.000Z",
    "rulesProcessed": 5,
    "messagesSent": 25
  },
  "services": {
    "redis": "connected",
    "firebase": "connected",
    "wppconnect": "connected"
  },
  "timestamp": "2024-01-01T09:30:00.000Z"
}
```

#### **Health Command**
```bash
node src/scheduler.js health
```
**Description**: Performs comprehensive health check
**Returns**: Health status with detailed service information
**Example Output**:
```json
{
  "status": "healthy",
  "application": {
    "running": true,
    "uptime": 3600,
    "memory": "50MB"
  },
  "services": {
    "redis": {
      "status": "connected",
      "latency": "2ms",
      "memory": "10MB"
    },
    "firebase": {
      "status": "connected",
      "latency": "150ms",
      "collections": 7
    },
    "wppconnect": {
      "status": "connected",
      "session": "fees-manager-session",
      "latency": "50ms"
    }
  },
  "automation": {
    "rules": 5,
    "activeRules": 3,
    "lastExecution": "2024-01-01T09:00:00.000Z",
    "messagesQueued": 0,
    "messagesFailed": 0
  },
  "timestamp": "2024-01-01T09:30:00.000Z"
}
```

#### **Test Command**
```bash
node src/scheduler.js test
```
**Description**: Runs comprehensive tests
**Returns**: Test results
**Example Output**:
```json
{
  "status": "completed",
  "tests": {
    "services": {
      "redis": "passed",
      "firebase": "passed",
      "wppconnect": "passed"
    },
    "automation": {
      "rules": "passed",
      "templates": "passed",
      "queue": "passed"
    },
    "integration": {
      "messageSending": "passed",
      "rateLimiting": "passed"
    }
  },
  "duration": "5000ms",
  "timestamp": "2024-01-01T09:30:00.000Z"
}
```

---

## 🔌 Service APIs

### **AutomationService**

The main orchestration service that coordinates all automation activities.

#### **Methods**

##### **getAutomationRules()**
```javascript
const { AutomationService } = require('./src/services/automationService');
const service = new AutomationService();

service.getAutomationRules()
  .then(rules => console.log(rules))
  .catch(error => console.error(error));
```
**Returns**: `Promise<AutomationRule[]>`
**Description**: Retrieves all automation rules from Firebase

##### **executeAutomationRule(ruleId)**
```javascript
service.executeAutomationRule('rule-001')
  .then(result => console.log(result))
  .catch(error => console.error(error));
```
**Parameters**:
- `ruleId` (string): ID of the automation rule to execute

**Returns**: `Promise<ExecutionResult>`
**Description**: Executes a specific automation rule

##### **getStatus()**
```javascript
service.getStatus()
  .then(status => console.log(status))
  .catch(error => console.error(error));
```
**Returns**: `Promise<ServiceStatus>`
**Description**: Returns current service status

### **WPPConnectClient**

Handles all WhatsApp API communication through WPPConnect.

#### **Methods**

##### **sendMessage(number, message)**
```javascript
const { WPPConnectClient } = require('./src/services/wppconnectClient');
const client = new WPPConnectClient();

client.sendMessage('1234567890', 'Hello from automation!')
  .then(result => console.log(result))
  .catch(error => console.error(error));
```
**Parameters**:
- `number` (string): Phone number with country code
- `message` (string): Message content

**Returns**: `Promise<MessageResult>`
**Description**: Sends a WhatsApp message

##### **getSessionStatus()**
```javascript
client.getSessionStatus()
  .then(status => console.log(status))
  .catch(error => console.error(error));
```
**Returns**: `Promise<SessionStatus>`
**Description**: Returns current session status

##### **testConnection()**
```javascript
client.testConnection()
  .then(result => console.log(result))
  .catch(error => console.error(error));
```
**Returns**: `Promise<ConnectionTest>`
**Description**: Tests connection to WPPConnect server

### **FirebaseService**

Manages all Firebase Firestore operations.

#### **Methods**

##### **getStudents()**
```javascript
const { FirebaseService } = require('./src/services/firebaseService');
const service = new FirebaseService();

service.getStudents()
  .then(students => console.log(students))
  .catch(error => console.error(error));
```
**Returns**: `Promise<Student[]>`
**Description**: Retrieves all students from Firestore

##### **getAutomationRules()**
```javascript
service.getAutomationRules()
  .then(rules => console.log(rules))
  .catch(error => console.error(error));
```
**Returns**: `Promise<AutomationRule[]>`
**Description**: Retrieves all automation rules

##### **getMessageTemplates()**
```javascript
service.getMessageTemplates()
  .then(templates => console.log(templates))
  .catch(error => console.error(error));
```
**Returns**: `Promise<MessageTemplate[]>`
**Description**: Retrieves all message templates

##### **logMessageDelivery(messageLog)**
```javascript
const messageLog = {
  id: 'msg-001',
  studentId: 'student-001',
  ruleId: 'rule-001',
  templateId: 'template-001',
  phoneNumber: '1234567890',
  message: 'Hello!',
  status: 'sent',
  sentAt: new Date(),
  deliveredAt: new Date()
};

service.logMessageDelivery(messageLog)
  .then(result => console.log(result))
  .catch(error => console.error(error));
```
**Parameters**:
- `messageLog` (MessageLog): Message delivery log object

**Returns**: `Promise<boolean>`
**Description**: Logs message delivery status

### **QueueService**

Manages message queuing and processing using Bull Queue.

#### **Methods**

##### **addMessageJob(messageData)**
```javascript
const { QueueService } = require('./src/services/queueService');
const service = new QueueService();

const messageData = {
  phoneNumber: '1234567890',
  message: 'Hello from automation!',
  ruleId: 'rule-001',
  studentId: 'student-001'
};

service.addMessageJob(messageData)
  .then(job => console.log(job.id))
  .catch(error => console.error(error));
```
**Parameters**:
- `messageData` (MessageData): Message data object

**Returns**: `Promise<Job>`
**Description**: Adds a message to the processing queue

##### **getQueueStats()**
```javascript
service.getQueueStats()
  .then(stats => console.log(stats))
  .catch(error => console.error(error));
```
**Returns**: `Promise<QueueStats>`
**Description**: Returns queue statistics

##### **clearQueue()**
```javascript
service.clearQueue()
  .then(result => console.log(result))
  .catch(error => console.error(error));
```
**Returns**: `Promise<boolean>`
**Description**: Clears all pending jobs from the queue

### **RateLimitService**

Enforces rate limiting rules and business hours.

#### **Methods**

##### **checkRateLimit()**
```javascript
const { RateLimitService } = require('./src/services/rateLimitService');
const service = new RateLimitService();

service.checkRateLimit()
  .then(allowed => console.log(allowed))
  .catch(error => console.error(error));
```
**Returns**: `Promise<boolean>`
**Description**: Checks if message sending is allowed

##### **isWithinBusinessHours()**
```javascript
service.isWithinBusinessHours()
  .then(within => console.log(within))
  .catch(error => console.error(error));
```
**Returns**: `Promise<boolean>`
**Description**: Checks if current time is within business hours

##### **getRateLimitStatus()**
```javascript
service.getRateLimitStatus()
  .then(status => console.log(status))
  .catch(error => console.error(error));
```
**Returns**: `Promise<RateLimitStatus>`
**Description**: Returns current rate limiting status

---

## 📊 Data Models

### **AutomationRule**
```javascript
{
  id: string,
  name: string,
  description: string,
  enabled: boolean,
  templateId: string,
  schedule: {
    time: string,        // "HH:MM" format
    frequency: string,   // "daily" | "weekly"
    daysOfWeek: string[], // ["monday", "tuesday", ...]
    timezone: string
  },
  criteria: {
    paymentStatus: string, // "paid" | "unpaid" | "overdue" | "partial"
    dueDate: {
      condition: string,   // "before" | "after" | "overdue"
      days: number
    },
    classId: string,
    courseId: string
  },
  createdAt: Date,
  updatedAt: Date,
  lastRun: Date,
  nextRun: Date,
  runCount: number,
  successCount: number,
  failureCount: number
}
```

### **Student**
```javascript
{
  id: string,
  name: string,
  whatsappNumber: string,
  email: string,
  phone: string,
  classId: string,
  className: string,
  courseId: string,
  courseName: string,
  dueDate: Date,
  amount: number,
  paymentStatus: string, // "paid" | "unpaid" | "overdue" | "partial"
  createdAt: Date,
  updatedAt: Date
}
```

### **MessageTemplate**
```javascript
{
  id: string,
  name: string,
  description: string,
  content: string,
  category: string,
  enabled: boolean,
  createdAt: Date,
  updatedAt: Date,
  usageCount: number,
  successCount: number,
  failureCount: number
}
```

### **MessageLog**
```javascript
{
  id: string,
  studentId: string,
  ruleId: string,
  templateId: string,
  phoneNumber: string,
  message: string,
  status: string,        // "queued" | "sent" | "delivered" | "failed"
  sentAt: Date,
  deliveredAt: Date,
  errorMessage: string,
  retryCount: number
}
```

### **RateLimitStatus**
```javascript
{
  hourlyLimit: {
    current: number,
    max: number,
    remaining: number
  },
  dailyLimit: {
    current: number,
    max: number,
    remaining: number
  },
  businessHours: {
    within: boolean,
    nextOpen: Date
  },
  delayBetweenMessages: {
    lastMessage: Date,
    nextAllowed: Date
  }
}
```

---

## ⚠️ Error Handling

### **Error Types**

#### **ServiceError**
```javascript
{
  type: 'ServiceError',
  service: string,      // "firebase" | "wppconnect" | "redis"
  message: string,
  code: string,
  timestamp: Date
}
```

#### **ValidationError**
```javascript
{
  type: 'ValidationError',
  field: string,
  message: string,
  value: any
}
```

#### **RateLimitError**
```javascript
{
  type: 'RateLimitError',
  limit: string,        // "hourly" | "daily" | "business_hours"
  message: string,
  retryAfter: Date
}
```

### **Error Handling Examples**

#### **Service Error Handling**
```javascript
const { AutomationService } = require('./src/services/automationService');
const service = new AutomationService();

service.executeAutomationRule('rule-001')
  .then(result => {
    console.log('Success:', result);
  })
  .catch(error => {
    if (error.type === 'ServiceError') {
      console.error(`Service error (${error.service}):`, error.message);
    } else if (error.type === 'ValidationError') {
      console.error(`Validation error in ${error.field}:`, error.message);
    } else {
      console.error('Unexpected error:', error.message);
    }
  });
```

#### **Rate Limit Error Handling**
```javascript
const { RateLimitService } = require('./src/services/rateLimitService');
const service = new RateLimitService();

service.checkRateLimit()
  .then(allowed => {
    if (allowed) {
      // Send message
    } else {
      console.log('Rate limit exceeded');
    }
  })
  .catch(error => {
    if (error.type === 'RateLimitError') {
      const retryAfter = new Date(error.retryAfter);
      console.log(`Rate limit exceeded. Retry after: ${retryAfter}`);
    }
  });
```

---

## 💡 Examples

### **Complete Automation Workflow**

```javascript
const { AutomationService } = require('./src/services/automationService');
const { FirebaseService } = require('./src/services/firebaseService');
const { WPPConnectClient } = require('./src/services/wppconnectClient');

async function runAutomation() {
  try {
    // Initialize services
    const automationService = new AutomationService();
    const firebaseService = new FirebaseService();
    const wppClient = new WPPConnectClient();

    // Get automation rules
    const rules = await automationService.getAutomationRules();
    console.log(`Found ${rules.length} automation rules`);

    // Process each rule
    for (const rule of rules) {
      if (!rule.enabled) continue;

      console.log(`Processing rule: ${rule.name}`);

      // Get students matching criteria
      const students = await firebaseService.getStudents();
      const matchingStudents = students.filter(student => 
        automationService.studentMatchesRule(student, rule)
      );

      console.log(`Found ${matchingStudents.length} matching students`);

      // Get message template
      const template = await firebaseService.getMessageTemplate(rule.templateId);
      if (!template || !template.enabled) {
        console.log(`Template not found or disabled: ${rule.templateId}`);
        continue;
      }

      // Send messages to matching students
      for (const student of matchingStudents) {
        try {
          const message = template.formatMessage(student);
          const result = await wppClient.sendMessage(student.whatsappNumber, message);
          
          // Log message delivery
          await firebaseService.logMessageDelivery({
            id: `msg-${Date.now()}`,
            studentId: student.id,
            ruleId: rule.id,
            templateId: template.id,
            phoneNumber: student.whatsappNumber,
            message: message,
            status: result.success ? 'sent' : 'failed',
            sentAt: new Date(),
            errorMessage: result.error || null
          });

          console.log(`Message sent to ${student.name}: ${result.success ? 'Success' : 'Failed'}`);
        } catch (error) {
          console.error(`Error sending message to ${student.name}:`, error.message);
        }
      }
    }

    console.log('Automation workflow completed');
  } catch (error) {
    console.error('Automation workflow failed:', error);
  }
}

// Run automation
runAutomation();
```

### **Health Check Implementation**

```javascript
const { AutomationService } = require('./src/services/automationService');
const { FirebaseService } = require('./src/services/firebaseService');
const { WPPConnectClient } = require('./src/services/wppconnectClient');
const { QueueService } = require('./src/services/queueService');

async function performHealthCheck() {
  const health = {
    status: 'healthy',
    timestamp: new Date(),
    services: {},
    errors: []
  };

  try {
    // Check Firebase
    const firebaseService = new FirebaseService();
    const startTime = Date.now();
    await firebaseService.getStudents();
    const firebaseLatency = Date.now() - startTime;
    
    health.services.firebase = {
      status: 'connected',
      latency: `${firebaseLatency}ms`
    };
  } catch (error) {
    health.services.firebase = { status: 'error', error: error.message };
    health.errors.push(`Firebase: ${error.message}`);
  }

  try {
    // Check WPPConnect
    const wppClient = new WPPConnectClient();
    const sessionStatus = await wppClient.getSessionStatus();
    
    health.services.wppconnect = {
      status: sessionStatus.connected ? 'connected' : 'disconnected',
      session: sessionStatus.sessionId,
      latency: `${sessionStatus.latency}ms`
    };
  } catch (error) {
    health.services.wppconnect = { status: 'error', error: error.message };
    health.errors.push(`WPPConnect: ${error.message}`);
  }

  try {
    // Check Queue
    const queueService = new QueueService();
    const queueStats = await queueService.getQueueStats();
    
    health.services.queue = {
      status: 'operational',
      waiting: queueStats.waiting,
      active: queueStats.active,
      completed: queueStats.completed,
      failed: queueStats.failed
    };
  } catch (error) {
    health.services.queue = { status: 'error', error: error.message };
    health.errors.push(`Queue: ${error.message}`);
  }

  // Determine overall health
  const hasErrors = health.errors.length > 0;
  health.status = hasErrors ? 'unhealthy' : 'healthy';

  return health;
}

// Perform health check
performHealthCheck()
  .then(health => {
    console.log('Health Check Result:', JSON.stringify(health, null, 2));
    process.exit(health.status === 'healthy' ? 0 : 1);
  })
  .catch(error => {
    console.error('Health check failed:', error);
    process.exit(1);
  });
```

---

## 📚 Additional Resources

### **Configuration**
- Environment variables: See `docker/env.example`
- Service configuration: See individual service files
- Logging configuration: See `src/utils/logger.js`

### **Monitoring**
- Application logs: `/opt/fees-manager-automation/logs/`
- Docker logs: `docker-compose logs`
- Redis monitoring: `docker-compose exec redis redis-cli MONITOR`

### **Testing**
- Unit tests: `npm test`
- Integration tests: `npm run test:integration`
- Load tests: `npm run test:load`

---

**🔧 For more detailed information about specific services, refer to the individual service documentation files.**
