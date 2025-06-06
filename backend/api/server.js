const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const redis = require('redis');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

// ============================================
// INITIALIZATION
// ============================================

const app = express();
const port = process.env.PORT || 3000;

// Validate Discord credentials
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:8080';

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || DISCORD_CLIENT_ID === 'YOUR_DISCORD_CLIENT_ID') {
    console.error('ERROR: Discord OAuth credentials not configured!');
    console.error('Please set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env file');
    process.exit(1);
}

// ============================================
// DATABASE & REDIS SETUP
// ============================================

const pgPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'comments_db',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Redis reconnection failed');
            return Math.min(retries * 100, 3000);
        }
    }
});

// Connect to databases
pgPool.query('SELECT NOW()', (err) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Database connected successfully');
});

redisClient.on('error', err => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis connected successfully'));
redisClient.connect().catch(err => console.error('Redis connection failed:', err));

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
        : '*',
    credentials: true
}));

// Body parsing
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting
const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message,
        standardHeaders: true,
        legacyHeaders: false,
        store: process.env.NODE_ENV === 'production' && redisClient.isReady ? 
            new (require('rate-limit-redis'))({
                client: redisClient,
                prefix: 'rate-limit:'
            }) : undefined
    });
};

const authLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts');
const generalLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests');

// Skip rate limiting for moderators
app.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const sessionToken = authHeader.split(' ')[1];
        try {
            const userId = await redisClient.get(`session:${sessionToken}`);
            if (userId) {
                const userResult = await pgPool.query(
                    'SELECT id, name, picture, is_moderator, is_banned FROM users WHERE id = $1',
                    [userId]
                );
                if (userResult.rows.length > 0 && userResult.rows[0].is_moderator) {
                    req.skipRateLimit = true;
                }
            }
        } catch (error) {
            console.error('Error checking moderator status:', error);
        }
    }
    next();
});

app.use((req, res, next) => {
    if (req.skipRateLimit) return next();
    return generalLimiter(req, res, next);
});

// ============================================
// DATABASE INITIALIZATION
// ============================================

const initDatabase = async () => {
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                picture TEXT,
                is_moderator BOOLEAN DEFAULT FALSE,
                is_banned BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Comments table
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
        
        // Votes table
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
        
        // Reports table with page_id for efficient queries
        await client.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER NOT NULL,
                reporter_id VARCHAR(255) NOT NULL,
                page_id VARCHAR(255) NOT NULL,
                reason VARCHAR(500),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                resolved_by VARCHAR(255),
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE(comment_id, reporter_id)
            )
        `);
        
        // Report rate limiting
        await client.query(`
            CREATE TABLE IF NOT EXISTS report_rate_limits (
                user_id VARCHAR(255) PRIMARY KEY,
                report_count INTEGER DEFAULT 0,
                window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Create indexes for performance
        await client.query('CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_votes_comment_id ON votes(comment_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reports_page_id_status ON reports(page_id, status)');
        
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

initDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

// ============================================
// HELPER FUNCTIONS
// ============================================

const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

const getCacheKey = (type, id) => `${type}:${id}`;

const safeRedisOp = async (operation, fallback = null) => {
    try {
        if (!redisClient.isReady) return fallback;
        return await operation();
    } catch (error) {
        console.error('Redis operation failed:', error);
        return fallback;
    }
};

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    try {
        const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
        
        if (!userId) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        const userResult = await pgPool.query(
            'SELECT id, name, is_moderator, is_banned FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        if (user.is_banned) {
            return res.status(403).json({ error: 'User is banned' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

const requireModerator = async (req, res, next) => {
    if (!req.user || !req.user.is_moderator) {
        return res.status(403).json({ error: 'Moderator access required' });
    }
    next();
};

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Discord OAuth callback
app.post('/api/discord/callback', authLimiter, async (req, res) => {
    const { code, state } = req.body;
    
    if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    try {
        // Exchange code for token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            }
        );
        
        const { access_token } = tokenResponse.data;
        
        // Get user info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` },
            timeout: 10000
        });
        
        const discordUser = userResponse.data;
        
        // Build user object
        const user = {
            id: `discord_${discordUser.id}`,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: discordUser.avatar ? 
                `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : 
                `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`,
            email: discordUser.email || `${discordUser.id}@discord.user`
        };
        
        // Check if initial moderator
        const initialModerators = process.env.INITIAL_MODERATORS?.split(',').map(id => id.trim()) || [];
        const isInitialModerator = initialModerators.includes(user.id);
        
        // Upsert user
        await pgPool.query(
            `INSERT INTO users (id, email, name, picture, is_moderator) 
             VALUES ($1, $2, $3, $4, $5) 
             ON CONFLICT (id) DO UPDATE 
             SET name = EXCLUDED.name, 
                 picture = EXCLUDED.picture, 
                 is_moderator = CASE 
                     WHEN $5 = true THEN true 
                     ELSE users.is_moderator 
                 END,
                 updated_at = CURRENT_TIMESTAMP`,
            [user.id, user.email, user.username, user.avatar, isInitialModerator]
        );
        
        // Get user status
        const userResult = await pgPool.query(
            'SELECT is_moderator, is_banned FROM users WHERE id = $1',
            [user.id]
        );
        
        if (userResult.rows.length > 0) {
            user.is_moderator = userResult.rows[0].is_moderator;
            user.is_banned = userResult.rows[0].is_banned;
        }
        
        // Generate session
        const sessionToken = generateSessionToken();
        await safeRedisOp(() => 
            redisClient.setEx(`session:${sessionToken}`, 86400, user.id)
        );
        
        res.json({ user, sessionToken });
    } catch (error) {
        console.error('Discord OAuth error:', error.response?.data || error.message);
        res.status(error.response?.status === 401 ? 401 : 500).json({ 
            error: 'Discord authentication failed' 
        });
    }
});

// Logout
app.post('/api/logout', authenticateUser, async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.substring(7);
    
    await safeRedisOp(() => redisClient.del(`session:${token}`));
    res.json({ success: true });
});

// ============================================
// COMMENT ROUTES
// ============================================

// Get comments for a page
app.get('/api/comments/:pageId', async (req, res) => {
    const { pageId } = req.params;
    const { userId } = req.query;
    
    if (!pageId || pageId.length > 255) {
        return res.status(400).json({ error: 'Invalid page ID' });
    }
    
    try {
        const cacheKey = getCacheKey('comments', pageId);
        
        // Try cache for non-user-specific requests
        if (!userId) {
            const cached = await safeRedisOp(() => redisClient.get(cacheKey));
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        }
        
        // Query with user votes
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
            likes: parseInt(row.likes),
            dislikes: parseInt(row.dislikes),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userName: row.user_name,
            userPicture: row.user_picture,
            userVote: row.user_vote
        }));
        
        // Cache non-user-specific results
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

// Create comment
app.post('/api/comments', authenticateUser, async (req, res) => {
    const { pageId, content, parentId } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;
    
    if (!pageId || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (content.length > 5000) {
        return res.status(400).json({ error: 'Comment too long (max 5000 characters)' });
    }
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get user picture
        const userResult = await client.query(
            'SELECT picture FROM users WHERE id = $1',
            [userId]
        );
        const userPicture = userResult.rows[0]?.picture;
        
        // Verify parent exists
        if (parentId) {
            const parentCheck = await client.query(
                'SELECT id FROM comments WHERE id = $1',
                [parentId]
            );
            if (parentCheck.rows.length === 0) {
                throw new Error('Parent comment not found');
            }
        }
        
        // Insert comment
        const result = await client.query(
            `INSERT INTO comments (page_id, user_id, parent_id, content) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [pageId, userId, parentId || null, content]
        );
        
        const comment = result.rows[0];
        
        await client.query('COMMIT');
        
        // Clear cache
        await safeRedisOp(() => 
            redisClient.del(getCacheKey('comments', pageId))
        );
        
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
        
        if (error.message === 'Parent comment not found') {
            res.status(404).json({ error: 'Parent comment not found' });
        } else {
            res.status(500).json({ error: 'Failed to create comment' });
        }
    } finally {
        client.release();
    }
});

// Vote on comment
app.post('/api/comments/:commentId/vote', authenticateUser, async (req, res) => {
    const { commentId } = req.params;
    const { voteType } = req.body;
    const userId = req.user.id;
    
    if (!voteType || !['like', 'dislike'].includes(voteType)) {
        return res.status(400).json({ error: 'Invalid vote type' });
    }
    
    const commentIdNum = parseInt(commentId);
    if (isNaN(commentIdNum)) {
        return res.status(400).json({ error: 'Invalid comment ID' });
    }
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Lock comment row
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
                // Toggle off
                await client.query(
                    'DELETE FROM votes WHERE comment_id = $1 AND user_id = $2',
                    [commentIdNum, userId]
                );
                
                const column = voteType === 'like' ? 'likes' : 'dislikes';
                await client.query(
                    `UPDATE comments SET ${column} = ${column} - 1 WHERE id = $1`,
                    [commentIdNum]
                );
                
                finalVoteType = null;
            } else {
                // Change vote
                await client.query(
                    'UPDATE votes SET vote_type = $1 WHERE comment_id = $2 AND user_id = $3',
                    [voteType, commentIdNum, userId]
                );
                
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
            
            const column = voteType === 'like' ? 'likes' : 'dislikes';
            await client.query(
                `UPDATE comments SET ${column} = ${column} + 1 WHERE id = $1`,
                [commentIdNum]
            );
        }
        
        // Get updated counts
        const result = await client.query(
            'SELECT likes, dislikes FROM comments WHERE id = $1',
            [commentIdNum]
        );
        
        await client.query('COMMIT');
        
        // Clear cache
        await safeRedisOp(() => 
            redisClient.del(getCacheKey('comments', pageId))
        );
        
        const comment = result.rows[0];
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

// Delete comment
app.delete('/api/comments/:commentId', authenticateUser, async (req, res) => {
    const { commentId } = req.params;
    const userId = req.user.id;
    const isUserModerator = req.user.is_moderator;
    
    const commentIdNum = parseInt(commentId);
    if (isNaN(commentIdNum)) {
        return res.status(400).json({ error: 'Invalid comment ID' });
    }
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get comment
        const commentResult = await client.query(
            'SELECT * FROM comments WHERE id = $1',
            [commentIdNum]
        );
        
        if (commentResult.rows.length === 0) {
            throw new Error('Comment not found');
        }
        
        const comment = commentResult.rows[0];
        
        // Check permissions
        if (comment.user_id !== userId && !isUserModerator) {
            throw new Error('Unauthorized');
        }
        
        // Check for children
        const childrenCheck = await client.query(
            'SELECT COUNT(*) as count FROM comments WHERE parent_id = $1',
            [commentIdNum]
        );
        
        const hasChildren = parseInt(childrenCheck.rows[0].count) > 0;
        
        if (hasChildren) {
            // Mark as deleted
            await client.query(
                'UPDATE comments SET content = $1, user_id = $2 WHERE id = $3',
                ['[deleted]', userId, commentIdNum]
            );
        } else {
            // Delete completely
            await client.query('DELETE FROM comments WHERE id = $1', [commentIdNum]);
            
            // Clean up orphaned deleted parents
            await cleanupOrphanedDeletedComments(client, comment.parent_id);
        }
        
        await client.query('COMMIT');
        
        // Clear cache
        await safeRedisOp(() => 
            redisClient.del(getCacheKey('comments', comment.page_id))
        );
        
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete comment error:', error);
        
        if (error.message === 'Comment not found') {
            res.status(404).json({ error: 'Comment not found' });
        } else if (error.message === 'Unauthorized') {
            res.status(403).json({ error: 'Unauthorized' });
        } else {
            res.status(500).json({ error: 'Failed to delete comment' });
        }
    } finally {
        client.release();
    }
});

// Helper: Clean up orphaned deleted comments
async function cleanupOrphanedDeletedComments(client, parentId) {
    if (!parentId) return;
    
    const parentCheck = await client.query(
        'SELECT id, content, parent_id FROM comments WHERE id = $1',
        [parentId]
    );
    
    if (parentCheck.rows.length === 0) return;
    
    const parent = parentCheck.rows[0];
    
    if (parent.content === '[deleted]') {
        const childrenCount = await client.query(
            'SELECT COUNT(*) as count FROM comments WHERE parent_id = $1',
            [parent.id]
        );
        
        if (parseInt(childrenCount.rows[0].count) === 0) {
            await client.query('DELETE FROM comments WHERE id = $1', [parent.id]);
            await cleanupOrphanedDeletedComments(client, parent.parent_id);
        }
    }
}

// Delete all comments for a page (moderator only)
app.delete('/api/comments/page/:pageId/all', authenticateUser, requireModerator, async (req, res) => {
    const { pageId } = req.params;
    
    if (!pageId || pageId.length > 255) {
        return res.status(400).json({ error: 'Invalid page ID' });
    }
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Count comments
        const countResult = await client.query(
            'SELECT COUNT(*) as count FROM comments WHERE page_id = $1',
            [pageId]
        );
        
        const deletedCount = parseInt(countResult.rows[0].count);
        
        // Delete all comments and reports for the page
        await client.query('DELETE FROM comments WHERE page_id = $1', [pageId]);
        await client.query('DELETE FROM reports WHERE page_id = $1', [pageId]);
        
        await client.query('COMMIT');
        
        // Clear cache
        await safeRedisOp(() => 
            redisClient.del(getCacheKey('comments', pageId))
        );
        
        res.json({ 
            success: true, 
            deletedCount, 
            message: `Successfully deleted ${deletedCount} comment${deletedCount !== 1 ? 's' : ''}`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete all comments error:', error);
        res.status(500).json({ error: 'Failed to delete comments' });
    } finally {
        client.release();
    }
});

// ============================================
// REPORT ROUTES
// ============================================

// Report a comment
app.post('/api/comments/:commentId/report', authenticateUser, async (req, res) => {
    const { commentId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    
    const commentIdNum = parseInt(commentId);
    if (isNaN(commentIdNum)) {
        return res.status(400).json({ error: 'Invalid comment ID' });
    }
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Rate limiting for non-moderators
        if (!req.user.is_moderator) {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            
            await client.query(
                `INSERT INTO report_rate_limits (user_id, report_count, window_start) 
                 VALUES ($1, 0, $2) 
                 ON CONFLICT (user_id) DO NOTHING`,
                [userId, now]
            );
            
            const rateLimitResult = await client.query(
                `UPDATE report_rate_limits 
                 SET report_count = CASE 
                     WHEN window_start < $2 THEN 1 
                     ELSE report_count + 1 
                 END,
                 window_start = CASE 
                     WHEN window_start < $2 THEN $3 
                     ELSE window_start 
                 END
                 WHERE user_id = $1 AND (
                     window_start >= $2 OR report_count < 5
                 )
                 RETURNING report_count`,
                [userId, oneHourAgo, now]
            );
            
            if (rateLimitResult.rows.length === 0) {
                throw new Error('Rate limit exceeded');
            }
        }
        
        // Get comment page_id
        const commentResult = await client.query(
            'SELECT page_id FROM comments WHERE id = $1',
            [commentIdNum]
        );
        
        if (commentResult.rows.length === 0) {
            throw new Error('Comment not found');
        }
        
        const pageId = commentResult.rows[0].page_id;
        
        // Create report
        await client.query(
            `INSERT INTO reports (comment_id, reporter_id, page_id, reason) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (comment_id, reporter_id) DO NOTHING`,
            [commentIdNum, userId, pageId, reason || 'No reason provided']
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Report comment error:', error);
        
        if (error.message === 'Rate limit exceeded') {
            res.status(429).json({ error: 'Too many reports. Please try again later.' });
        } else if (error.message === 'Comment not found') {
            res.status(404).json({ error: 'Comment not found' });
        } else {
            res.status(500).json({ error: 'Failed to report comment' });
        }
    } finally {
        client.release();
    }
});

// Get reports for a specific page (moderator only)
app.get('/api/reports/:pageId', authenticateUser, requireModerator, async (req, res) => {
    const { pageId } = req.params;
    
    try {
        const reports = await pgPool.query(
            `SELECT r.*, 
                    COALESCE(c.content, '[Comment deleted]') as content, 
                    c.user_id as comment_user_id, 
                    u1.name as reporter_name, 
                    COALESCE(u2.name, '[Deleted User]') as comment_user_name
             FROM reports r
             LEFT JOIN comments c ON r.comment_id = c.id
             JOIN users u1 ON r.reporter_id = u1.id
             LEFT JOIN users u2 ON c.user_id = u2.id
             WHERE r.page_id = $1 AND r.status = 'pending'
             ORDER BY r.created_at DESC`,
            [pageId]
        );
        
        res.json(reports.rows);
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

// Get all pending reports (moderator only)
app.get('/api/reports', authenticateUser, requireModerator, async (req, res) => {
    try {
        const reports = await pgPool.query(
            `SELECT r.*, c.content, c.user_id as comment_user_id, 
                    u1.name as reporter_name, u2.name as comment_user_name
             FROM reports r
             JOIN comments c ON r.comment_id = c.id
             JOIN users u1 ON r.reporter_id = u1.id
             JOIN users u2 ON c.user_id = u2.id
             WHERE r.status = 'pending'
             ORDER BY r.created_at DESC`
        );
        
        res.json(reports.rows);
    } catch (error) {
        console.error('Get all reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

// Resolve report (moderator only)
app.put('/api/reports/:reportId/resolve', authenticateUser, requireModerator, async (req, res) => {
    const { reportId } = req.params;
    const { action } = req.body;
    const userId = req.user.id;
    
    if (!action || !['resolved', 'dismissed'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    try {
        await pgPool.query(
            `UPDATE reports 
             SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2
             WHERE id = $3`,
            [action, userId, reportId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Resolve report error:', error);
        res.status(500).json({ error: 'Failed to resolve report' });
    }
});

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

// Get user data (own data only)
app.get('/api/users/:userId', authenticateUser, async (req, res) => {
    const { userId } = req.params;
    
    if (userId !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        const result = await pgPool.query(
            'SELECT id, email, name, picture, is_moderator, is_banned FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
        res.json({
            id: user.id,
            username: user.name,
            email: user.email,
            avatar: user.picture,
            is_moderator: user.is_moderator,
            is_banned: user.is_banned
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// Ban user (moderator only)
app.post('/api/users/:targetUserId/ban', authenticateUser, requireModerator, async (req, res) => {
    const { targetUserId } = req.params;
    const userId = req.user.id;
    
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Ban user
        await client.query(
            'UPDATE users SET is_banned = TRUE WHERE id = $1',
            [targetUserId]
        );
        
        // Delete all comments by banned user
        await client.query(
            'DELETE FROM comments WHERE user_id = $1',
            [targetUserId]
        );
        
        // Resolve related reports
        await client.query(
            `UPDATE reports 
             SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = $1
             WHERE comment_id IN (SELECT id FROM comments WHERE user_id = $2)`,
            [userId, targetUserId]
        );
        
        await client.query('COMMIT');
        
        // Clear all caches
        await safeRedisOp(() => redisClient.flushDb());
        
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ban user error:', error);
        res.status(500).json({ error: 'Failed to ban user' });
    } finally {
        client.release();
    }
});

// ============================================
// MODERATOR MANAGEMENT ROUTES
// ============================================

// Get moderators list (moderator only)
app.get('/api/moderators', authenticateUser, requireModerator, async (req, res) => {
    try {
        const moderators = await pgPool.query(
            'SELECT id, name, picture, email FROM users WHERE is_moderator = TRUE ORDER BY name'
        );
        
        res.json(moderators.rows);
    } catch (error) {
        console.error('Get moderators error:', error);
        res.status(500).json({ error: 'Failed to get moderators' });
    }
});

// Set moderator status (moderator only)
app.put('/api/users/:targetUserId/moderator', authenticateUser, requireModerator, async (req, res) => {
    const { targetUserId } = req.params;
    const { isModerator } = req.body;
    
    if (isModerator === undefined) {
        return res.status(400).json({ error: 'Moderator status required' });
    }
    
    try {
        await pgPool.query(
            'UPDATE users SET is_moderator = $1 WHERE id = $2',
            [isModerator, targetUserId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Set moderator error:', error);
        res.status(500).json({ error: 'Failed to update moderator status' });
    }
});

// ============================================
// UTILITY ROUTES
// ============================================

// Public configuration
app.get('/api/config', (req, res) => {
    res.json({
        discordClientId: DISCORD_CLIENT_ID,
        discordRedirectUri: DISCORD_REDIRECT_URI
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await pgPool.query('SELECT 1');
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

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    
    server.close(() => {
        console.log('HTTP server closed');
    });
    
    await pgPool.end();
    console.log('Database pool closed');
    
    await redisClient.quit();
    console.log('Redis connection closed');
    
    process.exit(0);
});

// ============================================
// START SERVER
// ============================================

const server = app.listen(port, () => {
    console.log(`Comment API server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Discord OAuth configured: ${!!DISCORD_CLIENT_ID && !!DISCORD_CLIENT_SECRET}`);
});