# Fees Manager Backend

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Firebase credentials

# Start development server
pnpm run dev

# Start production server
pnpm start

# Run tests
pnpm test
```

## Available Scripts

- `pnpm start` - Start production server
- `pnpm run dev` - Start development server with nodemon
- `pnpm run dev:scheduler` - Start scheduler service only
- `pnpm test` - Run tests
- `pnpm run test:watch` - Run tests in watch mode

## API Endpoints

### Authentication
- `POST /api/auth/verify-token` - Verify Firebase token
- `GET /api/auth/user` - Get current user
- `PUT /api/auth/user` - Update current user

### Organizations
- `GET /api/organizations` - List organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations/:id` - Get organization
- `PUT /api/organizations/:id` - Update organization
- `GET /api/organizations/:id/stats` - Get organization stats

### Users
- `GET /api/users` - List users (admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id/role` - Update user role

### Students
- `GET /api/students` - List students
- `POST /api/students` - Create student
- `GET /api/students/:id` - Get student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

### Health
- `GET /api/health` - Health check

## Environment Variables

See `.env.example` for required environment variables.

## Architecture

- **Express.js** - Web framework
- **Firebase Admin** - Authentication & database
- **Redis** - Caching & queues
- **Bull Queue** - Job processing
- **Winston** - Logging

## 🚀 Features

### **Multi-Tenant Backend**
- ✅ **Organization Management** - Complete multi-tenant organization support
- ✅ **Role-Based Authentication** - Firebase Auth with custom claims
- ✅ **Permission System** - Granular permission control
- ✅ **API Rate Limiting** - Production-ready rate limiting
- ✅ **Request Validation** - Comprehensive input validation

### **WhatsApp Automation** (Preserved)
- ✅ **Scheduled Message Sending** - Automated WhatsApp messages based on configurable rules
- ✅ **Intelligent Student Filtering** - Target students based on payment status, due dates, classes, and courses
- ✅ **Template System** - Dynamic message templates with student data placeholders
- ✅ **Rate Limiting** - Configurable hourly/daily limits and business hours
- ✅ **Retry Logic** - Automatic retry with exponential backoff for failed messages

### **Infrastructure**
- ✅ **Redis Queue System** - Reliable message queuing with Bull Queue
- ✅ **Firebase Integration** - Real-time data synchronization with Firestore
- ✅ **WPPConnect Integration** - WhatsApp API communication
- ✅ **Docker Support** - Containerized deployment with Docker Compose
- ✅ **Health Monitoring** - Built-in health checks and monitoring

### **Advanced Features**
- ✅ **Business Hours** - Respect business hours and non-working days
- ✅ **Message Delays** - Configurable delays between messages
- ✅ **Comprehensive Logging** - Winston-based logging with file rotation
- ✅ **Data Validation** - Input validation and sanitization
- ✅ **Graceful Shutdown** - Proper signal handling and cleanup

## Development

The backend is designed to work with your existing frontend and provides:
- Multi-tenant organization support
- Role-based authentication
- WhatsApp automation (existing functionality preserved)
- Production-ready error handling and logging

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Automation    │    │   WPPConnect    │
│   (React App)   │◄──►│   Backend       │◄──►│   Server        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Redis Queue   │
                       │   (Bull Queue)  │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Firebase      │
                       │   Firestore     │
                       └─────────────────┘
```

### **Service Components**

1. **Automation Scheduler** - Manages cron jobs and rule execution
2. **WPPConnect Client** - Handles WhatsApp API communication
3. **Firebase Service** - Manages data operations and caching
4. **Queue Service** - Handles message queuing and processing
5. **Rate Limit Service** - Enforces rate limiting rules
6. **Logger Service** - Comprehensive logging and monitoring

## 📋 Prerequisites

### **System Requirements**
- Node.js 18+ 
- Docker & Docker Compose
- Redis 7+
- DigitalOcean Droplet (or similar VPS)

### **External Services**
- **Firebase Project** - For data storage and authentication
- **WPPConnect Server** - For WhatsApp API access
- **Redis Server** - For message queuing and rate limiting

## 🛠️ Installation

### **1. Clone the Repository**
```bash
git clone <your-repo-url>
cd fees-manager-automation
```

### **2. Install Dependencies**
```bash
# Using pnpm (recommended)
pnpm install

# Using pnpm (required)
pnpm install
```

### **3. Environment Configuration**
```bash
# Copy environment template
cp docker/env.example .env

# Edit environment variables
nano .env
```

### **4. Configure Firebase**
1. Create a Firebase project
2. Generate service account key
3. Update Firebase credentials in `.env`

### **5. Configure WPPConnect**
1. Set up WPPConnect server URL
2. Configure session ID
3. Test connection

## 🚀 Deployment

### **Local Development**
```bash
# Start Redis (if not running)
docker run -d -p 6379:6379 redis:7-alpine

# Start the application
pnpm run dev
```

### **Production Deployment**
```bash
# Using Docker Compose
cd docker
docker-compose up -d

# Using deployment script
./scripts/deploy.sh -i YOUR_DROPLET_IP -k ~/.ssh/id_rsa
```

### **Manual Deployment**
```bash
# Build Docker image
docker build -f docker/Dockerfile -t fees-manager-automation .

# Run with Docker Compose
docker-compose -f docker/docker-compose.yml up -d
```

## ⚙️ Configuration

### **Environment Variables**

#### **Core Configuration**
```bash
NODE_ENV=production
TZ=Asia/Karachi
LOG_LEVEL=info
```

#### **Redis Configuration**
```bash
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DATABASE=0
```

#### **WPPConnect Configuration**
```bash
WPPCONNECT_SERVER_URL=http://wppconnect-server:8080
WPPCONNECT_SESSION_ID=default
WPPCONNECT_TIMEOUT=30000
```

#### **Firebase Configuration**
```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@project.iam.gserviceaccount.com
```

### **Automation Rules**

Create automation rules in Firebase with the following structure:

```javascript
{
  "id": "rule-001",
  "name": "Overdue Students Reminder",
  "description": "Send reminders to overdue students",
  "enabled": true,
  "templateId": "template-001",
  "schedule": {
    "time": "09:00",
    "frequency": "daily",
    "timezone": "Asia/Karachi"
  },
  "criteria": {
    "paymentStatus": "overdue",
    "dueDate": {
      "condition": "overdue"
    }
  }
}
```

### **Message Templates**

Create message templates with placeholders:

```javascript
{
  "id": "template-001",
  "name": "Overdue Payment Reminder",
  "content": "Hello {name}, your payment of {amount} for {course} is overdue. Please contact us immediately.",
  "enabled": true
}
```

## 📊 Monitoring & Logs

### **Health Checks**
```bash
# Check application health
curl http://localhost:3000/health

# Check via Docker
docker-compose exec fees-manager-automation node src/scheduler.js health
```

### **Logs**
```bash
# View application logs
docker-compose logs -f fees-manager-automation

# View specific log files
tail -f logs/automation.log
tail -f logs/error.log
```

### **Redis Monitoring**
```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Monitor queue
docker-compose exec redis redis-cli MONITOR
```

## 🔧 Management Commands

### **Application Commands**
```bash
# Start application
node src/scheduler.js start

# Stop application
node src/scheduler.js stop

# Check status
node src/scheduler.js status

# Health check
node src/scheduler.js health

# Test mode
node src/scheduler.js test
```

### **Docker Commands**
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart application
docker-compose restart fees-manager-automation

# View logs
docker-compose logs -f

# Update and rebuild
docker-compose up -d --build
```

## 🧪 Testing

### **Unit Tests**
```bash
# Run tests
pnpm test

# Run with coverage
pnpm run test:coverage
```

### **Integration Tests**
```bash
# Test WPPConnect connection
pnpm run test:wppconnect

# Test Firebase connection
pnpm run test:firebase

# Test Redis connection
pnpm run test:redis
```

### **Load Testing**
```bash
# Test message processing
pnpm run test:load

# Test rate limiting
pnpm run test:rate-limit
```

## 🔍 Troubleshooting

### **Common Issues**

#### **WPPConnect Connection Failed**
```bash
# Check WPPConnect server status
curl http://wppconnect-server:8080/health

# Check session status
curl http://wppconnect-server:8080/api/sessions
```

#### **Redis Connection Issues**
```bash
# Check Redis status
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

#### **Firebase Authentication Error**
```bash
# Verify service account key
node -e "console.log(process.env.FIREBASE_PRIVATE_KEY)"

# Test Firebase connection
pnpm run test:firebase
```

### **Debug Mode**
```bash
# Enable debug logging
LOG_LEVEL=debug pnpm start

# View debug logs
tail -f logs/combined.log | grep DEBUG
```

## 📈 Performance

### **Optimization Tips**

1. **Redis Configuration**
   - Use Redis persistence for data durability
   - Configure appropriate memory limits
   - Enable Redis monitoring

2. **Queue Management**
   - Monitor queue length and processing times
   - Adjust concurrency settings based on load
   - Implement dead letter queues for failed messages

3. **Firebase Optimization**
   - Use Firebase caching for frequently accessed data
   - Implement batch operations for bulk updates
   - Monitor Firestore usage and costs

4. **Resource Management**
   - Monitor CPU and memory usage
   - Implement proper error handling and retries
   - Use connection pooling for external services

## 🔐 Security

### **Best Practices**

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use strong, unique passwords for all services
   - Rotate API keys regularly

2. **Network Security**
   - Use VPN or private networks for service communication
   - Implement proper firewall rules
   - Use SSL/TLS for all external communications

3. **Access Control**
   - Implement proper authentication and authorization
   - Use service accounts with minimal required permissions
   - Monitor and log all access attempts

## 🤝 Contributing

### **Development Setup**
```bash
# Fork the repository
git clone <your-fork-url>
cd fees-manager-automation

# Install dependencies
pnpm install

# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
pnpm test

# Commit and push
git commit -m "Add your feature"
git push origin feature/your-feature
```

### **Code Standards**
- Follow ESLint configuration
- Write unit tests for new features
- Update documentation for API changes
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### **Documentation**
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- [API Documentation](docs/API.md)

### **Issues**
- Report bugs via GitHub Issues
- Request features via GitHub Discussions
- Check existing issues before creating new ones

### **Community**
- Join our Discord server
- Follow our blog for updates
- Subscribe to our newsletter

---

**Made with ❤️ for the Fees Manager Community**
#   s m s - b a c k e n d  
 