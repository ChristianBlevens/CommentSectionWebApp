# Discord Comment System

A production-ready, microservices-based comment system with Discord OAuth authentication, real-time content moderation, and comprehensive moderation tools.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Frontend Pages](#frontend-pages)
- [Deployment](#deployment)
  - [Full System Deployment](#full-system-deployment)
  - [Individual Service Deployment](#individual-service-deployment)
- [Development](#development)
- [Production Checklist](#production-checklist)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Features

- **Discord OAuth Authentication** with debug mode for local testing
- **Hierarchical Comments** with unlimited nesting levels
- **Real-time Content Moderation** using Natural Language Processing
- **Comprehensive Moderation System**:
  - Users can delete their own comments
  - Report system with rate limiting (5 reports/hour/user)
  - Moderator privileges via Discord authentication
  - Moderator management dashboard
  - Global reports page for all content
  - Ban users and delete all their comments
- **Performance Optimized** with Redis caching
- **Docker Deployment** with health checks
- **Multiple Comment Sections** via iframe embedding
- **Rich Text Support** with Markdown, spoilers, and media embedding

## Architecture

```
Frontend (Nginx:8080) → Backend API (Express:3000) → PostgreSQL + Redis
                     ↘ Moderation Service (NLP:3001) → PostgreSQL
```

### Project Structure

```
CommentSectionWebApp/
├── frontend/                    # Frontend HTML files
│   ├── index.html              # Main comment section interface
│   ├── moderators.html         # Moderator management page
│   ├── reports.html            # Global reports dashboard
│   ├── iframe-test.html        # Testing multiple comment sections
│   └── oauth-callback.html     # Discord OAuth callback handler
│
├── backend/
│   ├── api/                    # Main backend API service
│   │   ├── server.js          # Express API server
│   │   ├── package.json       # Node dependencies
│   │   ├── Dockerfile         # Container configuration
│   │   ├── docker-compose.yml # Standalone deployment
│   │   └── .env.example       # Environment template
│   │
│   └── moderation/            # Content moderation service
│       ├── moderation-server.js
│       ├── package.json
│       ├── Dockerfile
│       ├── docker-compose.yml
│       └── .env.example
│
├── docker/                     # Docker configuration files
│   └── nginx.conf             # Nginx reverse proxy config
│
├── docker-compose.yml         # Full system orchestration
├── .env.example              # Environment variables template
├── .gitignore               # Git ignore rules
├── LICENSE                  # MIT License
└── README.md               # This file
```

### Services

1. **Frontend (Nginx)** - Serves static files and proxies API requests
2. **Backend API** - Handles authentication, CRUD operations, voting, and reporting
3. **Moderation Service** - Validates content using NLP and maintains blocked words
4. **PostgreSQL** - Two databases for comments and moderation data
5. **Redis** - Caching and rate limiting

### Data Flow

**Comment Submission:**
```
User → Frontend → Backend API → Moderation Service → PostgreSQL
                      ↓                                    ↓
                    Redis                           Moderation DB
```

**Comment Retrieval:**
```
User → Frontend → Backend API → Redis (cache) → PostgreSQL (if miss)
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Discord Application (for OAuth)
- Node.js 16+ (for local development)

### Full System Deployment

1. **Clone and configure:**
   ```bash
   git clone <repository-url>
   cd CommentSectionWebApp
   
   # Copy environment template
   cp .env.example .env
   
   # Edit .env with your credentials
   nano .env
   ```

2. **Start all services:**
   ```bash
   docker-compose up -d
   
   # Check service health
   docker-compose ps
   
   # View logs
   docker-compose logs -f
   ```

3. **Access the application:**
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:3000
   - Moderation API: http://localhost:3001

4. **Configure initial moderators (if needed):**
   
   Set Discord user IDs in your `.env` file before first deployment:
   ```env
   INITIAL_MODERATORS=123456789012345678,987654321098765432
   ```
   
   These users will automatically become moderators when they first log in.
   
   To find a Discord user ID:
   - Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)
   - Right-click on a user and select "Copy User ID"
   
   Alternatively, after a user logs in, you can manually promote them:
   ```bash
   # List all users
   docker exec -it comment-postgres psql -U postgres comments_db \
     -c "SELECT id, name, email, is_moderator FROM users;"
   
   # Make a user moderator
   docker exec -it comment-postgres psql -U postgres comments_db \
     -c "UPDATE users SET is_moderator = true WHERE id = 'DISCORD_USER_ID';"
   ```

### Debug Mode

For local development without Discord OAuth:

```javascript
// In frontend/index.html, set debugMode to true:
const CONFIG = {
    backendUrl: 'http://localhost:3000',
    moderationUrl: 'http://localhost:3001',
    debugMode: true  // ← Enables local testing
};
```

## Configuration

### Environment Variables

Create a `.env` file from `.env.example`:

```env
# Discord OAuth (Required)
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:8080/oauth-callback.html

# Moderation Admin Key (Required)
ADMIN_KEY=change_this_to_a_secure_random_string

# Initial Moderators (Optional)
# Comma-separated Discord user IDs who will become moderators on first login
INITIAL_MODERATORS=123456789012345678,987654321098765432

# Database Configuration
DB_USER=postgres
DB_PASSWORD=postgres123
DB_NAME=comments_db
MODERATION_DB_NAME=moderation_db

# Service URLs
MODERATION_API_URL=http://moderation-service:3001
ALLOWED_ORIGINS=http://localhost:8080

# Redis
REDIS_URL=redis://redis:6379
```

See `.env.example` for all available options.

### Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 → General
4. Add redirect URL: `http://localhost:8080/oauth-callback.html` (or your domain)
5. Copy Client ID and Client Secret to `.env`

**⚠️ Important:** Discord requires exact URL matching including protocol and path!

## API Reference

### Backend API Endpoints

#### Authentication
```http
POST /api/discord/callback
Content-Type: application/json

{
  "code": "discord_auth_code",
  "state": "csrf_state"
}
```

```http
POST /api/debug/auth
Content-Type: application/json

{
  "userName": "Test User"
}
```

#### Comments
```http
GET /api/comments/:pageId?userId=xxx
POST /api/comments
DELETE /api/comments/:commentId
```

#### Voting
```http
POST /api/comments/:commentId/vote
Content-Type: application/json

{
  "userId": "discord_123",
  "voteType": "like" | "dislike"
}
```

#### Reporting
```http
POST /api/comments/:commentId/report
Content-Type: application/json

{
  "userId": "discord_123",
  "reason": "Spam content"
}
```

#### Moderation
```http
GET /api/reports/:pageId
POST /api/reports/:reportId/resolve
DELETE /api/users/:userId/ban
GET /api/moderators
POST /api/moderators
DELETE /api/moderators/:userId
```

### Moderation Service Endpoints

#### Content Validation
```http
POST /api/moderate
Content-Type: application/json

{
  "content": "Comment text to check",
  "userId": "discord_123"
}
```

Response:
```json
{
  "approved": true,
  "reason": null,
  "confidence": 0.95,
  "flaggedWords": [],
  "suggestions": []
}
```

#### Admin Endpoints
```http
POST /api/admin/blocked-words
DELETE /api/admin/blocked-words/:word
GET /api/admin/stats?hours=24
```

## Database Schema

### Comments Database (PostgreSQL)

```sql
-- Users table
users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  picture TEXT,
  is_moderator BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Comments table
comments (
  id SERIAL PRIMARY KEY,
  page_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  parent_id INTEGER REFERENCES comments(id),
  content TEXT NOT NULL CHECK (char_length(content) <= 5000),
  likes INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Votes table
votes (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES comments(id),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  vote_type VARCHAR(10) CHECK (vote_type IN ('like', 'dislike')),
  created_at TIMESTAMP,
  UNIQUE(comment_id, user_id)
)

-- Reports table
reports (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES comments(id),
  reporter_id VARCHAR(255) NOT NULL REFERENCES users(id),
  page_id VARCHAR(255) NOT NULL,
  reason VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(255) REFERENCES users(id),
  UNIQUE(comment_id, reporter_id)
)

-- Report rate limits
report_rate_limits (
  user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id),
  report_count INTEGER DEFAULT 0,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Moderation Database (PostgreSQL)

```sql
-- Moderation logs
moderation_logs (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  reason VARCHAR(255),
  confidence FLOAT,
  flagged_words TEXT[],
  user_id VARCHAR(255),
  created_at TIMESTAMP
)

-- Blocked words
blocked_words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(255) UNIQUE NOT NULL,
  severity VARCHAR(50) DEFAULT 'medium',
  created_at TIMESTAMP
)

-- Trusted users
trusted_users (
  id VARCHAR(255) PRIMARY KEY,
  trust_score FLOAT DEFAULT 0.5,
  total_comments INTEGER DEFAULT 0,
  flagged_comments INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## Frontend Pages

### index.html - Main Comment Section
- Displays comments with threading
- Login/logout functionality
- Comment creation with markdown support
- Voting system
- Delete own comments
- Report functionality
- Moderator tools (if authorized)

### moderators.html - Moderator Management
- Add/remove moderators by Discord ID
- View current moderator list with avatars
- Requires moderator privileges
- First moderator must be set via INITIAL_MODERATORS env variable

### reports.html - Global Reports Dashboard
- View all pending reports across all pages
- Resolve reports (delete comment or dismiss)
- Ban users
- Requires moderator privileges

### iframe-test.html - Multiple Sections Demo
- Shows three example articles
- Each with its own comment section
- Demonstrates pageId isolation

### oauth-callback.html - OAuth Handler
- Processes Discord authentication
- Redirects back to referring page
- Handles authentication errors

## Deployment

### Individual Service Deployment

#### Backend API Only
```bash
cd backend/api
cp .env.example .env
# Configure .env
docker-compose up -d
```

#### Moderation Service Only
```bash
cd backend/moderation
cp .env.example .env
# Configure .env
docker-compose up -d
```

### Production Deployment

#### 1. Security Checklist
- [ ] Use HTTPS everywhere
- [ ] Set strong passwords in .env
- [ ] Change default ADMIN_KEY
- [ ] Configure CORS for your domain only
- [ ] Enable rate limiting
- [ ] Set up firewall rules
- [ ] Use secrets management for credentials
- [ ] Enable database backups
- [ ] Set up monitoring and alerts

#### 2. Environment Updates
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
DISCORD_REDIRECT_URI=https://yourdomain.com/oauth-callback.html
```

#### 3. Docker Production Configuration
Add to services in docker-compose.yml:
```yaml
services:
  backend-api:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
```

#### 4. Database Backups
```bash
# Backup script example
docker exec comment-postgres pg_dump -U postgres comments_db > backup.sql
```

#### 5. SSL/TLS Setup
Update nginx.conf for SSL:
```nginx
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    # ... rest of config
}
```

## Development

### Running Without Docker

**Backend API:**
```bash
cd backend/api
npm install
# Start PostgreSQL and Redis locally
npm run dev
```

**Moderation Service:**
```bash
cd backend/moderation
npm install
# Start PostgreSQL locally
npm run dev
```

**Frontend:**
```bash
cd frontend
python -m http.server 8080
# or
npx serve .
```

### Testing

**Test Moderation:**
```bash
curl -X POST http://localhost:3001/api/moderate \
  -H "Content-Type: application/json" \
  -d '{"content": "Test comment"}'
```

**Test Comment Creation:**
```bash
curl -X POST http://localhost:3000/api/comments \
  -H "Content-Type: application/json" \
  -d '{
    "pageId": "test-page",
    "userId": "test-user",
    "content": "Test comment",
    "userName": "Test User"
  }'
```

### Monitoring

```bash
# View all logs
docker-compose logs -f

# Specific service logs
docker-compose logs -f backend-api
docker-compose logs -f moderation-service

# Database access
docker exec -it comment-postgres psql -U postgres comments_db
docker exec -it moderation-postgres psql -U postgres moderation_db

# Health checks
curl http://localhost:3000/api/health
curl http://localhost:3001/api/health
```

## Production Checklist

### Performance
- [ ] Enable Redis persistence
- [ ] Configure PostgreSQL connection pooling
- [ ] Set up CDN for static assets
- [ ] Implement horizontal scaling
- [ ] Use database read replicas
- [ ] Enable gzip compression
- [ ] Optimize database indexes

### Security
- [ ] Enable HTTPS/TLS
- [ ] Set secure headers
- [ ] Implement rate limiting
- [ ] Enable CORS restrictions
- [ ] Use environment secrets
- [ ] Regular security updates
- [ ] Implement CSP headers
- [ ] Enable audit logging

### Monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Configure uptime monitoring
- [ ] Enable performance monitoring
- [ ] Set up log aggregation
- [ ] Configure alerting
- [ ] Database query monitoring
- [ ] Resource usage tracking

### Backup & Recovery
- [ ] Automated database backups
- [ ] Test restore procedures
- [ ] Document recovery process
- [ ] Off-site backup storage
- [ ] Point-in-time recovery
- [ ] Disaster recovery plan

## Troubleshooting

### Common Issues

**Discord OAuth "Invalid redirect_uri":**
1. Check browser console for exact redirect URI
2. Ensure it matches EXACTLY in Discord Developer Portal
3. Update DISCORD_REDIRECT_URI in .env
4. Common issues:
   - Trailing slashes matter
   - Protocol must match (http vs https)
   - Path must be exact

**Port Already in Use:**
```bash
# Find process using port
lsof -i :8080
# or
netstat -tulpn | grep 8080

# Kill process or change port in docker-compose.yml
```

**Database Connection Failed:**
- Check PostgreSQL is running
- Verify credentials in .env
- Check network connectivity
- Review PostgreSQL logs

**Comments Not Loading:**
- Check backend health: http://localhost:3000/api/health
- Verify Redis connection
- Check browser console for errors
- Review CORS configuration

**Moderation Blocking Everything:**
- Check moderation logs in database
- Review blocked words list
- Verify admin key is set
- Check moderation service logs

**Can't Access Moderator Pages:**
- Ensure INITIAL_MODERATORS is set in .env before first login
- Verify the Discord user ID is correct (18-digit number)
- Check if user is marked as moderator:
  ```bash
  docker exec -it comment-postgres psql -U postgres comments_db \
    -c "SELECT id, name, is_moderator FROM users WHERE is_moderator = true;"
  ```

### Debug Commands

```bash
# Reset database
docker-compose down -v
docker-compose up -d

# Clear Redis cache
docker exec -it comment-redis redis-cli FLUSHALL

# View blocked words
docker exec -it moderation-postgres psql -U postgres moderation_db -c "SELECT * FROM blocked_words;"

# Check user moderator status
docker exec -it comment-postgres psql -U postgres comments_db -c "SELECT id, name, is_moderator FROM users;"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

### Code Style
- Use ES6+ JavaScript features
- Add JSDoc comments for functions
- Follow existing patterns
- Test error scenarios
- Update documentation

### Commit Messages
- Use descriptive commit messages
- Reference issues when applicable
- Keep commits focused and atomic

## License

This project is provided as-is for educational and commercial use. See [LICENSE](LICENSE) file for details.

## Acknowledgments

- Discord for OAuth integration
- Alpine.js for reactive UI
- Tailwind CSS for styling
- markdown-it for Markdown parsing
- Natural for NLP processing