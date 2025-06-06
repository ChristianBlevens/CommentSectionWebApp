# Comment System Architecture

## Overview

This document describes the refactored architecture of the Comment Section Web Application. The system has been reorganized for better maintainability, scalability, and code clarity.

## Key Improvements

### 1. Database Schema

#### Comments Database
- **Improved Indexing**: Composite index on `page_id` and `created_at` for efficient page-based queries
- **Soft Deletes**: Comments are soft-deleted to preserve data for reports
- **Report Persistence**: Reports now store comment snapshots, ensuring data is preserved even if comments are deleted

#### Moderation Database
- **Enhanced Schema**: Added support for regex patterns, categories, and page-specific settings
- **Trust System**: More detailed user metrics for better trust score calculation
- **Moderation Rules**: Configurable rules for different types of content moderation

### 2. Backend API Structure

```
backend/api/
├── src/
│   ├── config/          # Centralized configuration
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # Data models (future)
│   ├── routes/          # Route definitions
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── db/              # Database connections and initialization
│   ├── app.js           # Express app setup
│   └── server.js        # Server entry point
├── package.json
├── Dockerfile
└── .dockerignore
```

#### Key Services
- **AuthService**: Discord OAuth and session management
- **CommentService**: Comment CRUD operations with caching
- **VoteService**: Vote management with transaction support
- **ReportService**: Report handling with rate limiting
- **ModerationClient**: Communication with moderation service

### 3. Moderation Service Structure

```
backend/moderation/
├── src/
│   ├── config/          # Service configuration
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Auth middleware
│   ├── services/        # Core moderation logic
│   ├── routes/          # API routes
│   ├── db/              # Database setup
│   ├── app.js           # Express app
│   └── server.js        # Entry point
└── ...
```

#### Key Services
- **ModerationService**: Core content moderation with ML
- **NLPService**: Natural language processing utilities
- **UserTrustService**: User reputation management

### 4. API Endpoints

#### Backend API
- **Auth**: `/api/auth/*` - Discord OAuth, sessions
- **Comments**: `/api/comments/*` - CRUD operations
- **Reports**: `/api/reports/*` - Report management
- **Users**: `/api/users/*` - User management
- **Health**: `/health/*` - Service health and config

#### Moderation Service
- **Public**: `/api/*` - Content moderation
- **Admin**: `/api/admin/*` - Blocked words, user trust
- **Health**: `/api/health/*` - Service status

### 5. Security Enhancements

- **Rate Limiting**: Different limits for different endpoints
- **Input Validation**: Centralized validation middleware
- **Content Sanitization**: XSS prevention
- **Session Security**: Redis-based sessions with TTL
- **Admin Protection**: Separate admin key for moderation service

### 6. Performance Optimizations

- **Database Indexes**: Optimized for common query patterns
- **Redis Caching**: 30-second cache for comment lists
- **Connection Pooling**: Efficient database connections
- **Soft Operations**: Graceful degradation when services are down

### 7. Migration System

- **SQL Migrations**: Version-controlled schema changes
- **Migration Runner**: Automated migration execution
- **Rollback Support**: Transaction-based migrations

## Deployment Changes

### Environment Variables
The refactored system uses the same environment variables but with better organization and validation.

### Docker Integration
- Updated Dockerfiles to use new directory structure
- Added .dockerignore for smaller images
- Maintained backward compatibility with legacy entry points

### Database Migrations
Run migrations before starting services:
```bash
cd migrations && node migrate.js
```

Or set `RUN_MIGRATIONS=true` in docker-compose.yml

## Backward Compatibility

- Legacy endpoints maintained for smooth transition
- `start:legacy` npm scripts for testing old code
- All existing functionality preserved

## Future Enhancements

1. **GraphQL API**: Consider adding GraphQL for flexible queries
2. **WebSocket Support**: Real-time comment updates
3. **Elasticsearch**: Full-text search capabilities
4. **Horizontal Scaling**: Redis pub/sub for multi-instance support
5. **Monitoring**: Prometheus metrics and health dashboards