# Complete Windows Deployment Guide for Comment System

This guide walks you through deploying the Comment System backend servers on Windows with public IP access.

## Prerequisites Installation

### 1. Install Docker Desktop for Windows

1. Download Docker Desktop from: https://www.docker.com/products/docker-desktop/
2. Run the installer (Docker Desktop Installer.exe)
3. During installation:
   - Enable WSL 2 (Windows Subsystem for Linux) when prompted
   - Keep "Use WSL 2 instead of Hyper-V" selected
4. Restart your computer when prompted
5. After restart, Docker Desktop should start automatically
6. If you see a WSL 2 installation incomplete error:
   - Download the WSL2 kernel update: https://aka.ms/wsl2kernel
   - Install it and restart Docker Desktop

### 2. Install Git for Windows

1. Download Git from: https://git-scm.com/download/win
2. Run the installer with default settings
3. This will also install Git Bash, which we'll use for commands

### 3. Install a Text Editor (if needed)

- Recommended: Visual Studio Code from https://code.visualstudio.com/
- Alternative: Notepad++ from https://notepad-plus-plus.org/

## Step-by-Step Deployment Guide

### Step 1: Open Windows Firewall Ports

1. Press `Windows + R`, type `wf.msc` and press Enter
2. Click "Inbound Rules" on the left
3. Click "New Rule..." on the right
4. Create rule for Backend API (port 3000):
   - Select "Port" → Next
   - Select "TCP" and enter "3000" → Next
   - Select "Allow the connection" → Next
   - Check all profiles (Domain, Private, Public) → Next
   - Name: "Comment Backend API" → Finish
5. Repeat steps 3-4 for Moderation API (port 3001):
   - Use port "3001"
   - Name: "Comment Moderation API"

Alternative PowerShell method (Run as Administrator):
```powershell
# Open PowerShell as Administrator (Right-click Start → Windows PowerShell (Admin))
New-NetFirewallRule -DisplayName "Comment Backend API" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "Comment Moderation API" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

### Step 2: Configure Router Port Forwarding

Since you're using IP 24.22.137.234, you'll need to forward ports from your router:

1. Find your computer's local IP:
   - Open Command Prompt
   - Type `ipconfig`
   - Look for "IPv4 Address" (probably something like 192.168.1.XXX)

2. Access your router:
   - Open web browser
   - Go to 192.168.1.1 or 192.168.0.1 (common router addresses)
   - Login with router credentials

3. Find Port Forwarding section (may be under):
   - "Advanced" → "Port Forwarding"
   - "NAT" → "Virtual Servers"
   - "Applications & Gaming" → "Port Forwarding"

4. Add these rules:
   ```
   Name: Comment Backend
   External Port: 3000
   Internal IP: [Your computer's local IP]
   Internal Port: 3000
   Protocol: TCP
   
   Name: Comment Moderation
   External Port: 3001
   Internal IP: [Your computer's local IP]
   Internal Port: 3001
   Protocol: TCP
   ```

5. Save and apply changes

### Step 3: Clone the Repository

1. Open Git Bash (installed with Git)
2. Navigate to where you want the project:
   ```bash
   cd /c/Users/YourUsername/Documents
   # or wherever you want to store the project
   ```

3. Clone the repository:
   ```bash
   git clone https://github.com/christianblevens/CommentSectionWebApp.git
   cd CommentSectionWebApp
   ```

### Step 4: Configure Backend Server

1. Navigate to BackendServer:
   ```bash
   cd BackendServer
   ```

2. Create .env file from template:
   ```bash
   cp .env.example .env
   ```

3. Edit .env file:
   - In Git Bash: `nano .env` (or use `notepad .env`)
   - Or open with VS Code: `code .env`

4. Set these values:
   ```env
   # Discord OAuth Configuration (REQUIRED)
   DISCORD_CLIENT_ID=1377826318456193094
   DISCORD_CLIENT_SECRET=your_actual_discord_secret_here
   DISCORD_REDIRECT_URI=https://christianblevens.github.io/CommentSectionWebApp/oauth-callback.html
   
   # Database Configuration
   DB_PASSWORD=choose_a_strong_password_here
   
   # Server Configuration
   PORT=3000
   NODE_ENV=production
   
   # Security Configuration
   ALLOWED_ORIGINS=https://christianblevens.github.io,http://localhost:8080
   
   # Generate a secure JWT secret (use a password generator)
   JWT_SECRET=generate_a_32_character_random_string_here
   
   # Rate Limiting
   RATE_LIMIT_MAX=100
   RATE_LIMIT_WINDOW_MS=60000
   ```

5. Start the Backend server:
   ```bash
   docker-compose up -d
   ```

   First time running will:
   - Download Docker images
   - Create containers
   - Initialize databases
   - Start services

### Step 5: Configure Moderation Server

1. Navigate to ModerationServer:
   ```bash
   cd ../ModerationServer
   ```

2. Create .env file:
   ```bash
   cp .env.example .env
   ```

3. Edit .env file:
   ```env
   # Admin Configuration (REQUIRED)
   ADMIN_KEY=create_a_very_secure_admin_key_here
   
   # Database Configuration
   DB_PASSWORD=choose_a_strong_password_here
   
   # Server Configuration
   PORT=3001
   NODE_ENV=production
   
   # Security Configuration
   ALLOWED_ORIGINS=https://christianblevens.github.io,http://localhost:8080
   
   # Rate Limiting for Admin Endpoints
   ADMIN_RATE_LIMIT_MAX=10
   ADMIN_RATE_LIMIT_WINDOW_MS=60000
   ```

4. Start the Moderation server:
   ```bash
   docker-compose up -d
   ```

### Step 6: Verify Services are Running

1. Check Docker containers:
   ```bash
   docker ps
   ```
   You should see containers running on ports 3000 and 3001

2. Test locally:
   ```bash
   # Test Backend API
   curl http://localhost:3000/api/health
   
   # Test Moderation API
   curl http://localhost:3001/api/health
   ```

3. Test from external device (phone or another computer):
   - Open browser
   - Go to: http://24.22.137.234:3000/api/health
   - Should see: {"status":"ok","service":"comment-api"}

### Step 7: Discord Configuration

1. Go to https://discord.com/developers/applications
2. Select your application (or create new one)
3. Go to OAuth2 → General
4. Add Redirect URI:
   ```
   https://christianblevens.github.io/CommentSectionWebApp/oauth-callback.html
   ```
5. Save changes
6. Copy Client ID and Client Secret to your .env files

### Step 8: Push Frontend Changes to GitHub

1. Go back to main directory:
   ```bash
   cd /c/Users/YourUsername/Documents/CommentSectionWebApp
   ```

2. Check changes:
   ```bash
   git status
   ```

3. Add and commit:
   ```bash
   git add .
   git commit -m "Configure for Windows deployment with public IP"
   ```

4. Push to GitHub:
   ```bash
   git push origin main
   ```

5. Wait a few minutes for GitHub Pages to update

## Maintenance Commands

### View Logs
```bash
# Backend logs
cd BackendServer
docker-compose logs -f

# Moderation logs
cd ../ModerationServer
docker-compose logs -f
```

### Stop Services
```bash
# Stop Backend
cd BackendServer
docker-compose down

# Stop Moderation
cd ../ModerationServer
docker-compose down
```

### Restart Services
```bash
# Restart Backend
cd BackendServer
docker-compose restart

# Restart Moderation
cd ../ModerationServer
docker-compose restart
```

### Update Services
```bash
# Pull latest changes
git pull

# Rebuild Backend
cd BackendServer
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Rebuild Moderation
cd ../ModerationServer
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Troubleshooting

### "Cannot connect to Docker daemon"
- Make sure Docker Desktop is running (check system tray)
- Restart Docker Desktop
- Restart your computer

### "Port already in use"
- Check what's using the port:
  ```powershell
  netstat -ano | findstr :3000
  ```
- Stop the conflicting service or change port in .env

### Services not accessible from internet
1. Verify Windows Firewall rules are active
2. Check router port forwarding
3. Confirm your public IP hasn't changed:
   - Go to https://whatismyipaddress.com/
   - Should show 24.22.137.234
4. Some ISPs block incoming connections - contact your ISP

### CORS errors in browser console
- Verify ALLOWED_ORIGINS in both .env files includes:
  ```
  https://christianblevens.github.io
  ```
- Restart services after changing .env

### Docker commands not working in Git Bash
- Try using PowerShell or Command Prompt instead
- Or prefix with `winpty`: `winpty docker ps`

## Security Notes

1. **Never commit .env files** - they contain secrets
2. **Use strong passwords** - at least 16 characters
3. **Regular updates** - Keep Docker Desktop updated
4. **Monitor access** - Check logs regularly for suspicious activity
5. **Backup databases** regularly:
   ```bash
   # Backup commands (run in Git Bash)
   docker exec comment-postgres pg_dump -U postgres comments_db > backup_comments_$(date +%Y%m%d).sql
   docker exec moderation-postgres pg_dump -U postgres moderation_db > backup_moderation_$(date +%Y%m%d).sql
   ```

## Quick Reference

- Frontend URL: https://christianblevens.github.io/CommentSectionWebApp/
- Backend API: http://24.22.137.234:3000
- Moderation API: http://24.22.137.234:3001
- Local testing: http://localhost:3000 and http://localhost:3001

Remember to keep Docker Desktop running for your services to stay online!