# Comment Section Web Application

A **production-ready** comment system with Discord OAuth authentication, AI-powered content moderation, and built-in spam protection. Embed it on any website using a simple iframe.

## Key Features

- **🔐 Discord OAuth Authentication** - No passwords, secure login through Discord
- **🤖 AI-Powered Moderation** - Natural language processing detects spam, toxicity, and inappropriate content
- **💬 Rich Text Support** - Markdown formatting with image and video embeds
- **👍 Voting System** - Like/dislike comments with real-time updates
- **🛡️ Advanced Security** - HTTPS only, rate limiting, CSRF protection, SQL injection prevention
- **👮 Moderation Tools** - Report system, user banning, moderator dashboard
- **📱 Responsive Design** - Works on all devices
- **🚀 High Performance** - Redis caching, PostgreSQL with optimized indexes
- **🔄 Real-time Updates** - Comments appear instantly
- **📊 Trust System** - User reputation scoring based on behavior

## Table of Contents
1. [Deployment Options](#1-deployment-options)
2. [Prerequisites Installation](#2-prerequisites-installation)
3. [VPS Setup (Optional)](#3-vps-setup-optional)
4. [Domain Setup](#4-domain-setup)
5. [Discord OAuth Setup](#5-discord-oauth-setup)
6. [Download and Configure Project](#6-download-and-configure-project)
7. [SSL/TLS Certificate Setup](#7-ssltls-certificate-setup)
8. [Initial Deployment](#8-initial-deployment)
9. [Testing the Application](#9-testing-the-application)
10. [Using as an iFrame](#10-using-as-an-iframe)
11. [Maintenance and Troubleshooting](#11-maintenance-and-troubleshooting)
12. [Project Architecture](#12-project-architecture)
13. [File Reference](#13-file-reference)

---

## 1. Deployment Options

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
- **For Home Server**: Continue with [Prerequisites Installation](#2-prerequisites-installation)
- **For VPS Deployment**: Skip to [VPS Setup](#3-vps-setup-optional)

---

## 2. Prerequisites Installation

> **VPS Users**: Skip to [VPS Setup](#3-vps-setup-optional)

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

## 3. VPS Setup (Optional)

> Continue to [Domain Setup](#4-domain-setup) if you are using a home server.

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

## 4. Domain Setup

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

## 5. Discord OAuth Setup

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

## 6. Download and Configure Project

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

### B. Configure Environment Files

> **Note**: The project includes all necessary scripts and directories. You only need to:
> 1. Copy the example environment files
> 2. Configure them with your settings
> 3. Copy your SSL certificates to `docker/ssl/`

1. **Copy Example Files**

   **Windows (PowerShell):**
   ```powershell
   copy .env.example .env
   copy backend\api\.env.example backend\api\.env
   copy backend\moderation\.env.example backend\moderation\.env
   ```

   **Linux/VPS:**
   ```bash
   cp .env.example .env
   cp backend/api/.env.example backend/api/.env
   cp backend/moderation/.env.example backend/moderation/.env
   ```

2. **Edit Root .env File**

   **Windows:** `notepad .env`  
   **Linux:** `nano .env` or `vim .env`

   Update these values:
   ```env
   # PostgreSQL Database Configuration
   DB_USER=postgres
   DB_NAME=comments_db
   DB_PASSWORD=ChangeThisSecurePassword123!

   # Moderation Database Configuration
   MODERATION_DB_NAME=moderation_db

   # SSL/TLS Configuration
   SSL_DOMAIN=mycomments.duckdns.org

   # Docker Compose project name
   COMPOSE_PROJECT_NAME=comment-system
   ```

3. **Edit Backend API .env File**

   **Windows:** `notepad backend\api\.env`  
   **Linux:** `nano backend/api/.env`

   Update with your values:
   ```env
   # Node environment
   NODE_ENV=production

   # Server configuration
   PORT=3000

   # Database configuration - PostgreSQL
   # These values are set via docker-compose.yml from root .env file
   # DB_HOST=postgres-comments
   # DB_PORT=5432
   # DB_NAME=comments_db
   # DB_USER=postgres
   # DB_PASSWORD=(inherited from root .env)

   # Redis configuration
   # Set via docker-compose.yml
   # REDIS_URL=redis://redis:6379

   # Discord OAuth Configuration
   DISCORD_CLIENT_ID=your-discord-client-id-here
   DISCORD_CLIENT_SECRET=your-discord-client-secret-here
   DISCORD_REDIRECT_URI=https://mycomments.duckdns.org/oauth-callback.html

   # Allowed CORS origins
   ALLOWED_ORIGINS=https://mycomments.duckdns.org

   # Initial moderators (Discord IDs)
   INITIAL_MODERATORS=discord_123456789012345678

   # Moderation service URL
   # Set via docker-compose.yml
   # MODERATION_API_URL=http://moderation-service:3001

   # Session configuration
   SESSION_SECRET=generate-a-random-64-character-string-here-for-session-security
   SESSION_DURATION=86400

   # Rate limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # Logging level
   LOG_LEVEL=info
   ```

4. **Edit Moderation Service .env File**

   **Windows:** `notepad backend\moderation\.env`  
   **Linux:** `nano backend/moderation/.env`

   Update:
   ```env
   # Node environment
   NODE_ENV=production

   # Server configuration
   PORT=3001

   # Database configuration
   # These values are set via docker-compose.yml from root .env file
   # DB_HOST=postgres-moderation
   # DB_PORT=5432
   # DB_NAME=moderation_db
   # DB_USER=postgres
   # DB_PASSWORD=(inherited from root .env)

   # Admin key for moderation
   ADMIN_KEY=GenerateAStrongAdminKey123!@#

   # Allowed CORS origins
   ALLOWED_ORIGINS=https://mycomments.duckdns.org

   # Moderation thresholds
   SPAM_THRESHOLD=0.7
   SENTIMENT_THRESHOLD=-3
   CAPS_RATIO_THRESHOLD=0.8
   MIN_TRUST_SCORE=0.1
   MAX_TRUST_SCORE=1.0

   # Logging level
   LOG_LEVEL=info
   ```

### C. Set File Permissions (Linux/VPS Only)

```bash
# Secure the environment files
chmod 600 .env backend/api/.env backend/moderation/.env

# Make scripts executable
chmod +x docker/*.sh
```

---

## 7. SSL/TLS Certificate Setup

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
   cp /etc/letsencrypt/live/your-domain.com/*.pem docker/ssl/
   
   # Set proper permissions
   chmod 644 docker/ssl/*.pem
   chmod 600 docker/ssl/privkey.pem
   ```

### C. Verify SSL Setup

The docker-compose.yml is already configured to use the SSL certificates from `docker/ssl/`. No modifications needed.

### D. Setup Auto-Renewal

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
   # SSL_DOMAIN=your-domain.com
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

## 8. Initial Deployment

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

## 9. Testing the Application

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

## 10. Using as an iFrame

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

---

## 11. Maintenance and Troubleshooting

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

## 12. Project Architecture

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
- PostgreSQL: 5432 (internal)
- Redis: 6379 (internal)

---

## 13. File Reference

### Files You Need to Create
- `.env` (copy from `.env.example`)
- `backend/api/.env` (copy from `backend/api/.env.example`)
- `backend/moderation/.env` (copy from `backend/moderation/.env.example`)
- SSL certificates in `docker/ssl/`:
  - `fullchain.pem`
  - `privkey.pem`
  - `chain.pem`

### Root Directory Files

**`/docker-compose.yml`**  
Main orchestration file that defines all services (databases, Redis, backend APIs, frontend). Controls how containers interact, sets up networks, volumes, and environment variables.

**`/.env.example`**  
Template for root environment variables. Contains Docker-level configurations like database passwords, SSL domain, and project name. Copy to `.env` for use.

**`/.gitignore`**  
Git ignore file, currently empty but preserved for users who may fork and modify the repository. Contains comments suggesting common patterns to ignore like .env files, certificates, and node_modules.

**`/LICENSE`**  
MIT License file allowing free use, modification, and distribution of this software.

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

### Backend API Files

**`/backend/api/server.js`**  
Main API server handling all comment operations. Manages Discord OAuth, user sessions, comment CRUD operations, voting, reporting, and moderator functions. Connects to PostgreSQL and Redis.

**`/backend/api/package.json`**  
Defines API dependencies including Express, PostgreSQL client, Redis client, and security packages. Also contains npm scripts for running the server.

**`/backend/api/Dockerfile`**  
Container configuration for the API service. Based on Node.js Alpine image, installs dependencies, and runs as non-root user for security.

**`/backend/api/.env.example`**  
Template for API environment variables. Contains Discord OAuth credentials, database connections, session secrets, and rate limiting configuration. Critical for API operation.

### Moderation Service Files

**`/backend/moderation/moderation-server.js`**  
AI-powered content moderation service. Uses Natural Language Processing to detect spam, toxicity, and inappropriate content. Maintains blocked words list and user trust scores.

**`/backend/moderation/package.json`**  
Defines moderation service dependencies including Express, PostgreSQL client, and Natural NLP library. Lighter than main API as it focuses solely on content analysis.

**`/backend/moderation/Dockerfile`**  
Container configuration for moderation service. Similar to API Dockerfile but for the moderation microservice.

**`/backend/moderation/.env.example`**  
Template for moderation environment variables. Contains database connection, admin key for management endpoints, and moderation thresholds.

### Docker Configuration Files

**`/docker/nginx.conf`**  
Nginx web server configuration. Handles HTTPS/TLS termination, HTTP to HTTPS redirects, rate limiting, security headers, and reverse proxying to backend services. Core of the security infrastructure.

**`/docker/generate-dhparam.sh`**  
Shell script that generates Diffie-Hellman parameters for enhanced TLS security. Runs automatically on container startup if DH params don't exist. Includes automatic installation of OpenSSL if not present in the nginx:alpine image.

**`/docker/ssl/`**  
Directory for SSL certificates. Copy your Let's Encrypt or commercial certificates here. Contains:
- `renew-ssl.sh` - Automated certificate renewal script that handles stopping/starting services and copying certificates
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

### Docker Volumes

**`postgres-comments-data`**  
Persistent storage for comments database. Survives container restarts and updates.

**`postgres-moderation-data`**  
Persistent storage for moderation database. Keeps blocked words and moderation history.

**`redis-data`**  
Persistent storage for Redis. Maintains sessions and cache between restarts.

**`nginx-ssl`**  
Stores SSL certificates and DH parameters. Can be used instead of bind mount for certificates.

### Database Tables

**Comments Database (`comments_db`):**
- `users` - Discord user profiles
- `comments` - Comment content with threading
- `votes` - Like/dislike records
- `reports` - User reports on comments
- `report_rate_limits` - Prevents report spam

**Moderation Database (`moderation_db`):**
- `moderation_logs` - All content moderation decisions
- `blocked_words` - Prohibited terms with severity levels
- `trusted_users` - User reputation tracking

### Key Configuration Files

**Environment Variables** (`.env` files):
- Database passwords (must match across services)
- Discord OAuth credentials (from Discord Developer Portal)
- SSL domain name (your DuckDNS or actual domain)
- Session secrets (random 64+ character strings)
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