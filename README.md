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
1. [Prerequisites Installation](#1-prerequisites-installation)
2. [DuckDNS Setup](#2-duckdns-setup)
3. [Discord OAuth Setup](#3-discord-oauth-setup)
4. [Download and Configure Project](#4-download-and-configure-project)
5. [Let's Encrypt Setup](#5-lets-encrypt-setup)
6. [Initial Deployment](#6-initial-deployment)
7. [Testing the Application](#7-testing-the-application)
8. [Using as an iFrame](#8-using-as-an-iframe)
9. [Maintenance and Troubleshooting](#9-maintenance-and-troubleshooting)
10. [Project Architecture](#10-project-architecture)
11. [File Reference](#11-file-reference)

---

## 1. Prerequisites Installation

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

### Router Port Forwarding Required

For external access to your comment system, you must configure port forwarding on your router. This allows incoming internet traffic to reach your Docker containers.

**Required Ports:**
- Port 80 (HTTP) - Will redirect to HTTPS
- Port 443 (HTTPS) - Main application access

**Generic Router Configuration Steps:**
1. Access your router's admin panel (usually `192.168.1.1` or `192.168.0.1`)
2. Find "Port Forwarding" section (may be under "Advanced", "NAT", or "Virtual Server")
3. Create two rules:
   - HTTP: External Port 80 → Internal Port 80 → Your computer's local IP
   - HTTPS: External Port 443 → Internal Port 443 → Your computer's local IP
4. Save and apply changes

> **Note:** Every router is different. Search for "[your router model] port forwarding" for specific instructions. Without port forwarding, your comment system will only work on your local network.

---

## 2. DuckDNS Setup

### A. Create DuckDNS Account

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

### B. Configure Router Port Forwarding

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

### C. Test DuckDNS is Working

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

---

## 3. Discord OAuth Setup

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
   - Your ID format: `discord_123456789012345678`

---

## 4. Download and Configure Project

### A. Clone the Repository

**Windows:**
```powershell
cd C:\
mkdir Projects
cd Projects
git clone https://github.com/yourusername/CommentSectionWebApp.git
cd CommentSectionWebApp
```

**Linux:**
```bash
cd ~
mkdir projects
cd projects
git clone https://github.com/yourusername/CommentSectionWebApp.git
cd CommentSectionWebApp
```

### B. Configure Environment Files

1. **Copy Example Files**

   **Windows:**
   ```powershell
   copy .env.example .env
   copy backend\api\.env.example backend\api\.env
   copy backend\moderation\.env.example backend\moderation\.env
   ```

   **Linux:**
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
   DB_PASSWORD=MySecurePassword123!

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
   DB_HOST=postgres-comments
   DB_PORT=5432
   DB_NAME=comments_db
   DB_USER=postgres
   DB_PASSWORD=MySecurePassword123!  # Same as root .env

   # Redis configuration
   REDIS_URL=redis://redis:6379

   # Discord OAuth Configuration
   DISCORD_CLIENT_ID=1234567890123456789
   DISCORD_CLIENT_SECRET=your-client-secret-here
   DISCORD_REDIRECT_URI=https://mycomments.duckdns.org/oauth-callback.html

   # Allowed CORS origins
   ALLOWED_ORIGINS=https://mycomments.duckdns.org

   # Initial moderators (your Discord ID)
   INITIAL_MODERATORS=discord_987654321098765432

   # Moderation service URL
   MODERATION_API_URL=http://moderation-service:3001

   # Session configuration
   SESSION_SECRET=generate64RandomCharactersHere1234567890abcdefghijklmnopqrstuv
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
   DB_HOST=postgres-moderation
   DB_PORT=5432
   DB_NAME=moderation_db
   DB_USER=postgres
   DB_PASSWORD=MySecurePassword123!  # Same as root .env

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

### C. Set File Permissions (Linux Only)

```bash
# Secure the environment files
chmod 600 .env backend/api/.env backend/moderation/.env

# Make scripts executable
chmod +x docker/*.sh
```

---

## 5. Let's Encrypt Setup

**Note:** We're doing Let's Encrypt setup BEFORE deployment so you have valid certificates from the start!

### For Windows

#### A. Install Certbot

1. **Download Certbot**
   - Go to https://certbot.eff.org/instructions
   - Select "Other" for Software and "Windows" for System
   - Download the Windows installer

2. **Install Certbot**
   - Run the downloaded installer
   - Follow installation prompts
   - Certbot will be installed to `C:\Program Files\Certbot\`

#### B. Generate Certificate

1. **Check Port 80 Availability**
   ```powershell
   netstat -ano | findstr :80
   ```
   If something is using it (like IIS), stop that service temporarily.

2. **Run Certbot** (PowerShell as Administrator)
   ```powershell
   certbot certonly --standalone -d mycomments.duckdns.org
   ```

3. **Create SSL Directory and Copy Certificates**
   ```powershell
   cd C:\Projects\CommentSectionWebApp
   mkdir docker\ssl
   copy C:\Certbot\live\mycomments.duckdns.org\fullchain.pem docker\ssl\
   copy C:\Certbot\live\mycomments.duckdns.org\privkey.pem docker\ssl\
   copy C:\Certbot\live\mycomments.duckdns.org\chain.pem docker\ssl\
   ```

### For Linux

#### A. Install Certbot

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install certbot -y
```

**CentOS/RHEL/Fedora:**
```bash
sudo dnf install certbot -y
```

#### B. Generate Certificate

1. **Check Port 80 Availability**
   ```bash
   sudo lsof -i :80
   ```
   If something is using it, stop that service temporarily.

2. **Run Certbot**
   ```bash
   sudo certbot certonly --standalone -d mycomments.duckdns.org
   ```

3. **Create SSL Directory and Copy Certificates**
   ```bash
   cd ~/projects/CommentSectionWebApp
   mkdir -p docker/ssl
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/fullchain.pem docker/ssl/
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/privkey.pem docker/ssl/
   sudo cp /etc/letsencrypt/live/mycomments.duckdns.org/chain.pem docker/ssl/
   
   # Set proper ownership
   sudo chown -R $USER:$USER docker/ssl
   chmod 644 docker/ssl/*.pem
   chmod 600 docker/ssl/privkey.pem
   ```

### C. Modify docker-compose.yml

**Windows:** `notepad docker-compose.yml`  
**Linux:** `nano docker-compose.yml`

Find the `frontend:` section and add this line under `volumes:` (after the nginx.conf line):
```yaml
- ./docker/ssl:/etc/nginx/ssl:ro
```

### D. Setup Auto-Renewal

**Windows:**

1. Create `renew-cert.ps1`:
   ```powershell
   # renew-cert.ps1
   cd C:\Projects\CommentSectionWebApp
   
   # Stop frontend
   docker-compose stop frontend
   
   # Renew certificate
   certbot renew
   
   # Copy new certificates
   copy C:\Certbot\live\mycomments.duckdns.org\fullchain.pem docker\ssl\
   copy C:\Certbot\live\mycomments.duckdns.org\privkey.pem docker\ssl\
   copy C:\Certbot\live\mycomments.duckdns.org\chain.pem docker\ssl\
   
   # Start frontend
   docker-compose start frontend
   ```

2. Schedule with Task Scheduler (weekly at 3 AM)

**Linux:**

1. Add to root's crontab:
   ```bash
   sudo crontab -e
   ```

2. Add this line:
   ```cron
   0 3 * * 0 certbot renew --pre-hook "cd /home/username/projects/CommentSectionWebApp && docker-compose stop frontend" --post-hook "cd /home/username/projects/CommentSectionWebApp && docker-compose start frontend && cp /etc/letsencrypt/live/mycomments.duckdns.org/*.pem /home/username/projects/CommentSectionWebApp/docker/ssl/"
   ```

---

## 6. Initial Deployment

### A. Start the Application

**Windows:**
```powershell
cd C:\Projects\CommentSectionWebApp
docker-compose up -d
```

**Linux:**
```bash
cd ~/projects/CommentSectionWebApp
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

## 7. Testing the Application

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

## 8. Using as an iFrame

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

## 9. Maintenance and Troubleshooting

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

**Windows:** Create `backup.ps1`:
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

**Linux:** Create `backup.sh`:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/backups/comment-system/$DATE"
mkdir -p "$BACKUP_DIR"

cd ~/projects/CommentSectionWebApp

# Backup databases
docker-compose exec -T postgres-comments pg_dump -U postgres comments_db > "$BACKUP_DIR/comments_db.sql"
docker-compose exec -T postgres-moderation pg_dump -U postgres moderation_db > "$BACKUP_DIR/moderation_db.sql"

# Backup configuration
cp .env "$BACKUP_DIR/"
cp backend/api/.env "$BACKUP_DIR/api.env"
cp backend/moderation/.env "$BACKUP_DIR/moderation.env"

echo "Backup completed to $BACKUP_DIR"
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

---

## 10. Project Architecture

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
│   └── ssl/                    # SSL certificates (created by you)
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

## 11. File Reference

### Root Directory Files

**`/docker-compose.yml`**  
Main orchestration file that defines all services (databases, Redis, backend APIs, frontend). Controls how containers interact, sets up networks, volumes, and environment variables.

**`/.env.example`**  
Template for root environment variables. Contains Docker-level configurations like database passwords, SSL domain, and project name. Copy to `.env` for use.

**`/.gitignore`**  
Specifies which files Git should ignore. Includes node_modules, .env files, SSL certificates, and Docker volumes to keep sensitive data out of version control.

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
Shell script that generates Diffie-Hellman parameters for enhanced TLS security. Runs automatically on container startup if DH params don't exist.

**`/docker/ssl/`** (directory you create)  
Directory for SSL certificates. You'll copy Let's Encrypt or commercial certificates here. Contains:
- `fullchain.pem` - Certificate chain
- `privkey.pem` - Private key  
- `chain.pem` - Intermediate certificates

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