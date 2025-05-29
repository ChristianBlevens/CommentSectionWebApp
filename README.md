# Comment System - Complete Deployment Guide

## System Architecture

The comment system consists of three main components:

1. **Frontend Web App** - HTML/JavaScript with Alpine.js, Tailwind CSS
2. **Backend API Server** - Node.js/Express with PostgreSQL and Redis
3. **Moderation Service** - Node.js/Express with PostgreSQL and NLP

## Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Redis 7+
- Google OAuth Client ID
- Docker & Docker Compose (optional)

## Setup Instructions

### 1. Google OAuth Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Sign-In API
4. Create OAuth 2.0 credentials
5. Add authorized origins:
   - `http://localhost:8080` (development)
   - Your production domain
6. Copy the Client ID

### 2. Database Setup

#### Option A: Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  # Main database for comments
  postgres-main:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
      POSTGRES_DB: comments_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_main_data:/var/lib/postgresql/data
    networks:
      - comment-network

  # Moderation database
  postgres-moderation:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
      POSTGRES_DB: moderation_db
    ports:
      - "5433:5432"
    volumes:
      - postgres_moderation_data:/var/lib/postgresql/data
    networks:
      - comment-network

  # Redis cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - comment-network

volumes:
  postgres_main_data:
  postgres_moderation_data:
  redis_data:

networks:
  comment-network:
    driver: bridge
```

Run: `docker-compose up -d`

#### Option B: Manual Setup

1. Install PostgreSQL and create two databases:
   ```sql
   CREATE DATABASE comments_db;
   CREATE DATABASE moderation_db;
   ```

2. Install and start Redis

### 3. Backend API Setup

1. Create directory and install dependencies:
   ```bash
   mkdir comment-api
   cd comment-api
   npm init -y
   npm install express cors body-parser pg redis
   npm install -D nodemon
   ```

2. Create `.env` file:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_secure_password
   DB_NAME=comments_db
   REDIS_URL=redis://localhost:6379
   ```

3. Copy the backend API code from the artifact above into `server.js`

4. Update `package.json` scripts:
   ```json
   {
     "scripts": {
       "start": "node server.js",
       "dev": "nodemon server.js"
     }
   }
   ```

5. Start the server:
   ```bash
   npm run dev
   ```

### 4. Moderation Service Setup

1. Create directory and install dependencies:
   ```bash
   mkdir comment-moderation
   cd comment-moderation
   npm init -y
   npm install express cors body-parser pg natural
   npm install -D nodemon
   ```

2. Create `.env` file:
   ```env
   PORT=3001
   DB_HOST=localhost
   DB_PORT=5433
   DB_USER=postgres
   DB_PASSWORD=your_secure_password
   DB_NAME=moderation_db
   ADMIN_KEY=your_admin_secret_key
   ```

3. Copy the moderation service code from the artifact above into `moderation-server.js`

4. Start the service:
   ```bash
   npm run dev
   ```

### 5. Frontend Setup

1. Update the frontend HTML file:
   - Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Google Client ID
   - Update API URLs if not using localhost:
     ```javascript
     apiUrl: 'http://localhost:3000/api',
     moderationUrl: 'http://localhost:3001/api',
     ```

2. Serve the HTML file:
   - For development: `python -m http.server 8080`
   - For production: Use nginx, Apache, or CDN

### 6. Environment Variables for iframe Usage

To use the comment system in an iframe with different page IDs:

```html
<!-- Host page -->
<iframe src="comments.html?pageId=article-123" width="100%" height="600"></iframe>
```

Or set via JavaScript:
```javascript
window.PAGE_ID = 'article-123';
```

## Production Deployment

### Security Considerations

1. **HTTPS**: Always use HTTPS in production
2. **CORS**: Configure CORS to only allow your domains
3. **Rate Limiting**: Add rate limiting to prevent spam:
   ```bash
   npm install express-rate-limit
   ```
   ```javascript
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });
   app.use('/api', limiter);
   ```

4. **Input Validation**: Add additional validation:
   ```bash
   npm install validator xss
   ```

5. **Authentication**: Verify Google tokens server-side:
   ```bash
   npm install google-auth-library
   ```

### Database Optimization

1. **Indexes**: The system automatically creates indexes on:
   - `comments.page_id`
   - `comments.parent_id`
   - `votes.comment_id`
   - `votes.user_id`

2. **Partitioning**: For high-traffic sites, partition the comments table by page_id:
   ```sql
   CREATE TABLE comments_partitioned (
     LIKE comments INCLUDING ALL
   ) PARTITION BY HASH (page_id);
   
   CREATE TABLE comments_part_0 PARTITION OF comments_partitioned
   FOR VALUES WITH (modulus 4, remainder 0);
   -- Create parts 1, 2, 3 similarly
   ```

3. **Connection Pooling**: Configure pool size in production:
   ```javascript
   const pgPool = new Pool({
     max: 20, // Maximum number of clients in the pool
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

### Monitoring & Logging

1. **Application Monitoring**:
   ```bash
   npm install winston
   ```
   ```javascript
   const winston = require('winston');
   const logger = winston.createLogger({
     level: 'info',
     format: winston.format.json(),
     transports: [
       new winston.transports.File({ filename: 'error.log', level: 'error' }),
       new winston.transports.File({ filename: 'combined.log' })
     ]
   });
   ```

2. **Health Checks**: Both services expose `/api/health` endpoints

3. **Metrics**: Add Prometheus metrics:
   ```bash
   npm install prom-client
   ```

### Scaling Strategies

1. **Horizontal Scaling**:
   - Run multiple API server instances behind a load balancer
   - Use Redis for session management
   - Consider using a message queue for moderation

2. **Caching Strategy**:
   - Comments are cached for 5 minutes in Redis
   - Implement CDN caching for static assets
   - Consider edge caching for read-heavy pages

3. **Database Scaling**:
   - Read replicas for comment queries
   - Write master for new comments/votes
   - Consider sharding by page_id for massive scale

## API Documentation

### Backend API Endpoints

#### POST /api/users/register
Register or update a user.

Request:
```json
{
  "id": "google_user_id",
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://..."
}
```

#### GET /api/comments/:pageId
Get all comments for a page.

Query Parameters:
- `userId` (optional): Include user's votes

Response:
```json
[
  {
    "id": 1,
    "pageId": "page-123",
    "userId": "user_id",
    "parentId": null,
    "content": "Comment content",
    "likes": 5,
    "dislikes": 1,
    "createdAt": "2023-01-01T00:00:00Z",
    "userName": "User Name",
    "userPicture": "https://...",
    "userVote": "like"
  }
]
```

#### POST /api/comments
Create a new comment.

Request:
```json
{
  "pageId": "page-123",
  "userId": "user_id",
  "content": "Comment content",
  "parentId": null,
  "userName": "User Name",
  "userPicture": "https://..."
}
```

#### POST /api/comments/:commentId/vote
Vote on a comment.

Request:
```json
{
  "userId": "user_id",
  "voteType": "like" // or "dislike"
}
```

### Moderation API Endpoints

#### POST /api/moderate
Check if content is appropriate.

Request:
```json
{
  "content": "Comment text to moderate",
  "userId": "user_id" // optional
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

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the frontend URL is in the CORS allowed origins
2. **Database Connection**: Check PostgreSQL is running and credentials are correct
3. **Redis Connection**: Ensure Redis is running on the correct port
4. **Google Sign-In**: Verify the client ID and authorized domains

### Debug Mode

Enable debug logging:
```javascript
// Add to both servers
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});
```

## Maintenance

### Database Backups

```bash
# Backup
pg_dump -U postgres -h localhost comments_db > comments_backup.sql
pg_dump -U postgres -h localhost -p 5433 moderation_db > moderation_backup.sql

# Restore
psql -U postgres -h localhost comments_db < comments_backup.sql
psql -U postgres -h localhost -p 5433 moderation_db < moderation_backup.sql
```

### Updating Blocked Words

```bash
curl -X POST http://localhost:3001/api/admin/blocked-words \
  -H "Content-Type: application/json" \
  -d '{
    "word": "newbadword",
    "severity": "high",
    "adminKey": "your_admin_secret_key"
  }'
```

### Monitoring Moderation Stats

```bash
curl "http://localhost:3001/api/admin/stats?adminKey=your_admin_secret_key"
```

## License

This comment system is provided as-is for educational and commercial use.

