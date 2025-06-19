# Detailed Guide

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Detailed Feature Guide](#detailed-feature-guide)
   - [Main Interface Overview](#main-interface-overview)
   - [Sign In Process](#sign-in-process)
   - [Comments Tab](#comments-tab-default-view)
   - [Reports Tab](#reports-tab-moderators-only)
   - [Users Tab](#users-tab-moderators-only)
   - [Logs Tab](#logs-tab-moderators-only)
   - [Analytics Tab](#analytics-tab-moderators-only)
   - [Theme Tab](#theme-tab-super-moderators-only)
   - [Additional Features](#additional-features)
   - [Embedding Features](#embedding-features)
   - [Keyboard Shortcuts](#keyboard-shortcuts)
   - [Mobile Experience](#mobile-experience)
3. [Project Architecture](#project-architecture)
   - [System Components](#system-components)
   - [Directory Structure](#directory-structure)
   - [Technology Stack](#technology-stack)
   - [Database Schema](#database-schema)
   - [API Endpoints](#api-endpoints)
   - [Security Features](#security-features)
4. [File Reference](#file-reference)
   - [Files You Need to Create](#files-you-need-to-create)
   - [Root Directory Files](#root-directory-files)
   - [Frontend Files](#frontend-files)
   - [Backend API Files](#backend-api-files)
   - [Moderation Service Files](#moderation-service-files)
   - [Discord Bot Files](#discord-bot-files)
   - [Docker Files](#docker-files)
   - [Nginx Configuration](#nginx-configuration)
   - [Docker Compose Services](#docker-compose-services)
   - [Docker Volumes](#docker-volumes)
   - [Database Tables](#database-tables)
   - [Key Configuration Files](#key-configuration-files)

---

## Feature Overview

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

---

## Detailed Feature Guide

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

## Project Architecture

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

## File Reference

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