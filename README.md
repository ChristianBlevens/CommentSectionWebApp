# Discord Comment System

A modern, secure comment system with Discord OAuth authentication, real-time moderation, and Docker deployment. Built with Node.js, PostgreSQL, Redis, and vanilla JavaScript frontend.

## 🏗️ Architecture

The system consists of three independent components:

1. **Frontend (index.html)** - Single-page application using Alpine.js and Tailwind CSS
2. **Backend API Server** - Node.js/Express handling authentication, comments, and votes
3. **Moderation Service** - NLP-powered content moderation with admin controls

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Discord Application (for OAuth)
- Web browser

### 1. Backend API Server

```bash
cd BackendServer
cp .env.example .env
# Edit .env with your Discord credentials
docker-compose up
```

The backend runs on `http://localhost:3000` and includes:
- PostgreSQL database for comments
- Redis cache for performance
- Discord OAuth authentication

### 2. Moderation Service

```bash
cd ModerationServer
cp .env.example .env
# Edit .env with your admin key
docker-compose up
```

The moderation service runs on `http://localhost:3001` and includes:
- PostgreSQL database for moderation logs
- NLP-based content analysis
- Admin endpoints for configuration

### 3. Frontend

The frontend consists of two files:
- `index.html` - Main application
- `oauth-callback.html` - OAuth callback handler

Serve both files with any web server:
```bash
python -m http.server 8080
# or
npx serve .
```

## 📋 Configuration

### Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 → General
4. Add redirect URL: `https://yourdomain.com/oauth-callback.html`
   
   **⚠️ IMPORTANT: Discord OAuth does NOT work with localhost:**
   - Discord does not allow internal URLs as a redirect URL
   - For production, use your full domain (e.g., `https://yourdomain.com/oauth-callback.html`)
   - The redirect URL must match EXACTLY what your application uses
   - The callback URL must point to the `oauth-callback.html` file, not the main index

5. Copy Client ID and Client Secret to BackendServer/.env

### Environment Variables

**BackendServer/.env**
```env
# Required
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Optional
DISCORD_REDIRECT_URI=http://localhost:8080
DB_PASSWORD=postgres_password
PORT=3000
```

**ModerationServer/.env**
```env
# Required
ADMIN_KEY=your_secure_admin_key

# Optional
DB_PASSWORD=postgres_password
PORT=3001
```

## 🔧 Features

### Comment System
- **Nested comments** with unlimited reply depth
- **Rich text support** with Markdown formatting
- **Media embedding** for images and videos (YouTube, Vimeo, Imgur)
- **Spoiler text** with click-to-reveal
- **Vote system** with like/dislike functionality
- **Real-time updates** with Redis caching
- **Comment sorting** by popularity, newest, or oldest

### Moderation Features
- **Automated content filtering** with NLP analysis
- **Blocked word detection** with severity levels
- **Spam pattern recognition**
- **Sentiment analysis** for toxic content
- **User trust scoring** based on history
- **HTML/CSS/JS injection prevention**
- **Link blocking** (except in media embeds)
- **Admin controls** for managing blocked words

### Security Features
- **Discord OAuth** for secure authentication
- **CSRF protection** with state parameter
- **SQL injection prevention** with parameterized queries
- **XSS protection** through content sanitization
- **Rate limiting** ready (add express-rate-limit)
- **CORS configuration** for production
- **Input validation** on all endpoints

## 📡 API Reference

### Backend API Endpoints

#### Authentication
- `POST /api/discord/callback` - Discord OAuth callback
  ```json
  {
    "code": "auth_code",
    "state": "csrf_state"
  }
  ```

#### Comments
- `GET /api/comments/:pageId` - Get comments for a page
  - Query: `?userId=xxx` (optional, includes user votes)
  
- `POST /api/comments` - Create new comment
  ```json
  {
    "pageId": "page-123",
    "userId": "discord_123",
    "content": "Comment text",
    "parentId": null,
    "userName": "User",
    "userPicture": "avatar_url"
  }
  ```

- `POST /api/comments/:commentId/vote` - Vote on comment
  ```json
  {
    "userId": "discord_123",
    "voteType": "like" // or "dislike"
  }
  ```

- `GET /api/health` - Health check

### Moderation API Endpoints

#### Public
- `POST /api/moderate` - Check content
  ```json
  {
    "content": "Text to moderate",
    "userId": "discord_123" // optional
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

#### Admin (requires ADMIN_KEY)
- `POST /api/admin/blocked-words` - Add/update blocked word
  ```json
  {
    "word": "example",
    "severity": "medium", // low, medium, high
    "adminKey": "your_admin_key"
  }
  ```

- `DELETE /api/admin/blocked-words/:word?adminKey=xxx` - Remove blocked word

- `GET /api/admin/stats?adminKey=xxx&hours=24` - Get moderation statistics

- `GET /api/health` - Health check

## 🗄️ Database Schema

### Backend Database (PostgreSQL)
```sql
-- Users table
users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  picture TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Comments table
comments (
  id SERIAL PRIMARY KEY,
  page_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  parent_id INTEGER REFERENCES comments(id),
  content TEXT NOT NULL CHECK (length <= 5000),
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

## 🔨 Development

### Running Without Docker

**Backend Server:**
```bash
cd BackendServer
npm install
# Start PostgreSQL and Redis locally
npm run dev
```

**Moderation Server:**
```bash
cd ModerationServer
npm install
# Start PostgreSQL locally
npm run dev
```

### Testing Moderation

Test content moderation:
```bash
curl -X POST http://localhost:3001/api/moderate \
  -H "Content-Type: application/json" \
  -d '{"content": "This is a test comment"}'
```

Add blocked word (admin):
```bash
curl -X POST http://localhost:3001/api/admin/blocked-words \
  -H "Content-Type: application/json" \
  -d '{
    "word": "badword",
    "severity": "high",
    "adminKey": "your_admin_key"
  }'
```

## 🌐 Production Deployment

### Security Checklist
- [ ] Use HTTPS everywhere
- [ ] Set strong passwords in .env files
- [ ] Configure CORS for your domain only
- [ ] Add rate limiting to prevent spam
- [ ] Set up proper firewall rules
- [ ] Use secrets management for credentials
- [ ] Enable database backups
- [ ] Set up monitoring and alerts

### Performance Optimization
- Enable Redis persistence in production
- Configure PostgreSQL connection pooling
- Add CDN for static assets
- Implement horizontal scaling with load balancer
- Use database read replicas for scaling

### Docker Production Tips
```yaml
# Add to docker-compose.yml for production:
services:
  backend-api:
    restart: always
    environment:
      - NODE_ENV=production
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

## 🔍 Troubleshooting

### Common Issues

**Discord OAuth not working:**
- Verify Client ID and Secret are correct
- Check redirect URI matches exactly
- Ensure application is not in test mode

**Comments not loading:**
- Check backend server is running: `http://localhost:3000/api/health`
- Verify database connection in logs
- Check browser console for CORS errors

**Moderation blocking all comments:**
- Check admin key is set correctly
- Review blocked words list
- Check moderation logs in database

### Viewing Logs
```bash
# Backend logs
cd BackendServer && docker-compose logs -f

# Moderation logs
cd ModerationServer && docker-compose logs -f

# Database queries
docker exec -it comment-postgres psql -U postgres comments_db
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

### Code Style
- Use ES6+ JavaScript features
- Add comments for complex logic
- Follow existing patterns
- Test error scenarios

## 📄 License

This project is provided as-is for educational and commercial use.

## 🙏 Acknowledgments

- Discord for OAuth integration
- Alpine.js for reactive UI
- Tailwind CSS for styling
- markdown-it for Markdown parsing
- Natural for NLP processing