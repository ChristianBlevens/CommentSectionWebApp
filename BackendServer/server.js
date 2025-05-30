const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const redis = require('redis');
const axios = require('axios');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Discord OAuth configuration with validation
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:8080';

// Validate required Discord credentials
if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || 
    DISCORD_CLIENT_ID === 'YOUR_DISCORD_CLIENT_ID') {
    console.error('ERROR: Discord OAuth credentials not configured!');
    console.error('Please set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env file');
    process.exit(1);
}

// Configure CORS with specific origins in production
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
        : '*',
    credentials: true
};

// Apply middleware
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' })); // Limit request size
app.use(bodyParser.urlencoded({ extended: true }));

// PostgreSQL connection pool with error handling
const pgPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'comments_db',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 20, // Maximum number of clients in pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection fails
});

// Test database connection
pgPool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Database connected successfully');
});

// Redis client with reconnect strategy
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis reconnection limit reached');
                return new Error('Redis reconnection failed');
            }
            return Math.min(retries * 100, 3000); // Exponential backoff
        }
    }
});

// Handle Redis events
redisClient.on('error', err => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis connected successfully'));
redisClient.on('reconnecting', () => console.log('Redis reconnecting...'));

// Connect to Redis
redisClient.connect().catch(err => {
    console.error('Redis connection failed:', err);
    // Continue without cache if Redis fails
});

// Initialize database schema
const initDatabase = async () => {
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                picture TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create comments table with constraints
        await client.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                page_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
                content TEXT NOT NULL CHECK (char_length(content) <= 5000),
                likes INTEGER DEFAULT 0 CHECK (likes >= 0),
                dislikes INTEGER DEFAULT 0 CHECK (dislikes >= 0),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Create votes table with unique constraint
        await client.query(`
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
        
        // Create performance indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);
            CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
            CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
            CREATE INDEX IF NOT EXISTS idx_votes_comment_id ON votes(comment_id);
            CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
        `);
        
        await client.query('COMMIT');
        console.log('Database schema initialized successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database initialization error:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Initialize database on startup
initDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

// Helper function for cache operations
const getCacheKey = (type, id) => `${type}:${id}`;

// Helper function for safe Redis operations
const safeRedisOp = async (operation, fallback = null) => {
    try {
        if (!redisClient.isReady) return fallback;
        return await operation();
    } catch (error) {
        console.error('Redis operation failed:', error);
        return fallback;
    }
};

// Validation middleware
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ 
                error: 'Validation error', 
                details: error.details[0].message 
            });
        }
        next();
    };
};

// Discord OAuth callback endpoint
app.post('/api/discord/callback', async (req, res) => {
    const { code, state } = req.body;
    
    // Validate input
    if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    try {
        // Exchange authorization code for access token
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
                },
                timeout: 10000 // 10 second timeout
            }
        );
        
        const { access_token } = tokenResponse.data;
        
        // Fetch user information from Discord
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            timeout: 10000
        });
        
        const discordUser = userResponse.data;
        
        // Build user object with fallback avatar
        const user = {
            id: `discord_${discordUser.id}`,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: discordUser.avatar ? 
                `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : 
                `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`,
            email: discordUser.email || `${discordUser.id}@discord.user`
        };
        
        // Upsert user in database
        await pgPool.query(
            `INSERT INTO users (id, email, name, picture) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (id) DO UPDATE 
             SET name = EXCLUDED.name, 
                 picture = EXCLUDED.picture, 
                 updated_at = CURRENT_TIMESTAMP`,
            [user.id, user.email, user.username, user.avatar]
        );
        
        res.json({ user });
    } catch (error) {
        console.error('Discord OAuth error:', error.response?.data || error.message);
        
        // Return appropriate error message
        if (error.response?.status === 401) {
            res.status(401).json({ error: 'Invalid authorization code' });
        } else {
            res.status(500).json({ error: 'Discord authentication failed' });
        }
    }
});

// Legacy user registration endpoint
app.post('/api/users/register', async (req, res) => {
    const { id, email, name, picture } = req.body;
    
    // Validate required fields
    if (!id || !email || !name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        await pgPool.query(
            `INSERT INTO users (id, email, name, picture) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (id) DO UPDATE 
             SET name = EXCLUDED.name, 
                 picture = EXCLUDED.picture, 
                 updated_at = CURRENT_TIMESTAMP`,
            [id, email, name, picture]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('User registration error:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// Get comments for a specific page
app.get('/api/comments/:pageId', async (req, res) => {
    const { pageId } = req.params;
    const { userId } = req.query;
    
    // Validate page ID
    if (!pageId || pageId.length > 255) {
        return res.status(400).json({ error: 'Invalid page ID' });
    }
    
    try {
        const cacheKey = getCacheKey('comments', pageId);
        
        // Try to get from cache if no user-specific data needed
        if (!userId) {
            const cached = await safeRedisOp(() => redisClient.get(cacheKey));
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        }
        
        // Query database with user votes if userId provided
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
        
        // Transform database rows to API response format
        const comments = result.rows.map(row => ({
            id: row.id,
            pageId: row.page_id,
            userId: row.user_id,
            parentId: row.parent_id,
            content: row.content,
            likes: parseInt(row.likes),
            dislikes: parseInt(row.dislikes),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userName: row.user_name,
            userPicture: row.user_picture,
            userVote: row.user_vote
        }));
        
        // Cache results without user-specific data
        if (!userId && comments.length > 0) {
            await safeRedisOp(() => 
                redisClient.setEx(cacheKey, 300, JSON.stringify(comments))
            );
        }
        
        res.json(comments);
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Failed to retrieve comments' });
    }
});

// Create a new comment
app.post('/api/comments', async (req, res) => {
    const { pageId, userId, content, parentId, userName, userPicture } = req.body;
    
    // Validate required fields
    if (!pageId || !userId || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate content length
    if (content.length > 5000) {
        return res.status(400).json({ error: 'Comment too long (max 5000 characters)' });
    }
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Verify user exists
        const userCheck = await client.query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );
        
        if (userCheck.rows.length === 0) {
            throw new Error('User not found');
        }
        
        // Verify parent comment exists if parentId provided
        if (parentId) {
            const parentCheck = await client.query(
                'SELECT id FROM comments WHERE id = $1',
                [parentId]
            );
            
            if (parentCheck.rows.length === 0) {
                throw new Error('Parent comment not found');
            }
        }
        
        // Insert new comment
        const result = await client.query(
            `INSERT INTO comments (page_id, user_id, parent_id, content) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [pageId, userId, parentId || null, content]
        );
        
        const comment = result.rows[0];
        
        await client.query('COMMIT');
        
        // Clear cache for this page
        await safeRedisOp(() => 
            redisClient.del(getCacheKey('comments', pageId))
        );
        
        // Return formatted comment
        res.json({
            id: comment.id,
            pageId: comment.page_id,
            userId: comment.user_id,
            parentId: comment.parent_id,
            content: comment.content,
            likes: 0,
            dislikes: 0,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            userName: userName,
            userPicture: userPicture
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create comment error:', error);
        
        // Return appropriate error message
        if (error.message === 'User not found') {
            res.status(404).json({ error: 'User not found' });
        } else if (error.message === 'Parent comment not found') {
            res.status(404).json({ error: 'Parent comment not found' });
        } else {
            res.status(500).json({ error: 'Failed to create comment' });
        }
    } finally {
        client.release();
    }
});

// Vote on a comment
app.post('/api/comments/:commentId/vote', async (req, res) => {
    const { commentId } = req.params;
    const { userId, voteType } = req.body;
    
    // Validate input
    if (!userId || !voteType) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!['like', 'dislike'].includes(voteType)) {
        return res.status(400).json({ error: 'Invalid vote type' });
    }
    
    // Validate comment ID
    const commentIdNum = parseInt(commentId);
    if (isNaN(commentIdNum)) {
        return res.status(400).json({ error: 'Invalid comment ID' });
    }
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Lock the comment row to prevent race conditions
        const commentCheck = await client.query(
            'SELECT id, page_id FROM comments WHERE id = $1 FOR UPDATE',
            [commentIdNum]
        );
        
        if (commentCheck.rows.length === 0) {
            throw new Error('Comment not found');
        }
        
        const pageId = commentCheck.rows[0].page_id;
        
        // Check existing vote
        const existingVote = await client.query(
            'SELECT vote_type FROM votes WHERE comment_id = $1 AND user_id = $2',
            [commentIdNum, userId]
        );
        
        let finalVoteType = voteType;
        
        if (existingVote.rows.length > 0) {
            const currentVote = existingVote.rows[0].vote_type;
            
            if (currentVote === voteType) {
                // Remove vote if clicking same button
                await client.query(
                    'DELETE FROM votes WHERE comment_id = $1 AND user_id = $2',
                    [commentIdNum, userId]
                );
                
                // Decrement appropriate counter
                const column = voteType === 'like' ? 'likes' : 'dislikes';
                await client.query(
                    `UPDATE comments SET ${column} = ${column} - 1 WHERE id = $1`,
                    [commentIdNum]
                );
                
                finalVoteType = null;
            } else {
                // Change vote type
                await client.query(
                    'UPDATE votes SET vote_type = $1 WHERE comment_id = $2 AND user_id = $3',
                    [voteType, commentIdNum, userId]
                );
                
                // Update both counters
                if (voteType === 'like') {
                    await client.query(
                        'UPDATE comments SET likes = likes + 1, dislikes = dislikes - 1 WHERE id = $1',
                        [commentIdNum]
                    );
                } else {
                    await client.query(
                        'UPDATE comments SET likes = likes - 1, dislikes = dislikes + 1 WHERE id = $1',
                        [commentIdNum]
                    );
                }
            }
        } else {
            // New vote
            await client.query(
                'INSERT INTO votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)',
                [commentIdNum, userId, voteType]
            );
            
            // Increment appropriate counter
            const column = voteType === 'like' ? 'likes' : 'dislikes';
            await client.query(
                `UPDATE comments SET ${column} = ${column} + 1 WHERE id = $1`,
                [commentIdNum]
            );
        }
        
        // Get updated vote counts
        const result = await client.query(
            'SELECT likes, dislikes FROM comments WHERE id = $1',
            [commentIdNum]
        );
        
        await client.query('COMMIT');
        
        const comment = result.rows[0];
        
        // Clear cache for the page
        await safeRedisOp(() => 
            redisClient.del(getCacheKey('comments', pageId))
        );
        
        res.json({
            likes: parseInt(comment.likes),
            dislikes: parseInt(comment.dislikes),
            userVote: finalVoteType
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Vote error:', error);
        
        if (error.message === 'Comment not found') {
            res.status(404).json({ error: 'Comment not found' });
        } else {
            res.status(500).json({ error: 'Failed to process vote' });
        }
    } finally {
        client.release();
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Check database connection
        await pgPool.query('SELECT 1');
        
        // Check Redis connection
        const redisConnected = redisClient.isReady;
        
        res.json({ 
            status: 'healthy',
            services: {
                database: 'connected',
                redis: redisConnected ? 'connected' : 'disconnected'
            }
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy',
            error: error.message 
        });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Handle 404s
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    
    // Close server
    server.close(() => {
        console.log('HTTP server closed');
    });
    
    // Close database pool
    await pgPool.end();
    console.log('Database pool closed');
    
    // Close Redis connection
    await redisClient.quit();
    console.log('Redis connection closed');
    
    process.exit(0);
});

// Start server
const server = app.listen(port, () => {
    console.log(`Comment API server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});