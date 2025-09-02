/**
 * Mock Firebase Service for Development
 * Provides fake data to test automation logic
 */

const logger = require('../utils/logger');

class MockFirebaseService {
  constructor() {
    this.collections = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    // Mock organizations with WhatsApp enabled
    this.collections.set('organizations', [
      {
        id: 'org_test_123',
        name: 'Test School',
        whatsappConfig: {
          enabled: true,
          automatedReminders: true,
          businessHours: {
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5]
          }
        },
        reminderConfig: {
          enabled: true,
          reminderDays: [3, 1, 0],
          overdueReminderDays: [1, 3, 7],
          businessHours: {
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5]
          },
          timezone: 'Asia/Karachi',
          organizationName: 'Test School',
          contactInfo: 'contact@testschool.com'
        }
      },
      {
        id: 'org_demo_456',
        name: 'Demo Academy',
        whatsappConfig: {
          enabled: true,
          automatedReminders: false
        }
      }
    ]);

    // Mock students with fee data
    const students = [
      {
        id: 'student_001',
        name: 'Ahmed Ali',
        parentName: 'Ali Ahmed',
        phoneNumber: '+923001234567',
        whatsappNumber: '+923001234567',
        className: '10-A',
        feeAmount: '5000',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
        feeStatus: 'pending'
      },
      {
        id: 'student_002',
        name: 'Sara Khan',
        parentName: 'Khan Sahib',
        phoneNumber: '+923007654321',
        whatsappNumber: '+923007654321',
        className: '9-B',
        feeAmount: '4500',
        dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day overdue
        feeStatus: 'overdue'
      },
      {
        id: 'student_003',
        name: 'Hassan Malik',
        parentName: 'Malik Ahmed',
        phoneNumber: '+923009876543',
        whatsappNumber: '+923009876543',
        className: '11-C',
        feeAmount: '5500',
        dueDate: new Date().toISOString(), // Due today
        feeStatus: 'pending'
      }
    ];

    this.collections.set('organizations/org_test_123/students', students);
    this.collections.set('organizations/org_demo_456/students', []);
  }

  collection(path) {
    return new MockCollection(path, this.collections);
  }
}

class MockCollection {
  constructor(path, collections) {
    this.path = path;
    this.collections = collections;
    this.whereConditions = [];
    this.limitCount = null;
  }

  where(field, operator, value) {
    this.whereConditions.push({ field, operator, value });
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  doc(id) {
    return new MockDocument(this.path, id, this.collections);
  }

  async get() {
    let data = this.collections.get(this.path) || [];
    
    // Apply where conditions
    this.whereConditions.forEach(condition => {
      const { field, operator, value } = condition;
      data = data.filter(item => {
        const fieldValue = this.getNestedValue(item, field);
        switch (operator) {
          case '==':
            return fieldValue === value;
          case '!=':
            return fieldValue !== value;
          case '>':
            return fieldValue > value;
          case '<':
            return fieldValue < value;
          case '>=':
            return fieldValue >= value;
          case '<=':
            return fieldValue <= value;
          case 'array-contains':
            return Array.isArray(fieldValue) && fieldValue.includes(value);
          default:
            return true;
        }
      });
    });

    // Apply limit
    if (this.limitCount) {
      data = data.slice(0, this.limitCount);
    }

    return new MockQuerySnapshot(data);
  }

  async add(data) {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const docData = { ...data, id };
    
    let collectionData = this.collections.get(this.path) || [];
    collectionData.push(docData);
    this.collections.set(this.path, collectionData);
    
    return {
      id,
      writeTime: new Date()
    };
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }
}

class MockDocument {
  constructor(collectionPath, id, collections) {
    this.collectionPath = collectionPath;
    this.id = id;
    this.collections = collections;
  }

  async get() {
    const data = this.collections.get(this.collectionPath) || [];
    const doc = data.find(item => item.id === this.id);
    
    return {
      exists: !!doc,
      data: () => doc,
      id: this.id
    };
  }

  async set(data) {
    let collectionData = this.collections.get(this.collectionPath) || [];
    const existingIndex = collectionData.findIndex(item => item.id === this.id);
    
    if (existingIndex >= 0) {
      collectionData[existingIndex] = { ...data, id: this.id };
    } else {
      collectionData.push({ ...data, id: this.id });
    }
    
    this.collections.set(this.collectionPath, collectionData);
    return { writeTime: new Date() };
  }

  collection(subcollectionName) {
    const subcollectionPath = `${this.collectionPath}/${this.id}/${subcollectionName}`;
    return new MockCollection(subcollectionPath, this.collections);
  }
}

class MockQuerySnapshot {
  constructor(docs) {
    this.docs = docs.map((doc, index) => ({
      id: doc.id || `doc_${index}`,
      data: () => doc,
      exists: true
    }));
    this.size = docs.length;
    this.empty = docs.length === 0;
    this.metadata = {
      fromCache: false,
      hasPendingWrites: false
    };
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

// Export as a function that returns a mock db instance
module.exports = {
  createMockFirestore: () => new MockFirebaseService(),
  MockFirebaseService
};
