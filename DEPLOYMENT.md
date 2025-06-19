# Deployment Guide

*Notice: https://mycomments.duckdns.org/ is in use by me, so you can view it as an example*

## Table of Contents

1. [Deployment Options](#deployment-options)
2. [Prerequisites Installation](#prerequisites-installation)
   - [For Windows](#for-windows)
   - [For Linux (Ubuntu/Debian)](#for-linux-ubuntudebian)
3. [VPS Setup (Optional)](#vps-setup-optional)
4. [Domain Setup](#domain-setup)
   - [Option A: DuckDNS (Free Dynamic DNS)](#option-a-duckdns-free-dynamic-dns)
   - [Option B: Custom Domain (Recommended for Production)](#option-b-custom-domain-recommended-for-production)
5. [Discord OAuth Setup](#discord-oauth-setup)
6. [Download and Configure Project](#download-and-configure-project)
7. [SSL/TLS Certificate Setup](#ssltls-certificate-setup)
   - [For Windows Home Server](#for-windows-home-server)
   - [For Linux/VPS](#for-linuxvps)
8. [Initial Deployment](#initial-deployment)
9. [Testing the Application](#testing-the-application)
10. [Maintenance and Troubleshooting](#maintenance-and-troubleshooting)

---

## Deployment Options

You can deploy this comment system in several ways:

### A. Home Server / Local Machine
- **Cost**: Free (uses your existing internet and hardware)
- **Pros**: Full control, no monthly fees
- **Cons**: Requires port forwarding, always-on computer, residential IP
- **Best for**: Testing, small personal projects

### B. VPS (Virtual Private Server) - Recommended
- **Cost**: ~$5-10/month
- **Pros**: Professional hosting, static IP, better uptime, no home network exposure
- **Cons**: Monthly cost
- **Best for**: Production deployments
- **Popular providers**: 
  - **Hetzner Cloud** (~€6/month) - Excellent value, EU-based
  - **DigitalOcean** (~$6/month) - User-friendly, global locations
  - **Linode** (~$5/month) - Good performance
  - **Vultr** (~$6/month) - Many locations

> **Note**: This guide includes specific instructions for VPS deployment. We use Hetzner Cloud as an example due to its competitive pricing and reliability, but the steps work with any VPS provider.

### C. Choose Your Path
- **For Home Server**: Continue with [Prerequisites Installation](#prerequisites-installation)
- **For VPS Deployment**: Skip to [VPS Setup](#vps-setup-optional)

---

## Prerequisites Installation

> **VPS Users**: Skip to [VPS Setup](#vps-setup-optional)

### For Windows

#### A. Install Docker Desktop for Windows

1. **Download Docker Desktop**
   - Go to https://www.docker.com/products/docker-desktop/
   - Click "Download for Windows"
   - Run the installer (`Docker Desktop Installer.exe`)

2. **Installation Steps**
   - Check "Use WSL 2 instead of Hyper-V" (recommended)
   - Click "Ok" through the installation
   - Restart your computer when prompted

3. **Verify Docker Installation**
   ```powershell
   docker --version
   docker-compose --version
   ```

4. **Start Docker Desktop**
   - Docker Desktop should start automatically
   - Look for the whale icon in your system tray
   - Wait until it shows "Docker Desktop is running"

#### B. Install Git for Windows

1. **Download Git**
   - Go to https://git-scm.com/download/win
   - Download will start automatically
   - Run the installer

2. **Installation Options**
   - Use default options for most screens
   - For "Adjusting your PATH environment", select "Git from the command line and also from 3rd-party software"
   - For line ending conversions, select "Checkout as-is, commit as-is"

3. **Verify Git Installation**
   ```powershell
   git --version
   ```

#### C. Configure Windows Firewall

1. **Open Windows Defender Firewall**
   - Press `Windows + R`, type `wf.msc`, press Enter

2. **Create Inbound Rules**
   - Click "Inbound Rules" → "New Rule"
   - Select "Port" → Next
   - Select "TCP" and enter "80" → Next
   - Select "Allow the connection" → Next
   - Check all profiles → Next
   - Name: "HTTP for Comment System" → Finish
   
   - Repeat for port 443:
   - New Rule → Port → TCP → "443" → Allow → All profiles
   - Name: "HTTPS for Comment System" → Finish

### For Linux (Ubuntu/Debian)

#### A. Install Docker and Docker Compose

1. **Update System**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Install Docker**
   ```bash
   # Install prerequisites
   sudo apt install apt-transport-https ca-certificates curl software-properties-common -y
   
   # Add Docker GPG key
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
   
   # Add Docker repository
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   
   # Install Docker
   sudo apt update
   sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y
   
   # Add user to docker group
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. **Verify Installation**
   ```bash
   docker --version
   docker compose version
   ```

#### B. Install Git

```bash
sudo apt install git -y
git --version
```

#### C. Configure Firewall

```bash
# Install UFW if not already installed
sudo apt install ufw -y

# Allow SSH (important!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### Find Your IP Address

**Windows:**
```powershell
# Local IP
ipconfig

# Public IP
curl ifconfig.me
```

**Linux:**
```bash
# Local IP
ip addr show

# Public IP
curl ifconfig.me
```

---

## VPS Setup (Optional)

> Continue to [Domain Setup](#domain-setup) if you are using a home server.

This section covers deploying on a VPS. We'll use Hetzner Cloud as an example, but these steps apply to any VPS provider.

### A. Create a VPS Instance

#### For Hetzner Cloud:
1. **Sign up** at https://www.hetzner.com/cloud
2. **Create New Server**:
   - Location: Choose nearest to your users
   - Image: **Ubuntu 22.04**
   - Type: **CX11** (2 vCPU, 2GB RAM) - Recommended
   - SSH Keys: Add your SSH key (recommended) or use password
   - Name: `comment-app-server`
3. **Note your server's IP** (e.g., 65.108.123.45)

#### For Other Providers:
- **DigitalOcean**: Create a Droplet with Ubuntu 22.04, 2GB+ RAM
- **Linode**: Create a Linode with Ubuntu 22.04, 2GB+ RAM
- **Vultr**: Deploy a Cloud Compute instance with Ubuntu 22.04

### B. Connect to Your VPS

```bash
# Using SSH key (recommended)
ssh root@YOUR_SERVER_IP

# Using password
ssh root@YOUR_SERVER_IP
# Enter the password provided by your VPS provider
```

### C. Install Docker and Prerequisites

```bash
# Update system
apt update && apt upgrade -y

# Install required packages
apt install apt-transport-https ca-certificates curl software-properties-common git -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

### D. Configure Firewall

```bash
# Install UFW if not already installed
apt install ufw -y

# Allow SSH (important!)
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw --force enable

# Check status
ufw status
```

---

## Domain Setup

You have two options for domain setup:

### Option A: DuckDNS (Free Dynamic DNS)

> **Recommended for**: Home servers, testing, or if you don't want to buy a domain

#### 1. Create DuckDNS Account

1. **Sign Up**
   - Go to https://www.duckdns.org/
   - Sign in with Google, GitHub, Twitter, or Reddit
   - You'll be redirected to your dashboard

2. **Create a Subdomain**
   - In the "sub domain" field, enter your desired name (e.g., `mycomments`)
   - Click "add domain"
   - Your domain will be `mycomments.duckdns.org`

3. **Update IP Address**
   - Your current IP should be detected automatically
   - If not, enter your public IP address
   - Click "update ip" next to your domain

4. **Save Your Token**
   - Copy your token from the top of the page
   - Save it in a text file - you'll need it later

#### 2. Configure Router Port Forwarding (Home Server Only)

> **VPS Users**: Skip this step - your VPS already has public ports

1. **Access Your Router**
   - Open browser, go to `192.168.1.1` or `192.168.0.1`
   - Login (check router label for credentials)

2. **Find Port Forwarding Section**
   - Look for "Port Forwarding", "Virtual Server", or "NAT"
   - Usually under "Advanced" settings

3. **Create Port Forwarding Rules**
   - **HTTP Rule:**
     - Service Name: `HTTP-Comments`
     - External Port: `80`
     - Internal Port: `80`
     - Internal IP: Your computer's local IP
     - Protocol: `TCP`
   
   - **HTTPS Rule:**
     - Service Name: `HTTPS-Comments`
     - External Port: `443`
     - Internal Port: `443`
     - Internal IP: Your computer's local IP
     - Protocol: `TCP`

4. **Save and Apply Changes**

#### 3. Test Domain Resolution

**Windows:**
```powershell
nslookup mycomments.duckdns.org
```

**Linux:**
```bash
dig mycomments.duckdns.org
# or
nslookup mycomments.duckdns.org
```

Should return your public IP address.

### Option B: Custom Domain (Recommended for Production)

> **For VPS deployments with a professional appearance**

1. **Purchase a domain** from providers like:
   - Namecheap (~$10/year)
   - Google Domains (~$12/year)
   - Cloudflare (~$10/year)

2. **Point domain to your server**:
   - Add an A record pointing to your server's IP
   - Example: `@` → `65.108.123.45`
   - Example: `www` → `65.108.123.45`

3. **Wait for DNS propagation** (5-30 minutes)

---

## Discord OAuth Setup

### A. Create Discord Application

1. **Go to Discord Developer Portal**
   - Navigate to https://discord.com/developers/applications
   - Click "New Application"
   - Name: `My Comment System` (or your preference)
   - Click "Create"

2. **Configure OAuth2**
   - In left sidebar, click "OAuth2"
   - Under "Redirects", click "Add Redirect"
   - Enter: `https://mycomments.duckdns.org/oauth-callback.html`
   - Click "Save Changes"

3. **Get Your Credentials**
   - Go to "OAuth2" → "General"
   - Copy "CLIENT ID" - save in your text file
   - Click "Reset Secret" → "Yes, do it!"
   - Copy "CLIENT SECRET" - save in your text file

4. **Get Your Discord User ID**
   - Open Discord app
   - Go to Settings → Advanced
   - Enable "Developer Mode"
   - Right-click your username anywhere
   - Click "Copy User ID"
   - Your ID format: `123456789012345678`

---

## Download and Configure Project

### A. Get the Project Files

#### For Home Server (Windows):
```powershell
cd C:\
mkdir Projects
cd Projects
git clone https://github.com/ChristianBlevens/CommentSectionWebApp.git
cd CommentSectionWebApp
```

#### For Home Server (Linux):
```bash
cd ~
mkdir projects
cd projects
git clone https://github.com/ChristianBlevens/CommentSectionWebApp.git
cd CommentSectionWebApp
```

#### For VPS:
```bash
# Connect to your VPS via SSH first, then:
cd /root
git clone https://github.com/ChristianBlevens/CommentSectionWebApp.git comment-app
cd comment-app
```

> **Note**: Git was already installed during VPS setup. If you're using a private repository, you may need to configure SSH keys or use HTTPS with credentials.

### B. Configure Environment

> **Note**: The project now uses a single `.env` file in the root directory. All services read from this central configuration.

1. **Copy the Environment Template**

   **Windows (PowerShell):**
   ```powershell
   copy .env.example .env
   ```

   **Linux/VPS:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the Environment File**

   **Windows:** `notepad .env`  
   **Linux:** `nano .env` or `vim .env`

   Update all the values in your `.env` file:
   ```env
   # Database Configuration
   DB_USER=postgres
   DB_PASSWORD=your-secure-database-password-here
   DB_NAME=comments_db
   MODERATION_DB_NAME=moderation_db

   # API Service Configuration
   API_PORT=3000
   MODERATION_PORT=3001
   BOT_PORT=3002

   # Discord OAuth Configuration
   DISCORD_CLIENT_ID=your-discord-client-id-here
   DISCORD_CLIENT_SECRET=your-discord-client-secret-here
   DISCORD_REDIRECT_URI=https://mycomments.duckdns.org/oauth-callback.html

   # Discord Bot Configuration (Optional)
   DISCORD_BOT_TOKEN=your-discord-bot-token-here

   # Initial Moderators (Discord user IDs, comma-separated)
   INITIAL_MODERATORS=discord_123456789012345678

   # CORS Configuration
   ALLOWED_ORIGINS=https://mycomments.duckdns.org

   # Session Configuration
   SESSION_DURATION=86400

   # Moderation Service
   ADMIN_KEY=GenerateAStrongAdminKey123!@#

   # SSL Configuration (for production)
   SSL_DOMAIN=mycomments.duckdns.org
   ```

3. **Important Notes**:
   - Use strong, unique passwords for database and admin key
   - Discord credentials come from your Discord Developer Portal application
   - SSL_DOMAIN should match your actual domain or DuckDNS subdomain
   - ALLOWED_ORIGINS should include all domains that will embed the comment system

### C. Set File Permissions (Linux/VPS Only)

```bash
# Secure the environment file
chmod 600 .env

# Make scripts executable
chmod +x docker/*.sh docker/ssl/*.sh
```

---

## SSL/TLS Certificate Setup

### For Windows Home Server

Since Certbot no longer officially supports Windows, you have to use WSL2 (Windows Subsystem for Linux)

1. **Install WSL2** (if not already installed, should have come with Docker Desktop)
   ```powershell
   # Run as Administrator
   wsl --install
   # Restart your computer when prompted
   ```

2. **Open PowerShell and Create WSL2 Instance for Ubuntu 22.04**
   ```powershell
   wsl --install -d Ubuntu-22.04
   ```

3. **Open WSL2 Terminal With The New Instance**
   ```powershell
   wsl --distribution Ubuntu-22.04
   ```

4. **Install Certbot in WSL2**
   ```bash
   sudo apt update
   sudo apt install certbot -y
   ```

5. **Generate Certificate**
   ```bash
   # Make sure port 80 is available
   sudo certbot certonly --standalone -d mycomments.duckdns.org
   ```

6. **Copy Certificates to Windows** (from WSL2)
   ```bash
   # Create directory in Windows filesystem
   mkdir -p /mnt/c/Projects/CommentSectionWebApp/docker/ssl
   
   # Copy certificates
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/fullchain.pem /mnt/c/Projects/CommentSectionWebApp/docker/ssl/
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/privkey.pem /mnt/c/Projects/CommentSectionWebApp/docker/ssl/
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/chain.pem /mnt/c/Projects/CommentSectionWebApp/docker/ssl/
   ```

### For Linux/VPS

#### A. Install Certbot

```bash
# For Ubuntu/Debian (includes VPS)
apt update
apt install certbot -y

# For CentOS/RHEL/Fedora
dnf install certbot -y
```

#### B. Generate Certificate

1. **Stop any services using port 80**
   ```bash
   # Check what's using port 80
   lsof -i :80
   
   # If Docker is running, stop it temporarily
   docker-compose down 2>/dev/null || true
   ```

2. **Run Certbot**
   ```bash
   # IMPORTANT: Run certbot from your home/root directory, NOT from the project directory
   
   # For home server (with sudo)
   cd ~
   sudo certbot certonly --standalone -d mycomments.duckdns.org
   
   # For VPS (as root) - Run from /root directory
   cd /root
   certbot certonly --standalone -d mycomments.duckdns.org
   ```

3. **Copy Certificates to Project**
   ```bash
   # Navigate to project directory
   # Home server:
   cd ~/projects/CommentSectionWebApp
   
   # VPS:
   cd /root/comment-app
   
   # Copy certificates (the SSL directory already exists)
   # For home server:
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/fullchain.pem docker/ssl/
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/privkey.pem docker/ssl/
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/chain.pem docker/ssl/
   
   # For VPS:
   cp /etc/letsencrypt/live/mycomments.duckdns.org/*.pem docker/ssl/
   
   # Set proper permissions
   chmod 644 docker/ssl/*.pem
   chmod 600 docker/ssl/privkey.pem
   ```

### C. Setup Auto-Renewal

#### Windows Home Server

1. **Update the renewal script** (located in docker/ssl/renew-ssl.sh):
   - The script automatically uses the SSL_DOMAIN from your .env file
   - No editing needed unless you have special requirements

2. **For WSL2: Create Windows wrapper script**
   Create `renew-cert-wsl.ps1`:
   ```powershell
   # renew-cert-wsl.ps1
   cd C:\Projects\CommentSectionWebApp
   wsl ./docker/ssl/renew-ssl.sh
   ```

3. **Schedule with Task Scheduler**
   - Open Task Scheduler
   - Create Basic Task
   - Name: "Renew SSL Certificates"
   - Trigger: Weekly, Sunday, 3:00 AM
   - Action: Start a program
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "C:\Projects\CommentSectionWebApp\renew-cert-wsl.ps1"`

#### Linux/VPS

1. **Configure the renewal script** (located in docker/ssl/renew-ssl.sh):
   ```bash
   # The renewal script is in the docker/ssl directory
   # Ensure it's executable (it should already be)
   chmod +x docker/ssl/renew-ssl.sh
   
   # Edit .env to set your domain (if not already done)
   # SSL_DOMAIN=mycomments.duckdns.org
   ```

2. **Add to crontab**:
   ```bash
   # For VPS (as root)
   crontab -e
   
   # For home server
   sudo crontab -e
   ```

3. **Add this line**:
   ```cron
   # For VPS
   0 3 * * 0 /root/comment-app/docker/ssl/renew-ssl.sh > /var/log/ssl-renewal.log 2>&1
   
   # For home server
   0 3 * * 0 /home/username/projects/CommentSectionWebApp/docker/ssl/renew-ssl.sh > /var/log/ssl-renewal.log 2>&1
   ```

---

## Initial Deployment

### A. Start the Application

**Windows Home Server:**
```powershell
cd C:\Projects\CommentSectionWebApp
docker-compose up -d
```

**Linux Home Server:**
```bash
cd ~/projects/CommentSectionWebApp
docker-compose up -d
```

**VPS:**
```bash
cd /root/comment-app
docker-compose up -d
```

- First run will download images (5-10 minutes)
- Creates all containers and volumes
- Uses your Let's Encrypt certificates immediately

### B. Verify All Services Running

```bash
docker-compose ps
```

All services should show "Up" status. If any show "Exit", check logs:
```bash
docker-compose logs backend-api
docker-compose logs moderation-service
docker-compose logs frontend
```

### C. Test Deployment

1. **Test HTTPS Access**
   - Open browser
   - Go to `https://mycomments.duckdns.org`
   - Should show secure connection (padlock icon)
   - No security warnings!

2. **Test HTTP Redirect**
   - Go to `http://mycomments.duckdns.org`
   - Should automatically redirect to HTTPS

---

## Testing the Application

### A. Test Comment System Features

1. **Sign In with Discord**
   - Click "Sign in with Discord"
   - Authorize the application
   - You should be logged in

2. **Post a Test Comment**
   - Type: "Hello, this is my first comment!"
   - Click "Post Comment"
   - Comment should appear immediately

3. **Test Markdown Features**
   ```markdown
   **Bold text**
   *Italic text*
   ~~Strikethrough~~
   ## Header
   ![Image](https://via.placeholder.com/150)
   ```

4. **Test Moderation**
   - Try posting spam content
   - Should be blocked with message

5. **Test Voting**
   - Click thumbs up/down on comments
   - Votes should update

### B. Test Moderator Features

1. **Access Moderator Panel**
   - As the initial moderator (your Discord ID)
   - You should see "Moderator Panel" section

2. **Moderator URLs**
   - Moderator management: `https://mycomments.duckdns.org/moderators.html`
   - Global reports: `https://mycomments.duckdns.org/reports.html`

### C. Performance Testing

1. **Check Service Health**
   ```bash
   curl https://mycomments.duckdns.org/api/health
   curl https://mycomments.duckdns.org/moderation/api/health
   ```

2. **Monitor Resources**
   ```bash
   docker stats
   ```

---

## Maintenance and Troubleshooting

### A. Daily Maintenance

1. **Check Service Status**
   ```bash
   docker-compose ps
   ```

2. **View Logs**
   ```bash
   # All logs
   docker-compose logs -f
   
   # Specific service
   docker-compose logs -f backend-api
   ```

3. **Monitor Disk Space**
   ```bash
   docker system df
   ```

### B. Common Issues and Solutions

**Cannot Access Site**
- Check firewall rules
- Verify port forwarding on router
- Test DuckDNS: `nslookup mycomments.duckdns.org`
- Check Docker services: `docker-compose ps`

**Discord OAuth Not Working**
- Verify redirect URI matches exactly
- Check Discord application settings
- Review logs: `docker-compose logs backend-api | grep -i discord`

**Certificate Expired**
- Run renewal manually:
  - Windows: `.\renew-cert.ps1`
  - Linux: `sudo certbot renew`

**High Memory Usage**
```bash
# Restart services
docker-compose restart

# Clean up
docker system prune -a
```

### C. Backup Procedures

#### Windows Home Server

Create `backup.ps1`:
```powershell
$date = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "C:\Backups\CommentSystem\$date"
New-Item -ItemType Directory -Path $backupDir -Force

cd C:\Projects\CommentSectionWebApp

# Backup databases
docker-compose exec -T postgres-comments pg_dump -U postgres comments_db > "$backupDir\comments_db.sql"
docker-compose exec -T postgres-moderation pg_dump -U postgres moderation_db > "$backupDir\moderation_db.sql"

# Backup configuration
Copy-Item .env "$backupDir\"
Copy-Item backend\api\.env "$backupDir\api.env"
Copy-Item backend\moderation\.env "$backupDir\moderation.env"

Write-Host "Backup completed to $backupDir"
```

#### Linux/VPS

Create `backup.sh`:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)

# Set paths based on deployment type
# For VPS:
PROJECT_DIR="/root/comment-app"
BACKUP_DIR="/root/backups/$DATE"

# For home server:
# PROJECT_DIR="$HOME/projects/CommentSectionWebApp"
# BACKUP_DIR="$HOME/backups/comment-system/$DATE"

mkdir -p "$BACKUP_DIR"
cd $PROJECT_DIR

# Backup databases
docker-compose exec -T postgres-comments pg_dump -U postgres comments_db > "$BACKUP_DIR/comments_db.sql"
docker-compose exec -T postgres-moderation pg_dump -U postgres moderation_db > "$BACKUP_DIR/moderation_db.sql"

# Backup configuration
cp .env "$BACKUP_DIR/"
cp backend/api/.env "$BACKUP_DIR/api.env"
cp backend/moderation/.env "$BACKUP_DIR/moderation.env"

echo "Backup completed to $BACKUP_DIR"
```

Make it executable:
```bash
chmod +x backup.sh
```

### D. Updates and Upgrades

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### E. Complete Backup/Restore

**Full Backup:**
```bash
# Stop services
docker-compose stop

# Backup volumes
docker run --rm -v comment-system_postgres-comments-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-comments-backup.tar.gz -C /data .
docker run --rm -v comment-system_postgres-moderation-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-moderation-backup.tar.gz -C /data .
docker run --rm -v comment-system_redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz -C /data .

# Start services
docker-compose start
```

**Restore:**
```bash
# Stop services
docker-compose stop

# Restore volumes
docker run --rm -v comment-system_postgres-comments-data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-comments-backup.tar.gz -C /data
docker run --rm -v comment-system_postgres-moderation-data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-moderation-backup.tar.gz -C /data
docker run --rm -v comment-system_redis-data:/data -v $(pwd):/backup alpine tar xzf /backup/redis-backup.tar.gz -C /data

# Start services
docker-compose start
```

### F. VPS-Specific Maintenance

#### Monitor Resources
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Monitor real-time resource usage
htop  # Install with: apt install htop

# Check Docker resource usage
docker stats
```

#### Security Updates
```bash
# Keep system updated (VPS)
apt update && apt upgrade -y

# Auto-remove unused packages
apt autoremove -y

# Optional: Install fail2ban for additional security
apt install fail2ban -y
```

#### Cost Monitoring
- **Hetzner**: ~€6/month for CX21
- **DigitalOcean**: ~$6/month for Basic Droplet
- **Domain**: ~$10-15/year (if using custom domain)
- **SSL**: Free with Let's Encrypt
- **Total**: ~$6-10/month

---

## Quick Reference

### Essential Commands
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart service
docker-compose restart backend-api

# Check status
docker-compose ps

# Enter container
docker-compose exec backend-api sh

# Renew SSL certificates
./docker/ssl/renew-ssl.sh
```

### Important URLs
- Main site: `https://mycomments.duckdns.org`
- Health check: `https://mycomments.duckdns.org/api/health`
- Moderator panel: `https://mycomments.duckdns.org/moderators.html`
- Reports: `https://mycomments.duckdns.org/reports.html`

### Environment Files
- Root: `.env`
- API: `backend/api/.env`
- Moderation: `backend/moderation/.env`

### Default Ports
- HTTP: 80 (redirects to HTTPS)
- HTTPS: 443
- Backend API: 3000 (internal)
- Moderation: 3001 (internal)
- Discord Bot: 3002 (internal)
- PostgreSQL: 5432, 5433 (internal)
- Redis: 6379 (internal)