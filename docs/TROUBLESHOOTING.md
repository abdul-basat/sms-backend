# Fees Manager WhatsApp Automation - Troubleshooting Guide

A comprehensive guide to diagnose and resolve common issues with the Fees Manager WhatsApp Automation backend.

## 📋 Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
3. [Service-Specific Problems](#service-specific-problems)
4. [Performance Issues](#performance-issues)
5. [Network & Connectivity](#network--connectivity)
6. [Debug Tools](#debug-tools)
7. [Emergency Procedures](#emergency-procedures)

---

## 🔍 Quick Diagnostics

### **Health Check Commands**

```bash
# 1. Check application health
docker-compose exec fees-manager-automation node src/scheduler.js health

# 2. Check service status
docker-compose ps

# 3. Check system resources
htop
df -h
free -h

# 4. Check recent logs
docker-compose logs --tail=50 fees-manager-automation
tail -f logs/automation.log
tail -f logs/error.log
```

### **Quick Status Check**

```bash
# All services running?
docker-compose ps | grep -E "(Up|Exit)"

# Redis responding?
docker-compose exec redis redis-cli ping

# WPPConnect accessible?
curl -f http://wpp.sprinthon.com:8080/health

# Firebase connection?
docker-compose exec fees-manager-automation node -e "
const admin = require('firebase-admin');
console.log('Firebase connection test...');
"
```

---

## 🚨 Common Issues

### **Issue 1: Application Won't Start**

#### **Symptoms**
- Container exits immediately
- Health check fails
- Application logs show startup errors

#### **Diagnosis**
```bash
# Check startup logs
docker-compose logs fees-manager-automation

# Check environment variables
docker-compose exec fees-manager-automation env | grep -E "(FIREBASE|WPPCONNECT|REDIS)"

# Check file permissions
ls -la /opt/fees-manager-automation/
ls -la /opt/fees-manager-automation/.env
```

#### **Common Causes & Solutions**

**1. Missing Environment Variables**
```bash
# Error: FIREBASE_PROJECT_ID is not defined
# Solution: Check .env file
cat /opt/fees-manager-automation/.env | grep FIREBASE_PROJECT_ID

# If missing, add to .env:
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@project.iam.gserviceaccount.com
```

**2. Invalid Firebase Credentials**
```bash
# Error: Firebase authentication failed
# Solution: Verify service account key
docker-compose exec fees-manager-automation node -e "
const admin = require('firebase-admin');
try {
  admin.initializeApp();
  console.log('✅ Firebase connection successful');
} catch (error) {
  console.log('❌ Firebase error:', error.message);
}
"
```

**3. WPPConnect Connection Failed**
```bash
# Error: Cannot connect to WPPConnect server
# Solution: Test connectivity
curl -v http://wpp.sprinthon.com:8080/health
curl -v http://wpp.sprinthon.com:8080/api/sessions

# Check if session exists
curl http://wpp.sprinthon.com:8080/api/sessions | jq '.[] | select(.id == "fees-manager-session")'
```

**4. Redis Connection Failed**
```bash
# Error: Redis connection refused
# Solution: Check Redis service
docker-compose ps redis
docker-compose logs redis

# Restart Redis if needed
docker-compose restart redis
```

### **Issue 2: Messages Not Sending**

#### **Symptoms**
- Automation runs but no messages sent
- Queue shows jobs but no processing
- No WhatsApp delivery confirmations

#### **Diagnosis**
```bash
# Check automation logs
tail -f logs/automation.log | grep -E "(sending|sent|failed)"

# Check queue status
docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:wait
docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:failed

# Check WPPConnect session status
curl http://wpp.sprinthon.com:8080/api/sessions/fees-manager-session
```

#### **Common Causes & Solutions**

**1. WPPConnect Session Not Connected**
```bash
# Check session status
curl http://wpp.sprinthon.com:8080/api/sessions/fees-manager-session

# If not connected, reconnect:
curl -X POST http://wpp.sprinthon.com:8080/api/sessions/connect \
  -H "Content-Type: application/json" \
  -d '{"session": "fees-manager-session"}'
```

**2. No Matching Students Found**
```bash
# Check automation rules
docker-compose exec fees-manager-automation node -e "
const { AutomationService } = require('./src/services/automationService');
const service = new AutomationService();
service.getAutomationRules().then(rules => {
  console.log('Rules:', rules.length);
  rules.forEach(rule => console.log('-', rule.name, rule.enabled));
});
"

# Check student data
docker-compose exec fees-manager-automation node -e "
const { FirebaseService } = require('./src/services/firebaseService');
const service = new FirebaseService();
service.getStudents().then(students => {
  console.log('Students:', students.length);
  const overdue = students.filter(s => s.paymentStatus === 'overdue');
  console.log('Overdue students:', overdue.length);
});
"
```

**3. Rate Limiting Active**
```bash
# Check rate limiting status
docker-compose exec redis redis-cli GET rate_limit:hourly:$(date +%Y%m%d%H)
docker-compose exec redis redis-cli GET rate_limit:daily:$(date +%Y%m%d)

# Check business hours
docker-compose exec fees-manager-automation node -e "
const { RateLimitService } = require('./src/services/rateLimitService');
const service = new RateLimitService();
console.log('Business hours check:', service.isWithinBusinessHours());
console.log('Hourly limit check:', service.checkHourlyLimit());
console.log('Daily limit check:', service.checkDailyLimit());
"
```

**4. Template Not Found**
```bash
# Check message templates
docker-compose exec fees-manager-automation node -e "
const { FirebaseService } = require('./src/services/firebaseService');
const service = new FirebaseService();
service.getMessageTemplates().then(templates => {
  console.log('Templates:', templates.length);
  templates.forEach(t => console.log('-', t.id, t.name, t.enabled));
});
"
```

### **Issue 3: High Memory Usage**

#### **Symptoms**
- System becomes slow
- Docker containers restart frequently
- Out of memory errors

#### **Diagnosis**
```bash
# Check memory usage
docker stats --no-stream
free -h
htop

# Check Redis memory
docker-compose exec redis redis-cli info memory | grep -E "(used_memory|used_memory_peak)"

# Check log file sizes
du -sh logs/*
ls -lh logs/
```

#### **Solutions**

**1. Optimize Redis Memory**
```bash
# Check Redis configuration
docker-compose exec redis redis-cli CONFIG GET maxmemory
docker-compose exec redis redis-cli CONFIG GET maxmemory-policy

# Set memory limits in redis.conf
echo "maxmemory 512mb" >> docker/redis.conf
echo "maxmemory-policy allkeys-lru" >> docker/redis.conf

# Restart Redis
docker-compose restart redis
```

**2. Implement Log Rotation**
```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/fees-manager-automation << EOF
/opt/fees-manager-automation/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 fees-manager fees-manager
    postrotate
        docker-compose restart fees-manager-automation
    endscript
}
EOF

# Test logrotate
sudo logrotate -f /etc/logrotate.d/fees-manager-automation
```

**3. Clean Docker Resources**
```bash
# Remove unused containers and images
docker system prune -f

# Remove old logs
docker-compose exec fees-manager-automation find logs/ -name "*.log.*" -mtime +7 -delete

# Restart services
docker-compose restart
```

### **Issue 4: Automation Not Triggering**

#### **Symptoms**
- Scheduled automation doesn't run
- No automation logs at expected times
- Rules enabled but no execution

#### **Diagnosis**
```bash
# Check scheduler status
docker-compose exec fees-manager-automation node src/scheduler.js status

# Check cron jobs
docker-compose exec fees-manager-automation ps aux | grep cron

# Check timezone
docker-compose exec fees-manager-automation date
echo $TZ
```

#### **Solutions**

**1. Timezone Issues**
```bash
# Set correct timezone
export TZ=Asia/Karachi
docker-compose exec fees-manager-automation ln -sf /usr/share/zoneinfo/Asia/Karachi /etc/localtime

# Restart application
docker-compose restart fees-manager-automation
```

**2. Cron Job Issues**
```bash
# Check cron logs
docker-compose exec fees-manager-automation tail -f /var/log/cron

# Restart cron service
docker-compose exec fees-manager-automation service cron restart
```

**3. Rule Configuration Issues**
```bash
# Verify rule schedule
docker-compose exec fees-manager-automation node -e "
const { AutomationService } = require('./src/services/automationService');
const service = new AutomationService();
service.getAutomationRules().then(rules => {
  rules.forEach(rule => {
    console.log(\`Rule: \${rule.name}\`);
    console.log(\`  Enabled: \${rule.enabled}\`);
    console.log(\`  Schedule: \${rule.schedule.time} \${rule.schedule.frequency}\`);
    console.log(\`  Next run: \${rule.nextRun}\`);
  });
});
"
```

---

## 🔧 Service-Specific Problems

### **Firebase Issues**

#### **Authentication Errors**
```bash
# Error: Firebase service account key invalid
# Solution: Regenerate service account key
# 1. Go to Firebase Console > Project Settings > Service Accounts
# 2. Click "Generate new private key"
# 3. Download and update .env file

# Test Firebase connection
docker-compose exec fees-manager-automation node -e "
const admin = require('firebase-admin');
try {
  const db = admin.firestore();
  db.collection('test').doc('test').get();
  console.log('✅ Firebase connection successful');
} catch (error) {
  console.log('❌ Firebase error:', error.message);
}
"
```

#### **Permission Errors**
```bash
# Error: Permission denied on Firestore collections
# Solution: Check Firestore security rules

# Test collection access
docker-compose exec fees-manager-automation node -e "
const { FirebaseService } = require('./src/services/firebaseService');
const service = new FirebaseService();

Promise.all([
  service.getAutomationRules(),
  service.getStudents(),
  service.getMessageTemplates()
]).then(([rules, students, templates]) => {
  console.log('✅ All collections accessible');
  console.log('- Rules:', rules.length);
  console.log('- Students:', students.length);
  console.log('- Templates:', templates.length);
}).catch(error => {
  console.log('❌ Collection access error:', error.message);
});
"
```

### **WPPConnect Issues**

#### **Session Management**
```bash
# Check all sessions
curl http://wpp.sprinthon.com:8080/api/sessions

# Create new session if needed
curl -X POST http://wpp.sprinthon.com:8080/api/sessions/add \
  -H "Content-Type: application/json" \
  -d '{"session": "fees-manager-session"}'

# Connect session
curl -X POST http://wpp.sprinthon.com:8080/api/sessions/connect \
  -H "Content-Type: application/json" \
  -d '{"session": "fees-manager-session"}'

# Check session status
curl http://wpp.sprinthon.com:8080/api/sessions/fees-manager-session
```

#### **Message Sending Errors**
```bash
# Test message sending
curl -X POST http://wpp.sprinthon.com:8080/api/sessions/fees-manager-session/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "number": "1234567890",
    "message": "Test message from automation"
  }'

# Check message status
curl http://wpp.sprinthon.com:8080/api/sessions/fees-manager-session/messages
```

### **Redis Issues**

#### **Connection Problems**
```bash
# Check Redis status
docker-compose exec redis redis-cli ping

# Check Redis configuration
docker-compose exec redis redis-cli CONFIG GET bind
docker-compose exec redis redis-cli CONFIG GET port
docker-compose exec redis redis-cli CONFIG GET requirepass

# Restart Redis if needed
docker-compose restart redis
```

#### **Memory Issues**
```bash
# Check Redis memory usage
docker-compose exec redis redis-cli info memory

# Clear Redis cache (if needed)
docker-compose exec redis redis-cli FLUSHALL

# Monitor Redis operations
docker-compose exec redis redis-cli MONITOR
```

---

## ⚡ Performance Issues

### **Slow Message Processing**

#### **Diagnosis**
```bash
# Check queue length
docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:wait
docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:active

# Check processing times
docker-compose exec fees-manager-automation node -e "
const { QueueService } = require('./src/services/queueService');
const service = new QueueService();
service.getQueueStats().then(stats => {
  console.log('Queue stats:', stats);
});
"
```

#### **Solutions**

**1. Increase Concurrency**
```bash
# Update queue concurrency in .env
REDIS_QUEUE_CONCURRENCY=5

# Restart application
docker-compose restart fees-manager-automation
```

**2. Optimize Database Queries**
```bash
# Check Firebase query performance
docker-compose exec fees-manager-automation node -e "
const { FirebaseService } = require('./src/services/firebaseService');
const service = new FirebaseService();

console.time('getStudents');
service.getStudents().then(students => {
  console.timeEnd('getStudents');
  console.log('Students loaded:', students.length);
});
"
```

### **High CPU Usage**

#### **Diagnosis**
```bash
# Check CPU usage
docker stats --no-stream
htop

# Check process details
docker-compose exec fees-manager-automation top
```

#### **Solutions**

**1. Optimize Node.js Settings**
```bash
# Add to Dockerfile or environment
NODE_OPTIONS="--max-old-space-size=512"

# Restart application
docker-compose restart fees-manager-automation
```

**2. Implement Caching**
```bash
# Check cache hit rates
docker-compose exec redis redis-cli info stats | grep -E "(keyspace_hits|keyspace_misses)"

# Enable Firebase caching
FIREBASE_CACHE_ENABLED=true
FIREBASE_CACHE_TTL=300000
```

---

## 🌐 Network & Connectivity

### **DNS Issues**
```bash
# Test DNS resolution
nslookup firestore.googleapis.com
nslookup wpp.sprinthon.com

# Check network connectivity
ping -c 4 firestore.googleapis.com
ping -c 4 wpp.sprinthon.com
```

### **Firewall Issues**
```bash
# Check firewall status
sudo ufw status

# Check blocked connections
sudo ufw status verbose

# Allow required ports
sudo ufw allow out 443  # HTTPS
sudo ufw allow out 80   # HTTP
sudo ufw allow out 6379 # Redis (if external)
```

### **Proxy Issues**
```bash
# Check proxy settings
echo $http_proxy
echo $https_proxy
echo $no_proxy

# Configure proxy if needed
export http_proxy=http://proxy:port
export https_proxy=http://proxy:port
export no_proxy=localhost,127.0.0.1
```

---

## 🛠️ Debug Tools

### **Log Analysis**
```bash
# Search for errors
grep -i error logs/combined.log | tail -20

# Search for specific patterns
grep -i "automation" logs/automation.log | tail -10
grep -i "wppconnect" logs/combined.log | tail -10

# Monitor real-time logs
tail -f logs/combined.log | grep -E "(ERROR|WARN|automation|wppconnect)"
```

### **Performance Monitoring**
```bash
# Monitor system resources
watch -n 1 'docker stats --no-stream && echo "---" && free -h && echo "---" && df -h'

# Monitor queue processing
watch -n 5 'docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:wait && docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:active'
```

### **Database Inspection**
```bash
# Check Firebase collections
docker-compose exec fees-manager-automation node -e "
const { FirebaseService } = require('./src/services/firebaseService');
const service = new FirebaseService();

Promise.all([
  service.getAutomationRules(),
  service.getStudents(),
  service.getMessageTemplates(),
  service.getRateLimitingRules()
]).then(([rules, students, templates, rateRules]) => {
  console.log('=== Database Summary ===');
  console.log('Automation Rules:', rules.length);
  console.log('Students:', students.length);
  console.log('Message Templates:', templates.length);
  console.log('Rate Limiting Rules:', rateRules.length);
  
  // Show sample data
  if (rules.length > 0) console.log('Sample Rule:', rules[0].name);
  if (students.length > 0) console.log('Sample Student:', students[0].name);
  if (templates.length > 0) console.log('Sample Template:', templates[0].name);
});
"
```

---

## 🚨 Emergency Procedures

### **Complete System Reset**
```bash
# Stop all services
docker-compose down

# Clear all data (WARNING: This will delete all data)
docker-compose down -v
docker system prune -a -f

# Restart from scratch
docker-compose up -d --build
```

### **Data Recovery**
```bash
# Restore from backup
cd /opt/backups
ls -la *.tar.gz | tail -5

# Restore application data
tar -xzf app_YYYYMMDD_HHMMSS.tar.gz -C /opt/

# Restore Redis data
docker-compose stop redis
cp redis_YYYYMMDD_HHMMSS.rdb /opt/fees-manager-automation/docker/redis_data/dump.rdb
docker-compose start redis
```

### **Emergency Contact**
```bash
# If all else fails, contact support with:
# 1. System logs
docker-compose logs > emergency_logs.txt

# 2. Configuration
cp .env emergency_config.txt

# 3. System info
uname -a > system_info.txt
docker version >> system_info.txt
docker-compose version >> system_info.txt

# 4. Create emergency report
echo "=== Emergency Report ===" > emergency_report.txt
date >> emergency_report.txt
echo "Issue: [Describe the problem]" >> emergency_report.txt
echo "Steps taken: [List troubleshooting steps]" >> emergency_report.txt
```

---

## 📞 Support Resources

### **Documentation**
- [Firebase Documentation](https://firebase.google.com/docs)
- [WPPConnect Documentation](https://wppconnect.io/)
- [Redis Documentation](https://redis.io/documentation)
- [Docker Documentation](https://docs.docker.com/)

### **Community Support**
- **GitHub Issues**: Report bugs and feature requests
- **Discord Community**: Real-time support and discussions
- **Email Support**: support@fees-manager.com

### **Monitoring Tools**
- **Application Logs**: `/opt/fees-manager-automation/logs/`
- **System Logs**: `journalctl -u docker`
- **Docker Logs**: `docker-compose logs`
- **Redis Monitoring**: `docker-compose exec redis redis-cli MONITOR`

---

**🔧 Remember: Always check the logs first! Most issues can be resolved by examining the application and system logs.**
