# Comment Section Web Application

A **production-ready** comment system with Discord OAuth authentication, AI-powered content moderation, and built-in spam protection. Embed it on any website using a simple iframe.

## Key Features

- **🔐 Discord OAuth Authentication** - No passwords, secure login through Discord
- **🤖 AI-Powered Moderation** - Natural language processing detects spam, toxicity, and inappropriate content
- **💬 Rich Text Support** - Markdown formatting with image and video embeds
- **👍 Voting System** - Like/dislike comments
- **🛡️ Advanced Security** - HTTPS only, rate limiting, CSRF protection, SQL injection prevention
- **👮 Moderation Tools** - Report system, user banning, moderator dashboard
- **📱 Responsive Design** - Works on all devices
- **🚀 High Performance** - Redis caching, PostgreSQL with optimized indexes
- **📊 Analytics Dashboard** - Activity tracking with visual charts and data export
- **🎨 Theme Customization** - Customizable colors and presets
- **🤖 Discord Bot** - Mention notifications via Discord DMs
- **📊 Trust System** - User reputation scoring based on behavior

## Table of Contents
1. [Quick Start - Basic Embedding](#quick-start---basic-embedding)
2. [Deployment Options](#2-deployment-options)
3. [Prerequisites Installation](#3-prerequisites-installation)
4. [VPS Setup (Optional)](#4-vps-setup-optional)
5. [Domain Setup](#5-domain-setup)
6. [Discord OAuth Setup](#6-discord-oauth-setup)
7. [Download and Configure Project](#7-download-and-configure-project)
8. [SSL/TLS Certificate Setup](#8-ssltls-certificate-setup)
9. [Initial Deployment](#9-initial-deployment)
10. [Testing the Application](#10-testing-the-application)
11. [Using as an iFrame](#11-using-as-an-iframe)
12. [Maintenance and Troubleshooting](#12-maintenance-and-troubleshooting)
13. [Feature Overview](#13-feature-overview)
14. [Detailed Feature Guide](#14-detailed-feature-guide)
15. [Project Architecture](#15-project-architecture)
16. [File Reference](#16-file-reference)

---

## Quick Start - Basic Embedding

If you already have the comment system deployed, embedding it on your website is simple:

```html
<iframe 
    src="https://yourdomain.com/?pageId=YOUR_PAGE_ID"
    style="width: 100%; min-height: 600px; border: none;"
    frameborder="0">
</iframe>
```

Replace `YOUR_PAGE_ID` with a unique identifier for each page (e.g., `blog-post-123`, `product-456`).

For automatic height adjustment and advanced features, see the [Advanced Embedding Guide](#11-using-as-an-iframe) below.

---

## 2. Deployment Options

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
- **For Home Server**: Continue with [Prerequisites Installation](#3-prerequisites-installation)
- **For VPS Deployment**: Skip to [VPS Setup](#4-vps-setup-optional)

---

## 3. Prerequisites Installation

> **VPS Users**: Skip to [VPS Setup](#4-vps-setup-optional)

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

## 4. VPS Setup (Optional)

> Continue to [Domain Setup](#5-domain-setup) if you are using a home server.

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

## 5. Domain Setup

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

## 6. Discord OAuth Setup

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

## 7. Download and Configure Project

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

## 8. SSL/TLS Certificate Setup

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

## 9. Initial Deployment

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

## 10. Testing the Application

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

## 11. Using as an iFrame

### A. Basic iFrame Implementation

Create a test HTML file:
```html
<!DOCTYPE html>
<html>
<head>
    <title>My Blog with Comments</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .comment-section {
            margin-top: 50px;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 600px;
            border: none;
        }
    </style>
</head>
<body>
    <h1>My Blog Post</h1>
    <p>This is my amazing blog post content...</p>
    
    <div class="comment-section">
        <iframe 
            src="https://mycomments.duckdns.org/?pageId=blog-post-1"
            allow="clipboard-write"
            loading="lazy">
        </iframe>
    </div>
</body>
</html>
```

### B. Multiple Pages with Different Comments

Each page gets its own comments by using different `pageId` values:
```html
<!-- Blog post -->
<iframe src="https://mycomments.duckdns.org/?pageId=blog-post-1"></iframe>

<!-- Product page -->
<iframe src="https://mycomments.duckdns.org/?pageId=product-123"></iframe>

<!-- Video page -->
<iframe src="https://mycomments.duckdns.org/?pageId=video-abc"></iframe>
```

### C. Responsive iFrame

```html
<style>
.comment-container {
    position: relative;
    width: 100%;
    padding-bottom: 100%; /* Adjust based on content */
    height: 0;
    overflow: hidden;
}

.comment-container iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
}
</style>

<div class="comment-container">
    <iframe src="https://mycomments.duckdns.org/?pageId=responsive-page"></iframe>
</div>
```

### D. WordPress Integration

**Option 1: HTML Block**
```html
<iframe 
    src="https://mycomments.duckdns.org/?pageId=wp-post-123"
    width="100%" 
    height="600"
    frameborder="0">
</iframe>
```

**Option 2: Shortcode (add to functions.php)**
```php
function comments_iframe_shortcode($atts) {
    $atts = shortcode_atts(array(
        'pageid' => get_the_ID(),
        'height' => '600'
    ), $atts);
    
    return '<iframe src="https://mycomments.duckdns.org/?pageId=' . 
           esc_attr($atts['pageid']) . '" width="100%" height="' . 
           esc_attr($atts['height']) . '" frameborder="0"></iframe>';
}
add_shortcode('comments', 'comments_iframe_shortcode');

// Usage: [comments pageid="custom-id" height="800"]
```

### E. Advanced Iframe Embedding

For automatic height adjustment and advanced integration features, see [COMMENT_IFRAME_EMBEDDING_GUIDE.md](COMMENT_IFRAME_EMBEDDING_GUIDE.md).

The guide covers:
- Automatic iframe resizing
- Multiple comment sections per page
- Dynamic iframe creation
- Message-based communication
- Responsive design considerations

---

## 12. Maintenance and Troubleshooting

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

## 13. Feature Overview

The comment system provides a comprehensive set of features organized into a unified interface.

### Core Features

**Comment System**
- Threaded discussions with nested replies
- Rich Markdown formatting with live preview
- Like/dislike voting system
- 5000 character limit per comment
- @mentions with Discord notifications
- Real-time search and sorting options

**User Management**
- Discord OAuth authentication
- Automatic trust score calculation (0.1-1.0)
- User profiles with avatars and statistics
- Session management with Redis

**Content Moderation**
- AI-powered spam and toxicity detection
- Configurable blocked word filtering
- Duplicate comment prevention
- Smart filtering based on trust scores

### Moderation Interface

All moderation features are accessible through tabs at the top of the page (moderators only):

**Comments Tab** - Main comment interface with inline moderation actions
**Reports Tab** - Review and resolve user reports
**Users Tab** - Manage users, moderators, bans, and warnings
**Logs Tab** - Audit trail of all moderation actions
**Analytics Tab** - Visual activity tracking and statistics
**Theme Tab** - Color customization (super moderators only)

### Advanced Features

**Ban System**
- Predefined durations from 30 minutes to permanent
- Custom duration support
- Automatic expiration
- Ban reasons displayed to users

**Warning System**
- Issue warnings that users must acknowledge
- Warning history tracking
- Affects user trust scores

**Analytics Dashboard**
- Daily, weekly, monthly, and quarterly views
- Interactive bubble and bar charts
- Export visualizations as PNG
- Activity tracking by page

**Theme Customization**
- Customizable colors for all UI elements
- Six preset themes
- Import/export theme configurations
- Live preview with undo support

### Security & Performance

**Security**
- HTTPS enforcement with TLS 1.2/1.3
- Rate limiting (5 auth attempts, 100 requests per 15 min)
- XSS and CSRF protection
- SQL injection prevention

**Performance**
- Redis caching layer
- PostgreSQL with optimized indexes
- Lazy loading for images
- Batch comment loading (50 per page)

### Integration Options

**Iframe Embedding**
- Simple iframe integration
- Automatic height adjustment
- Page isolation with pageId parameter
- Cross-domain messaging support

**Discord Bot**
- Mention notifications via DM
- User preference controls
- Deep linking to comments

For detailed usage instructions, see the [Detailed Feature Guide](#14-detailed-feature-guide) section.

---

## 14. Detailed Feature Guide

This section provides an in-depth walkthrough of every feature and tab in the unified comment system interface.

### Main Interface Overview

The comment system is a single-page application (index.html) with all features integrated into a tabbed interface. For moderators, a tab bar appears at the top with six sections: Comments, Reports, Users, Logs, Analytics, and Theme (super moderators only).

### Sign In Process
1. **Discord OAuth Button**: Located in the top-right corner, click "Sign in with Discord"
2. **Authorization**: Discord requests permission to share your username and avatar
3. **Session Creation**: After authorization, you're logged in for SESSION_DURATION (default 24 hours)
4. **User Display**: Your Discord avatar and username appear in the top-right corner

### Comments Tab (Default View)

This is the main comment interface visible to all users.

#### Comment Form
1. **Text Area**: 
   - 5000 character limit with live character counter
   - Auto-resizes as you type
   - Supports multiline input with Enter key
   - Submit with Ctrl+Enter or click "Post Comment"

2. **Markdown Toolbar**:
   - **Bold (B)**: Wraps selected text with `**text**`
   - **Italic (I)**: Wraps selected text with `*text*`
   - **Strikethrough (S)**: Wraps selected text with `~~text~~`
   - **Header (H)**: Adds `## ` prefix for headers
   - **Spoiler**: Wraps text with `||spoiler||` tags
   - **Image**: Inserts `![alt text](url)` template
   - **Video**: Inserts `[Video Title](youtube-url)` template

3. **Markdown Preview**:
   - Toggle "Preview" to see rendered output
   - Supports all GitHub-flavored markdown
   - YouTube links auto-embed as players
   - Images display inline with max width constraints

#### Comment Display
1. **Comment Structure**:
   - Avatar on the left (from Discord)
   - Username with "@" prefix
   - Relative timestamp ("2 hours ago")
   - Formatted comment content
   - Action buttons below

2. **Voting System**:
   - **Thumbs Up**: Like a comment (highlighted when clicked)
   - **Thumbs Down**: Dislike a comment (highlighted when clicked)
   - Vote counts display next to each button
   - Can change vote or remove by clicking again
   - Cannot vote on your own comments

3. **Comment Actions Menu** (three dots):
   - **Reply**: Opens reply form indented under parent
   - **Report**: Opens report dialog with reason input
   - **Delete** (own comments only): Removes comment with confirmation
   - **Focus**: Isolates comment thread, hiding others

4. **@Mentions**:
   - Type "@" to trigger username search
   - Dropdown shows matching users with avatars
   - Use arrow keys to navigate, Enter to select
   - Creates clickable mention in format `@username`
   - Mentioned users receive Discord DM if enabled

5. **Search and Sort**:
   - **Search Bar**: Filter comments by keywords with AND/OR/NOT modes
   - **Sort Options**: Top (most liked), Popular, Newest, Oldest
   - **Results Update**: Real-time as you type

#### Moderator Actions in Comments
For moderators, each comment has additional options:
- **Delete**: Remove any comment with reason logging
- **Warn User**: Issue warning visible on next login
- **Ban User**: Quick ban with duration selection

### Reports Tab (Moderators Only)

Accessed by clicking the "Reports" tab in the moderation panel. Shows a red badge with count if there are pending reports.

#### Report List View
1. **Report Cards**:
   - **Reporter Info**: Who reported and when
   - **Reported User**: Username and avatar of the reported user
   - **Report Reason**: User-provided explanation
   - **Comment Preview**: First 200 characters of reported comment
   - **Page Context**: Which pageId the comment belongs to

2. **Report Actions**:
   - **Jump to Comment**: Switches to Comments tab and scrolls to the reported comment
   - **Delete Comment**: Removes comment and creates moderation log entry
   - **Warn User**: Issues warning that user must acknowledge on next visit
   - **Ban User**: Opens ban modal with duration options
   - **Dismiss**: Marks report as resolved without action

3. **Filtering Options**:
   - **Page Filter**: Dropdown to show reports from specific pages only
   - **Status Filter**: Toggle between pending and resolved reports
   - **Auto-refresh**: Updates every 30 seconds

### Users Tab (Moderators Only)

Comprehensive user management interface accessed via the "Users" tab.

#### User Filters
Toggle buttons at the top to filter users:
- **All**: Complete user list
- **Moderators**: Users with moderator privileges
- **Banned**: Currently banned users with expiration times
- **Warned**: Users with active warnings
- **Reported**: Users who have been reported

#### User List
1. **User Cards** display:
   - Discord avatar and username
   - Join date (first comment)
   - Trust score with color indicator:
     - Green (0.8-1.0): Trusted user
     - Yellow (0.4-0.7): Average user  
     - Red (0.1-0.3): Problematic user
   - Statistics: Total comments, reports made, reports received

2. **Expandable Details** (click user card):
   - **Recent Comments**: Last 10 comments with timestamps and content
   - **Warnings**: Full history with reasons, dates, and issuing moderator
   - **Reports**: All reports involving this user (made by or against)
   - **Ban History**: Past and current bans with durations and reasons

3. **User Actions**:
   - **Toggle Moderator**: Grant or revoke moderator status
   - **Warn User**: Issue new warning with custom message
   - **Ban User**: Opens ban modal with duration selection
   - **View Comments**: Switches to Comments tab filtered by this user

#### Search Functionality
- Real-time search by username
- Results update as you type
- Maintains current filter while searching

### Logs Tab (Moderators Only)

Audit trail of all moderation actions, accessed via the "Logs" tab.

#### Log Display
Each entry shows:
- **Timestamp**: Exact date and time of action
- **Moderator**: Who performed the action (avatar + username)
- **Action Type**: Delete comment, warn user, ban user, unban, toggle moderator
- **Target User**: Who was affected (avatar + username)
- **Details**: Reason provided, duration for bans
- **Page Context**: Where the action occurred (if applicable)

#### Filtering Options
1. **By Moderator**: Dropdown to see specific moderator's actions
2. **By Action Type**: Filter by delete, warn, ban, etc.
3. **Date Range**: Last 24 hours, 7 days, 30 days, or all time
4. **Search**: Find logs by username or reason text

#### Pagination
- 50 entries per page
- Navigation controls at bottom
- Total count displayed

### Analytics Tab (Moderators Only)

Data visualization dashboard accessed via the "Analytics" tab.

#### Period Selection
Buttons at the top to choose time range:
- **Daily**: Last 24 hours
- **Weekly**: Last 7 days (default)
- **Monthly**: Last 30 days
- **Quarterly**: Last 90 days

#### Visualizations

1. **Bubble Chart** (Top Section):
   - Each bubble represents a page with comments
   - Bubble size indicates comment volume
   - Color intensity shows activity level
   - Hover to see exact numbers
   - Shows top 50 most active pages
   - Click bubble to filter Comments tab by that page

2. **Bar Chart** (Bottom Section):
   - X-axis: Dates in selected period
   - Y-axis: Number of comments
   - Hover for exact count per day
   - Visual representation of comment trends
   - Helps identify peak activity times

3. **Summary Statistics**:
   - Total comments in period
   - Number of unique pages with activity
   - Average comments per day
   - Most active day highlighted

#### Export Features
- **Download as PNG**: Saves current visualization
- **Refresh**: Updates with latest data
- **Auto-refresh**: Every 5 minutes

### Theme Tab (Super Moderators Only)

Only visible to super moderators (initial moderators defined in INITIAL_MODERATORS).

#### Color Customization Interface

1. **Color Categories**:
   - **Primary Colors**: 
     - Main: Buttons, links, active states
     - Hover: Hover states for interactive elements
     - Light: Backgrounds and subtle accents
   - **Background Colors**:
     - Main: Primary page background
     - Secondary: Card and component backgrounds
   - **Text Colors**:
     - Main: Primary text
     - Secondary: Subdued text, timestamps
     - Muted: Disabled states
     - Inverse: Text on colored backgrounds
   - **Border Colors**:
     - Main: Primary borders
     - Light: Subtle dividers

2. **Color Input Methods**:
   - **Color Picker**: Click color swatch to open system picker
   - **Hex Input**: Type or paste hex codes directly
   - **Eye Dropper**: Pick colors from anywhere on screen (Chrome/Edge only)
   - **Copy/Paste**: Right-click to copy, paste between swatches

3. **Theme Presets**:
   Quick-apply buttons for predefined themes:
   - **Light**: Default bright theme
   - **Dark**: Dark mode with high contrast
   - **Blue**: Professional blue color scheme
   - **Green**: Calm green palette
   - **Purple**: Modern purple theme
   - **Orange**: Warm orange tones

4. **Actions**:
   - **Save**: Stores current colors to database
   - **Apply**: Preview without saving  
   - **Reset**: Revert to last saved state
   - **Export**: Download as CSS file
   - **Import**: Upload CSS theme file

### Additional Features

#### Ban System
1. **Ban Modal Options**:
   - **Duration**: 5 minutes, 1 hour, 24 hours, 7 days, 30 days, or permanent
   - **Reason**: Required text explanation
   - **Ban History**: Shows previous bans for context
   - **IP Tracking**: Optional IP-based ban enforcement

2. **Ban Effects**:
   - Cannot post comments
   - Cannot vote on comments
   - Cannot report comments
   - Sees ban notification with expiration
   - Can still read comments

#### Warning System
1. **Warning Creation**:
   - Custom message from moderator
   - No expiration (manual acknowledgment required)
   - Logged in moderation history

2. **Warning Display**:
   - Modal popup on user's next visit
   - Must click "Acknowledge" to proceed
   - Warning text preserved in user history

#### Trust Score System
1. **Score Calculation**:
   - Positive factors: Upvoted comments, age of account, comment frequency
   - Negative factors: Reports received, deleted comments, bans
   - Range: 0.0 (worst) to 1.0 (best)
   - Updates hourly

2. **Score Effects**:
   - High (>0.8): Bypass some spam filters
   - Medium (0.4-0.8): Normal filtering
   - Low (<0.4): Additional scrutiny, rate limits

#### Rate Limiting
1. **Comment Posting**:
   - 1 comment per 30 seconds (new users)
   - 1 comment per 10 seconds (trusted users)
   - Burst allowance for active discussions

2. **Voting**:
   - 10 votes per minute
   - Cannot repeatedly vote/unvote same comment

3. **Reporting**:
   - 5 reports per hour
   - Duplicate reports ignored

#### Notification Preferences
Users can control Discord notifications:
1. **Mention Notifications**: Toggle on/off
2. **Reply Notifications**: Toggle on/off
3. **Weekly Digest**: Summary of activity
4. **DM Privacy**: Allow/block bot DMs

### Embedding Features

#### Basic Embedding
```html
<iframe src="https://yourdomain.com/?pageId=unique-id"></iframe>
```

#### Advanced Embedding
With automatic height adjustment:
```html
<iframe id="comments" src="https://yourdomain.com/?pageId=unique-id"></iframe>
<script>
window.addEventListener('message', (e) => {
  if (e.data.type === 'resize' && e.data.frameId === 'comments') {
    document.getElementById('comments').height = e.data.height;
  }
});
</script>
```

#### URL Parameters
- `pageId`: Required, unique identifier for comment thread
- `theme`: Optional, "light" or "dark" (overrides saved theme)
- `sort`: Optional, "newest", "oldest", "top", "popular"
- `highlight`: Optional, comment ID to highlight on load

### Keyboard Shortcuts
- **Ctrl+Enter**: Submit comment
- **Ctrl+B**: Bold selected text
- **Ctrl+I**: Italic selected text
- **Ctrl+K**: Insert link
- **Escape**: Close modals
- **@**: Trigger mention dropdown
- **/**: Focus search box

### Mobile Experience
- Responsive design adapts to screen size
- Touch-friendly buttons and inputs
- Swipe gestures for navigation
- Optimized modals for small screens
- Virtual keyboard awareness

---

## 15. Project Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Nginx)                       │
│                    - Static HTML/JS/CSS                       │
│                    - TLS Termination                          │
│                    - Rate Limiting                            │
│                    - Reverse Proxy                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS
        ┌─────────────────┴──────────────┬────────────────────┐
        │                                │                      │
┌───────▼────────┐              ┌────────▼────────┐   ┌────────▼────────┐
│   Backend API  │              │   Moderation    │   │     Frontend     │
│   (Node.js)    │◄─────────────│    Service      │   │   Static Files   │
│                │   HTTP       │   (Node.js)     │   │   (HTML/JS)      │
│ - Auth         │              │                 │   │                  │
│ - Comments     │              │ - NLP Analysis  │   │ - Alpine.js      │
│ - Votes        │              │ - Spam Filter   │   │ - TailwindCSS    │
│ - Reports      │              │ - Trust Score   │   │ - Markdown-it    │
└────────────────┘              └─────────────────┘   └─────────────────┘
        │                                │
        │                                │
┌───────▼────────┐              ┌────────▼────────┐
│  PostgreSQL    │              │   PostgreSQL    │
│  (Comments)    │              │  (Moderation)   │
│                │              │                 │
│ - Users        │              │ - Logs          │
│ - Comments     │              │ - Blocked Words │
│ - Votes        │              │ - Trust Scores  │
│ - Reports      │              │                 │
└────────────────┘              └─────────────────┘
        │
┌───────▼────────┐
│     Redis      │
│                │
│ - Sessions     │
│ - Cache        │
│ - Rate Limits  │
└────────────────┘
```

### Directory Structure

```
CommentSectionWebApp/
├── backend/
│   ├── api/
│   │   ├── server.js           # Main API server
│   │   ├── package.json        # API dependencies
│   │   ├── Dockerfile          # API container config
│   │   └── .env.example        # API environment template
│   └── moderation/
│       ├── moderation-server.js # Moderation service
│       ├── package.json        # Moderation dependencies
│       ├── Dockerfile          # Moderation container config
│       └── .env.example        # Moderation environment template
├── frontend/
│   ├── index.html              # Main comment interface
│   ├── moderators.html         # Moderator management
│   ├── reports.html            # Global reports dashboard
│   ├── oauth-callback.html     # Discord OAuth callback
│   └── iframe-test.html        # iFrame testing page
├── docker/
│   ├── nginx.conf              # Nginx configuration
│   ├── generate-dhparam.sh     # DH parameters generator
│   └── ssl/                    # SSL certificates directory
│       └── renew-ssl.sh        # Certificate renewal script
├── docker-compose.yml          # Container orchestration
├── .env.example                # Main environment template
├── .gitignore                  # Git ignore rules
├── LICENSE                     # MIT License
└── README.md                   # This file
```

### Technology Stack

**Frontend:**
- Alpine.js - Reactive UI framework
- TailwindCSS - Utility-first CSS
- Markdown-it - Markdown parsing
- Font Awesome - Icons

**Backend:**
- Node.js - JavaScript runtime
- Express.js - Web framework
- PostgreSQL - Primary database
- Redis - Session store & cache

**Infrastructure:**
- Docker & Docker Compose - Containerization
- Nginx - Web server & reverse proxy
- Let's Encrypt - TLS certificates

**Security:**
- Discord OAuth 2.0 - Authentication
- Helmet.js - Security headers
- Rate limiting - DDoS protection
- CORS - Cross-origin control

**AI/ML:**
- Natural - NLP library
- Sentiment analysis
- Spam detection
- Trust scoring

### Database Schema

**Comments Database:**
- `users` - Discord user information
- `comments` - Comment content and metadata
- `votes` - Like/dislike records
- `reports` - User reports on comments

**Moderation Database:**
- `moderation_logs` - All moderation decisions
- `blocked_words` - Prohibited terms
- `trusted_users` - User reputation scores

### API Endpoints

**Public:**
- `GET /api/health` - Health check
- `GET /api/config` - Client configuration
- `GET /api/comments/:pageId` - Get comments for page
- `POST /api/discord/callback` - OAuth callback

**Authenticated:**
- `POST /api/comments` - Create comment
- `POST /api/comments/:id/vote` - Vote on comment
- `DELETE /api/comments/:id` - Delete comment
- `POST /api/comments/:id/report` - Report comment

**Moderator Only:**
- `GET /api/reports` - View all reports
- `PUT /api/reports/:id/resolve` - Resolve report
- `POST /api/users/:id/ban` - Ban user
- `GET /api/moderators` - List moderators
- `PUT /api/users/:id/moderator` - Grant/revoke moderator

### Security Features

- **HTTPS Only** - TLS 1.2/1.3 with strong ciphers
- **Authentication** - Discord OAuth 2.0
- **Session Management** - Redis with 24hr expiry
- **Input Validation** - All inputs sanitized
- **SQL Injection Prevention** - Parameterized queries
- **XSS Protection** - Content Security Policy
- **CSRF Protection** - State validation
- **Rate Limiting** - Multiple tiers
- **DDoS Protection** - Nginx rate limiting
- **Content Moderation** - AI-powered filtering

---

## Quick Reference

### Included Files
- `docker/ssl/` - SSL certificate directory (add your certificates here)
- `docker/ssl/renew-ssl.sh` - Auto-renewal script for SSL certificates
- `docker/generate-dhparam.sh` - DH parameter generation (runs automatically)
- All example environment files with sensible defaults

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

---

## 16. File Reference

### Files You Need to Create
- `.env` (copy from `.env.example`)
- SSL certificates in `docker/ssl/`:
  - `fullchain.pem`
  - `privkey.pem`
  - `chain.pem`

### Root Directory Files

**`/docker-compose.yml`**  
Main orchestration file that defines all services (databases, Redis, backend APIs, frontend). Controls how containers interact, sets up networks, volumes, and environment variables.

**`/.env.example`**  
Template for all environment variables. Contains complete configuration for all services including database passwords, Discord OAuth credentials, API ports, and SSL domain. Copy to `.env` and update with your values.

**`/.gitignore`**  
Git ignore file that prevents sensitive files from being tracked. Ignores:
- Generated `dhparam.pem` file (unique per deployment)
- SSL certificates (fullchain.pem, privkey.pem, chain.pem)
- Environment files (.env files containing secrets)
- Contains comments suggesting additional patterns users might want to add

**`/LICENSE`**  
MIT License file allowing free use, modification, and distribution of this software.

**`/COMMENT_IFRAME_EMBEDDING_GUIDE.md`**  
Comprehensive guide for embedding the comment system in websites with advanced features like automatic resizing and message-based communication.

### Frontend Files

**`/frontend/index.html`**  
Main comment interface. Contains the comment form, comment list, voting buttons, and moderator panel. Uses Alpine.js for reactivity and includes Discord OAuth integration.

**`/frontend/moderators.html`**  
Moderator management interface. Allows existing moderators to add/remove other moderators. Requires moderator privileges to access.

**`/frontend/reports.html`**  
Global reports dashboard. Shows all pending comment reports across all pages. Moderators can delete comments, ban users, or dismiss reports from here.

**`/frontend/oauth-callback.html`**  
Discord OAuth callback handler. Receives the authorization code from Discord, exchanges it for user data, and passes it back to the main window. Users don't interact with this directly.

**`/frontend/iframe-test.html`**  
Example page showing how to embed the comment system in an iframe. Useful for testing iframe integration before adding to your actual website.

**`/frontend/css/main.css`**  
Custom styles complementing Tailwind CSS framework.

**`/frontend/js/`**
- `unified-app.js` - Main application logic with Alpine.js
- `auth.js` - Discord OAuth authentication handling
- `ban-handler.js` - Ban management functionality
- `config.js` - Client-side configuration
- `markdown.js` - Markdown processing and preview
- `utils.js` - Utility functions and helpers

### Backend API Files

**`/backend/api/server.js`**  
Main API server handling all comment operations. Manages Discord OAuth, user sessions, comment CRUD operations, voting, reporting, and moderator functions. Connects to PostgreSQL and Redis.

**`/backend/api/package.json`**  
Defines API dependencies including Express, PostgreSQL client, Redis client, and security packages. Also contains npm scripts for running the server.

**`/backend/api/Dockerfile`**  
Container configuration for the API service. Based on Node.js Alpine image, installs dependencies, and runs as non-root user for security.

**`/backend/api/jobs/analytics-calculator.js`**  
Analytics data aggregation job that runs daily to calculate comment statistics.

**`/backend/api/recalculate-analytics.js`**  
Manual script for recalculating analytics data when needed.

### Moderation Service Files

**`/backend/moderation/moderation-server.js`**  
AI-powered content moderation service. Uses Natural Language Processing to detect spam, toxicity, and inappropriate content. Maintains blocked words list and user trust scores.

**`/backend/moderation/package.json`**  
Defines moderation service dependencies including Express, PostgreSQL client, and Natural NLP library. Lighter than main API as it focuses solely on content analysis.

**`/backend/moderation/Dockerfile`**  
Container configuration for moderation service. Similar to API Dockerfile but for the moderation microservice.

### Discord Bot Files

**`/backend/discord-bot/notification-bot.js`**  
Discord bot service that sends mention notifications to users via Discord DMs.

**`/backend/discord-bot/package.json`**  
Bot dependencies including Discord.js and database clients.

### Docker Files

**`/Dockerfile.api`**  
Container configuration for the main API server. Based on Node.js Alpine for minimal size.

**`/Dockerfile.moderation`**  
Container configuration for the AI moderation service. Includes Natural language processing dependencies.

**`/Dockerfile.discord-bot`**  
Container configuration for the Discord notification bot. Handles mention notifications.

### Nginx Configuration

**`/docker/nginx.conf`**  
Nginx web server configuration. Handles HTTPS/TLS termination, HTTP to HTTPS redirects, rate limiting, security headers, and reverse proxying to backend services. Core of the security infrastructure.

**`/docker/generate-dhparam.sh`**  
Shell script that generates Diffie-Hellman parameters for enhanced TLS security. Runs automatically on container startup if DH params don't exist. Features:
- Installs OpenSSL automatically if not present in nginx:alpine image
- Checks if SSL directory is writable before attempting generation
- Generates 2048-bit DH parameters for enhanced security
- Only runs once (skips if dhparam.pem already exists)

**`/docker/ssl/`**  
Directory for SSL certificates and security files. This directory is writable by the container. Contains:
- `renew-ssl.sh` - Automated certificate renewal script that handles stopping/starting services and copying certificates
- `dhparam.pem` - Diffie-Hellman parameters (generated automatically on first run)
- `fullchain.pem` - Certificate chain (you add this)
- `privkey.pem` - Private key (you add this)
- `chain.pem` - Intermediate certificates (you add this)

**`/docker/ssl/renew-ssl.sh`**  
Automated SSL certificate renewal script. Features:
- Automatically uses SSL_DOMAIN from root .env file
- Stops frontend container to free port 80 for renewal
- Runs certbot renewal
- Copies new certificates to the SSL directory
- Sets proper permissions
- Restarts frontend container
- Can be run manually or via cron job

### Docker Compose Services

The `docker-compose.yml` file creates these services:

**`postgres-comments`**  
PostgreSQL database for user data, comments, votes, and reports. Stores all user-generated content.

**`postgres-moderation`**  
Separate PostgreSQL database for moderation logs, blocked words, and trust scores. Isolated for security and performance.

**`redis`**  
In-memory data store for user sessions, cache, and rate limiting. Configured with persistence and memory limits.

**`backend-api`**  
Node.js Express API server. Handles all client requests, authentication, and business logic.

**`moderation-service`**  
Node.js moderation microservice. Analyzes content before it's posted to prevent spam and abuse.

**`frontend`**  
Nginx web server serving static files and handling TLS. Entry point for all HTTP/HTTPS traffic.

**`discord-bot`**  
Discord bot service for sending mention notifications to users.

### Docker Volumes

**`postgres-comments-data`**  
Persistent storage for comments database. Survives container restarts and updates.

**`postgres-moderation-data`**  
Persistent storage for moderation database. Keeps blocked words and moderation history.

**`redis-data`**  
Persistent storage for Redis. Maintains sessions and cache between restarts.

### Database Tables

**Comments Database (`comments_db`):**
- `users` - Discord user profiles and permissions
- `comments` - Comment content with threading support
- `votes` - Like/dislike records
- `reports` - User reports on comments
- `report_rate_limits` - Prevents report spam
- `bans` - Ban records with expiration
- `warnings` - User warnings issued by moderators
- `user_notification_preferences` - Discord notification settings
- `analytics_daily` - Daily comment statistics
- `moderator_actions` - Moderation action logs
- `theme_config` - Custom theme settings

**Moderation Database (`moderation_db`):**
- `moderation_logs` - AI moderation decisions
- `blocked_words` - Prohibited terms with severity
- `trusted_users` - User reputation tracking
- `comment_hashes` - Duplicate detection

### Key Configuration Files

**Environment Variables** (`.env` file):
- Database passwords (must match across services)
- Discord OAuth credentials (from Discord Developer Portal)
- Discord Bot token (for mention notifications)
- SSL domain name (your DuckDNS or actual domain)
- Initial moderators (Discord user IDs)
- Admin keys (for moderation management)

**Critical Security Files:**
- TLS certificates (Let's Encrypt or commercial)
- DH parameters (generated automatically)
- Session secrets (in environment variables)
- Database passwords (in environment variables)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions:
1. Check the logs: `docker-compose logs -f`
2. Review your `.env` configurations
3. Verify Discord OAuth settings
4. Check firewall and port forwarding
5. Submit an issue on GitHub

---

**Built with ❤️ for modern web applications**