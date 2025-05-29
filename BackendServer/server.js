// server.js - Main API Server
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const redis = require('redis');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Discord OAuth Configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'YOUR_DISCORD_CLIENT_ID';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'YOUR_DISCORD_CLIENT_SECRET';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:8080';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connections
const pgPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'comments_db',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Redis for caching
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', err => console.log('Redis Client Error', err));
redisClient.connect();

// Database Schema (PostgreSQL)
const initDatabase = async () => {
    try {
        // Users table
        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                picture TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Comments table
        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                page_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                likes INTEGER DEFAULT 0,
                dislikes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Votes table
        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS votes (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                vote_type VARCHAR(10) CHECK (vote_type IN ('like', 'dislike')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(comment_id, user_id)
            )
        `);

        // Create indexes
        await pgPool.query(`
            CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);
            CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
            CREATE INDEX IF NOT EXISTS idx_votes_comment_id ON votes(comment_id);
            CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
        `);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
};

// Initialize database on startup
initDatabase();

// Routes

// Discord OAuth callback
app.post('/api/discord/callback', async (req, res) => {
    const { code, state } = req.body;
    
    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        const { access_token } = tokenResponse.data;
        
        // Get user info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });
        
        const discordUser = userResponse.data;
        
        // Create user object
        const user = {
            id: `discord_${discordUser.id}`,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: discordUser.avatar ? 
                `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : 
                `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`,
            email: discordUser.email || `${discordUser.id}@discord.user`
        };
        
        // Save to database
        await pgPool.query(
            `INSERT INTO users (id, email, name, picture) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (id) DO UPDATE 
             SET name = $3, picture = $4, updated_at = CURRENT_TIMESTAMP`,
            [user.id, user.email, user.username, user.avatar]
        );
        
        res.json({ user });
    } catch (error) {
        console.error('Discord OAuth error:', error);
        res.status(500).json({ error: 'Discord authentication failed' });
    }
});

// User registration (keeping for compatibility)
app.post('/api/users/register', async (req, res) => {
    const { id, email, name, picture } = req.body;
    
    try {
        await pgPool.query(
            `INSERT INTO users (id, email, name, picture) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (id) DO UPDATE 
             SET name = $3, picture = $4, updated_at = CURRENT_TIMESTAMP`,
            [id, email, name, picture]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('User registration error:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// Get comments for a page
app.get('/api/comments/:pageId', async (req, res) => {
    const { pageId } = req.params;
    const userId = req.query.userId;
    
    try {
        // Check cache first
        const cacheKey = `comments:${pageId}`;
        const cached = await redisClient.get(cacheKey);
        
        if (cached && !userId) {
            return res.json(JSON.parse(cached));
        }
        
        // Query database
        const query = `
            SELECT 
                c.id, c.page_id, c.user_id, c.parent_id, c.content, 
                c.likes, c.dislikes, c.created_at, c.updated_at,
                u.name as user_name, u.picture as user_picture,
                v.vote_type as user_vote
            FROM comments c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN votes v ON c.id = v.comment_id AND v.user_id = $2
            WHERE c.page_id = $1
            ORDER BY c.created_at ASC
        `;
        
        const result = await pgPool.query(query, [pageId, userId || null]);
        
        const comments = result.rows.map(row => ({
            id: row.id,
            pageId: row.page_id,
            userId: row.user_id,
            parentId: row.parent_id,
            content: row.content,
            likes: row.likes,
            dislikes: row.dislikes,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userName: row.user_name,
            userPicture: row.user_picture,
            userVote: row.user_vote
        }));
        
        // Cache the result (without user-specific data)
        if (!userId) {
            await redisClient.setEx(cacheKey, 300, JSON.stringify(comments)); // 5 min cache
        }
        
        res.json(comments);
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Failed to get comments' });
    }
});

// Create a new comment
app.post('/api/comments', async (req, res) => {
    const { pageId, userId, content, parentId, userName, userPicture } = req.body;
    
    try {
        const result = await pgPool.query(
            `INSERT INTO comments (page_id, user_id, parent_id, content) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [pageId, userId, parentId || null, content]
        );
        
        const comment = result.rows[0];
        
        // Clear cache
        await redisClient.del(`comments:${pageId}`);
        
        // Return the comment with user info
        res.json({
            id: comment.id,
            pageId: comment.page_id,
            userId: comment.user_id,
            parentId: comment.parent_id,
            content: comment.content,
            likes: comment.likes,
            dislikes: comment.dislikes,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            userName: userName,
            userPicture: userPicture
        });
    } catch (error) {
        console.error('Create comment error:', error);
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

// Vote on a comment
app.post('/api/comments/:commentId/vote', async (req, res) => {
    const { commentId } = req.params;
    const { userId, voteType } = req.body;
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Check existing vote
        const existingVote = await client.query(
            'SELECT vote_type FROM votes WHERE comment_id = $1 AND user_id = $2',
            [commentId, userId]
        );
        
        if (existingVote.rows.length > 0) {
            const currentVote = existingVote.rows[0].vote_type;
            
            if (currentVote === voteType) {
                // Remove vote
                await client.query(
                    'DELETE FROM votes WHERE comment_id = $1 AND user_id = $2',
                    [commentId, userId]
                );
                
                // Update comment counts
                if (voteType === 'like') {
                    await client.query(
                        'UPDATE comments SET likes = likes - 1 WHERE id = $1',
                        [commentId]
                    );
                } else {
                    await client.query(
                        'UPDATE comments SET dislikes = dislikes - 1 WHERE id = $1',
                        [commentId]
                    );
                }
            } else {
                // Change vote
                await client.query(
                    'UPDATE votes SET vote_type = $1 WHERE comment_id = $2 AND user_id = $3',
                    [voteType, commentId, userId]
                );
                
                // Update comment counts
                if (voteType === 'like') {
                    await client.query(
                        'UPDATE comments SET likes = likes + 1, dislikes = dislikes - 1 WHERE id = $1',
                        [commentId]
                    );
                } else {
                    await client.query(
                        'UPDATE comments SET likes = likes - 1, dislikes = dislikes + 1 WHERE id = $1',
                        [commentId]
                    );
                }
            }
        } else {
            // New vote
            await client.query(
                'INSERT INTO votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)',
                [commentId, userId, voteType]
            );
            
            // Update comment counts
            if (voteType === 'like') {
                await client.query(
                    'UPDATE comments SET likes = likes + 1 WHERE id = $1',
                    [commentId]
                );
            } else {
                await client.query(
                    'UPDATE comments SET dislikes = dislikes + 1 WHERE id = $1',
                    [commentId]
                );
            }
        }
        
        await client.query('COMMIT');
        
        // Get updated comment data
        const result = await client.query(
            'SELECT likes, dislikes FROM comments WHERE id = $1',
            [commentId]
        );
        
        const comment = result.rows[0];
        
        // Clear cache
        const pageResult = await client.query(
            'SELECT page_id FROM comments WHERE id = $1',
            [commentId]
        );
        await redisClient.del(`comments:${pageResult.rows[0].page_id}`);
        
        res.json({
            likes: comment.likes,
            dislikes: comment.dislikes,
            userVote: existingVote.rows.length > 0 && existingVote.rows[0].vote_type === voteType ? null : voteType
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Failed to vote' });
    } finally {
        client.release();
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.listen(port, () => {
    console.log(`Comment API server running on port ${port}`);
});

// package.json
/*
{
  "name": "comment-system-api",
  "version": "1.0.0",
  "description": "Backend API for comment system",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "pg": "^8.11.3",
    "redis": "^4.6.10",
    "axios": "^1.6.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
*/

// docker-compose.yml for databases
/*
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: comments_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
*/