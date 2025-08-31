# Fees Manager WhatsApp Automation - Deployment Guide

A comprehensive step-by-step guide for deploying the Fees Manager WhatsApp Automation backend to a DigitalOcean droplet.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Docker Installation](#docker-installation)
4. [Application Deployment](#application-deployment)
5. [Configuration](#configuration)
6. [Testing & Verification](#testing--verification)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Prerequisites

### **Required Accounts & Services**
- ✅ **DigitalOcean Account** - For hosting the droplet
- ✅ **Firebase Project** - For data storage and authentication
- ✅ **WPPConnect Server** - For WhatsApp API access
- ✅ **GitHub Repository** - For code deployment

### **System Requirements**
- **Droplet Size**: 2GB RAM, 1 vCPU minimum (4GB RAM recommended)
- **Operating System**: Ubuntu 22.04 LTS
- **Storage**: 25GB minimum
- **Network**: Public IP with SSH access

### **Local Requirements**
- **SSH Key Pair** - For secure server access
- **Git** - For code management
- **Docker** (optional) - For local testing

---

## 🖥️ Server Setup

### **Step 1: Create DigitalOcean Droplet**

1. **Login to DigitalOcean**
   ```bash
   # Access DigitalOcean dashboard
   https://cloud.digitalocean.com/
   ```

2. **Create New Droplet**
   - Click "Create" → "Droplets"
   - Choose "Ubuntu 22.04 LTS"
   - Select plan: **Basic** → **Regular** → **$12/month** (2GB RAM, 1 vCPU)
   - Choose datacenter region close to your users
   - Authentication: **SSH Key** (upload your public key)
   - Hostname: `fees-manager-automation`

3. **Note Server Details**
   ```bash
   # Save these details securely
   SERVER_IP=your-droplet-ip
   SERVER_USER=root
   SSH_KEY_PATH=~/.ssh/id_rsa
   ```

### **Step 2: Initial Server Configuration**

1. **Connect to Server**
   ```bash
   ssh -i ~/.ssh/id_rsa root@YOUR_DROPLET_IP
   ```

2. **Update System**
   ```bash
   # Update package lists
   apt update && apt upgrade -y
   
   # Install essential packages
   apt install -y curl wget git nano htop ufw fail2ban
   ```

3. **Configure Firewall**
   ```bash
   # Enable UFW
   ufw enable
   
   # Allow SSH
   ufw allow ssh
   
   # Allow HTTP/HTTPS (if needed)
   ufw allow 80
   ufw allow 443
   
   # Allow Redis (internal only)
   ufw allow from 10.0.0.0/8 to any port 6379
   
   # Check status
   ufw status
   ```

4. **Create Application User**
   ```bash
   # Create user for application
   adduser fees-manager
   usermod -aG sudo fees-manager
   
   # Switch to application user
   su - fees-manager
   ```

---

## 🐳 Docker Installation

### **Step 3: Install Docker**

1. **Install Docker Engine**
   ```bash
   # Update package index
   sudo apt update
   
   # Install prerequisites
   sudo apt install -y ca-certificates curl gnupg lsb-release
   
   # Add Docker's official GPG key
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   
   # Set up repository
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   
   # Install Docker Engine
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

2. **Configure Docker**
   ```bash
   # Add user to docker group
   sudo usermod -aG docker $USER
   
   # Start and enable Docker
   sudo systemctl start docker
   sudo systemctl enable docker
   
   # Verify installation
   docker --version
   docker-compose --version
   ```

3. **Test Docker**
   ```bash
   # Test with hello-world
   docker run hello-world
   ```

---

## 🚀 Application Deployment

### **Step 4: Deploy Application**

1. **Clone Repository**
   ```bash
   # Navigate to home directory
   cd ~
   
   # Clone your repository
   git clone https://github.com/your-username/fees-manager-automation.git
   cd fees-manager-automation
   ```

2. **Create Application Directory**
   ```bash
   # Create production directory
   sudo mkdir -p /opt/fees-manager-automation
   sudo chown $USER:$USER /opt/fees-manager-automation
   
   # Copy files
   cp -r * /opt/fees-manager-automation/
   cd /opt/fees-manager-automation
   ```

3. **Set Up Environment**
   ```bash
   # Copy environment template
   cp docker/env.example .env
   
   # Edit environment file
   nano .env
   ```

4. **Configure Environment Variables**
   ```bash
   # Essential variables to configure:
   
   # Firebase Configuration
   FIREBASE_PROJECT_ID=your-firebase-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
   
   # WPPConnect Configuration
   WPPCONNECT_SERVER_URL=http://wpp.sprinthon.com:8080
   WPPCONNECT_SESSION_ID=fees-manager-session
   
   # Redis Configuration
   REDIS_URL=redis://redis:6379
   REDIS_HOST=redis
   REDIS_PORT=6379
   
   # Application Configuration
   NODE_ENV=production
   TZ=Asia/Karachi
   LOG_LEVEL=info
   ```

### **Step 5: Build and Start Services**

1. **Build Docker Images**
   ```bash
   # Navigate to docker directory
   cd docker
   
   # Build the application
   docker-compose build --no-cache
   ```

2. **Start Services**
   ```bash
   # Start all services
   docker-compose up -d
   
   # Check service status
   docker-compose ps
   ```

3. **Verify Services**
   ```bash
   # Check logs
   docker-compose logs -f
   
   # Check individual service logs
   docker-compose logs fees-manager-automation
   docker-compose logs redis
   ```

---

## ⚙️ Configuration

### **Step 6: Firebase Setup**

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create new project: `fees-manager-automation`
   - Enable Firestore Database

2. **Generate Service Account Key**
   ```bash
   # In Firebase Console:
   # 1. Go to Project Settings
   # 2. Service Accounts tab
   # 3. Generate new private key
   # 4. Download JSON file
   ```

3. **Configure Firestore Collections**
   ```bash
   # Create required collections in Firestore:
   # - automationRules
   # - students
   # - messageTemplates
   # - rateLimitingRules
   # - messageLogs
   # - users
   # - settings
   ```

### **Step 7: WPPConnect Configuration**

1. **Verify WPPConnect Server**
   ```bash
   # Test connection to WPPConnect server
   curl http://wpp.sprinthon.com:8080/health
   
   # Check available sessions
   curl http://wpp.sprinthon.com:8080/api/sessions
   ```

2. **Create Session (if needed)**
   ```bash
   # Create new session
   curl -X POST http://wpp.sprinthon.com:8080/api/sessions/add \
     -H "Content-Type: application/json" \
     -d '{"session": "fees-manager-session"}'
   ```

### **Step 8: Automation Rules Setup**

1. **Create Sample Automation Rule**
   ```javascript
   // Add this to Firestore collection 'automationRules'
   {
     "id": "overdue-reminder",
     "name": "Overdue Students Reminder",
     "description": "Send daily reminders to overdue students",
     "enabled": true,
     "templateId": "overdue-template",
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
     },
     "createdAt": "2024-01-01T00:00:00Z",
     "updatedAt": "2024-01-01T00:00:00Z"
   }
   ```

2. **Create Sample Message Template**
   ```javascript
   // Add this to Firestore collection 'messageTemplates'
   {
     "id": "overdue-template",
     "name": "Overdue Payment Reminder",
     "description": "Template for overdue payment reminders",
     "content": "Hello {name}, your payment of {amount} for {course} is overdue. Please contact us immediately to avoid any issues.",
     "enabled": true,
     "category": "payment-reminder",
     "createdAt": "2024-01-01T00:00:00Z",
     "updatedAt": "2024-01-01T00:00:00Z"
   }
   ```

---

## 🧪 Testing & Verification

### **Step 9: Health Checks**

1. **Application Health**
   ```bash
   # Check application health
   docker-compose exec fees-manager-automation node src/scheduler.js health
   
   # Expected output:
   # {
   #   "status": "healthy",
   #   "application": {...},
   #   "services": {...},
   #   "timestamp": "2024-01-01T00:00:00.000Z"
   # }
   ```

2. **Service Status**
   ```bash
   # Check all services
   docker-compose ps
   
   # Check individual service logs
   docker-compose logs fees-manager-automation
   docker-compose logs redis
   ```

3. **Redis Connection**
   ```bash
   # Test Redis connection
   docker-compose exec redis redis-cli ping
   # Expected: PONG
   
   # Check Redis info
   docker-compose exec redis redis-cli info
   ```

### **Step 10: Test Automation**

1. **Manual Test**
   ```bash
   # Test automation manually
   docker-compose exec fees-manager-automation node src/scheduler.js test
   ```

2. **Check Logs**
   ```bash
   # Monitor automation logs
   tail -f logs/automation.log
   
   # Monitor error logs
   tail -f logs/error.log
   ```

3. **Verify Message Processing**
   ```bash
   # Check queue status
   docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:wait
   
   # Monitor queue processing
   docker-compose exec redis redis-cli MONITOR
   ```

---

## 📊 Monitoring & Maintenance

### **Step 11: Set Up Monitoring**

1. **System Monitoring**
   ```bash
   # Install monitoring tools
   sudo apt install -y htop iotop nethogs
   
   # Monitor system resources
   htop
   ```

2. **Application Monitoring**
   ```bash
   # Set up log rotation
   sudo nano /etc/logrotate.d/fees-manager-automation
   
   # Add configuration:
   /opt/fees-manager-automation/logs/*.log {
       daily
       missingok
       rotate 30
       compress
       delaycompress
       notifempty
       create 644 fees-manager fees-manager
   }
   ```

3. **Docker Monitoring**
   ```bash
   # Monitor Docker resources
   docker stats
   
   # Check disk usage
   docker system df
   ```

### **Step 12: Backup Strategy**

1. **Application Backup**
   ```bash
   # Create backup script
   nano /opt/fees-manager-automation/backup.sh
   
   # Add backup logic:
   #!/bin/bash
   BACKUP_DIR="/opt/backups"
   DATE=$(date +%Y%m%d_%H%M%S)
   
   mkdir -p $BACKUP_DIR
   
   # Backup application data
   tar -czf $BACKUP_DIR/app_$DATE.tar.gz /opt/fees-manager-automation
   
   # Backup Redis data
   docker-compose exec redis redis-cli BGSAVE
   cp /opt/fees-manager-automation/docker/redis_data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb
   
   # Clean old backups (keep 7 days)
   find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
   find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete
   ```

2. **Automate Backups**
   ```bash
   # Make script executable
   chmod +x /opt/fees-manager-automation/backup.sh
   
   # Add to crontab
   crontab -e
   
   # Add line for daily backup at 2 AM:
   0 2 * * * /opt/fees-manager-automation/backup.sh
   ```

### **Step 13: Update Procedures**

1. **Application Updates**
   ```bash
   # Update application
   cd /opt/fees-manager-automation
   git pull origin main
   
   # Rebuild and restart
   cd docker
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

2. **System Updates**
   ```bash
   # Update system packages
   sudo apt update && sudo apt upgrade -y
   
   # Restart services if needed
   sudo systemctl restart docker
   ```

---

## 🔧 Troubleshooting

### **Common Issues & Solutions**

#### **Issue 1: Application Won't Start**
```bash
# Check logs
docker-compose logs fees-manager-automation

# Common causes:
# - Missing environment variables
# - Firebase authentication error
# - WPPConnect connection failed
# - Redis connection failed

# Solutions:
# 1. Verify .env file configuration
# 2. Check Firebase service account key
# 3. Test WPPConnect server connectivity
# 4. Verify Redis is running
```

#### **Issue 2: Messages Not Sending**
```bash
# Check automation logs
tail -f logs/automation.log

# Check queue status
docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:wait
docker-compose exec redis redis-cli LLEN bull:whatsapp-messages:failed

# Common causes:
# - WPPConnect session not connected
# - Rate limiting active
# - No matching students found
# - Template not found

# Solutions:
# 1. Check WPPConnect session status
# 2. Verify automation rules and criteria
# 3. Check message templates
# 4. Review rate limiting settings
```

#### **Issue 3: High Memory Usage**
```bash
# Check memory usage
docker stats

# Check Redis memory
docker-compose exec redis redis-cli info memory

# Solutions:
# 1. Increase droplet RAM
# 2. Optimize Redis configuration
# 3. Implement log rotation
# 4. Monitor and clean old data
```

#### **Issue 4: Connection Timeouts**
```bash
# Test network connectivity
curl -v http://wpp.sprinthon.com:8080/health
curl -v https://firestore.googleapis.com

# Check firewall rules
sudo ufw status

# Solutions:
# 1. Verify network connectivity
# 2. Check firewall configuration
# 3. Update DNS settings
# 4. Contact service providers
```

### **Debug Commands**

```bash
# Enable debug logging
export LOG_LEVEL=debug
docker-compose restart fees-manager-automation

# View debug logs
tail -f logs/combined.log | grep DEBUG

# Test individual components
docker-compose exec fees-manager-automation node src/scheduler.js health
docker-compose exec redis redis-cli ping
curl http://wpp.sprinthon.com:8080/health

# Check system resources
htop
df -h
free -h
```

---

## 📞 Support

### **Getting Help**

1. **Check Logs First**
   ```bash
   # Application logs
   docker-compose logs fees-manager-automation
   
   # System logs
   sudo journalctl -u docker
   sudo journalctl -u docker-compose
   ```

2. **Common Resources**
   - [Firebase Documentation](https://firebase.google.com/docs)
   - [WPPConnect Documentation](https://wppconnect.io/)
   - [Redis Documentation](https://redis.io/documentation)
   - [Docker Documentation](https://docs.docker.com/)

3. **Contact Information**
   - **GitHub Issues**: Report bugs and feature requests
   - **Email Support**: support@fees-manager.com
   - **Discord Community**: Join our community server

---

## ✅ Deployment Checklist

- [ ] DigitalOcean droplet created and configured
- [ ] Docker and Docker Compose installed
- [ ] Application repository cloned
- [ ] Environment variables configured
- [ ] Firebase project set up with service account
- [ ] WPPConnect server accessible
- [ ] Docker containers built and running
- [ ] Health checks passing
- [ ] Automation rules created in Firebase
- [ ] Message templates configured
- [ ] Monitoring and backup configured
- [ ] Firewall rules configured
- [ ] SSL certificates installed (if needed)
- [ ] Documentation updated

---

**🎉 Congratulations! Your Fees Manager WhatsApp Automation is now deployed and ready to use!**
