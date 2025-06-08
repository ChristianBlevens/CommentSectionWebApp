const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const redis = require('redis');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Configuration
const config = {
    discord: {
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        redirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:8080'
    },
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
            : '*',
        credentials: true
    },
    session: {
        duration: parseInt(process.env.SESSION_DURATION) || 86400
    }
};

// Validate Discord configuration
if (!config.discord.clientId || !config.discord.clientSecret || 
    config.discord.clientId === 'YOUR_DISCORD_CLIENT_ID') {
    console.error('ERROR: Discord OAuth credentials not configured!');
    process.exit(1);
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

app.use(cors(config.cors));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Database connection
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

// Redis connection
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Redis reconnection failed');
            return Math.min(retries * 100, 3000);
        }
    }
});

// Connect to Redis
redisClient.connect().catch(err => {
    console.error('Redis connection failed:', err);
});

// Middleware to check moderator status for rate limiting
const checkModeratorForRateLimit = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
            if (userId) {
                const userResult = await pgPool.query(
                    'SELECT is_moderator FROM users WHERE id = $1',
                    [userId]
                );
                if (userResult.rows.length > 0 && userResult.rows[0].is_moderator) {
                    req.isModerator = true;
                }
            }
        } catch (error) {
            // Silently continue - rate limiting will apply normally
        }
    }
    next();
};

// Apply moderator check middleware before rate limiters
app.use(checkModeratorForRateLimit);

// Rate limiters
const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => req.isModerator === true
    });
};

const authLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts');
const generalLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests');

// Apply general rate limiter
app.use(generalLimiter);

// Helper functions
const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

const safeRedisOp = async (operation) => {
    try {
        if (!redisClient.isReady) return null;
        return await operation();
    } catch (error) {
        console.error('Redis operation failed:', error);
        return null;
    }
};

// Helper function to format ban duration
const formatBanDuration = (milliseconds) => {
    if (milliseconds <= 0) return 'Ban expired';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} remaining`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
    } else {
        return `${seconds} second${seconds > 1 ? 's' : ''} remaining`;
    }
};

// Parse ban duration from string (e.g., "30m", "6h", "1d")
const parseBanDuration = (duration) => {
    if (!duration || duration === 'permanent') return null;
    
    const match = duration.match(/^(\d+)([mhd]?)$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2] || 'm'; // Default to minutes
    
    const multipliers = {
        'm': 60 * 1000,           // minutes to milliseconds
        'h': 60 * 60 * 1000,      // hours to milliseconds
        'd': 24 * 60 * 60 * 1000  // days to milliseconds
    };
    
    return value * multipliers[unit];
};

// Authentication middleware
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    try {
        // Get user from session
        const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
        if (!userId) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        // Get user from database with ban details
        const userResult = await pgPool.query(
            'SELECT id, name, is_moderator, is_banned, ban_expires_at, ban_reason, banned_at FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        // Check if user is banned and handle expired bans
        if (user.is_banned) {
            if (user.ban_expires_at && new Date(user.ban_expires_at) <= new Date()) {
                // Ban has expired, unban the user
                await pgPool.query(
                    `UPDATE users 
                     SET is_banned = FALSE, 
                         ban_expires_at = NULL, 
                         ban_reason = NULL, 
                         banned_by = NULL, 
                         banned_at = NULL 
                     WHERE id = $1`,
                    [userId]
                );
                
                // Record automatic unban in history
                await pgPool.query(
                    `INSERT INTO ban_history (user_id, action, duration, expires_at, reason, performed_by)
                     VALUES ($1, 'unban', NULL, NULL, 'Ban expired', $2)`,
                    [userId, 'system']
                );
                user.is_banned = false;
                user.ban_expired = true; // Flag for notification
            } else {
                // Calculate remaining ban time
                const banInfo = {
                    is_banned: true,
                    ban_expires_at: user.ban_expires_at,
                    ban_reason: user.ban_reason,
                    banned_at: user.banned_at
                };
                
                if (user.ban_expires_at) {
                    const remaining = new Date(user.ban_expires_at) - new Date();
                    banInfo.remaining_ms = remaining;
                    banInfo.remaining_text = formatBanDuration(remaining);
                } else {
                    banInfo.permanent = true;
                }
                
                return res.status(403).json({ 
                    error: 'User is banned',
                    ban_info: banInfo
                });
            }
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

// Moderator middleware
const requireModerator = (req, res, next) => {
    if (!req.user?.is_moderator) {
        return res.status(403).json({ error: 'Moderator access required' });
    }
    next();
};

// Initialize database schema
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
                ban_expires_at TIMESTAMP,
                ban_reason TEXT,
                banned_by VARCHAR(255),
                banned_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add new ban columns if they don't exist (for existing databases)
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='ban_expires_at') THEN
                    ALTER TABLE users ADD COLUMN ban_expires_at TIMESTAMP;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='ban_reason') THEN
                    ALTER TABLE users ADD COLUMN ban_reason TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='banned_by') THEN
                    ALTER TABLE users ADD COLUMN banned_by VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='banned_at') THEN
                    ALTER TABLE users ADD COLUMN banned_at TIMESTAMP;
                END IF;
            END $$;
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
        
        // Reports table
        await client.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER NOT NULL,
                reporter_id VARCHAR(255) NOT NULL,
                page_id VARCHAR(255) NOT NULL,
                reason VARCHAR(500),
                comment_content TEXT NOT NULL,
                comment_user_id VARCHAR(255),
                comment_user_name VARCHAR(255),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                resolved_by VARCHAR(255),
                FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE(comment_id, reporter_id)
            )
        `);
        
        // Migrate existing reports table if needed
        // Check if comment_user_id column exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'reports' 
            AND column_name = 'comment_user_id'
        `);
        
        if (columnCheck.rows.length === 0) {
            console.log('Migrating reports table schema...');
            
            // Add missing columns
            await client.query(`
                ALTER TABLE reports 
                ADD COLUMN IF NOT EXISTS comment_content TEXT,
                ADD COLUMN IF NOT EXISTS comment_user_id VARCHAR(255),
                ADD COLUMN IF NOT EXISTS comment_user_name VARCHAR(255)
            `);
            
            // Update existing reports with comment content (where possible)
            await client.query(`
                UPDATE reports r
                SET comment_content = COALESCE(c.content, '[Comment deleted]'),
                    comment_user_id = c.user_id,
                    comment_user_name = u.name
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE r.comment_id = c.id
                AND r.comment_content IS NULL
            `);
            
            // Set NOT NULL constraint after migration
            await client.query(`
                ALTER TABLE reports 
                ALTER COLUMN comment_content SET NOT NULL
            `);
            
            console.log('Reports table migration completed');
        }
        
        // Check if reports table has ON DELETE CASCADE for comment_id
        const constraintCheck = await client.query(`
            SELECT tc.constraint_name 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'reports' 
            AND kcu.column_name = 'comment_id'
            AND tc.constraint_type = 'FOREIGN KEY'
        `);
        
        // Remove CASCADE constraint if it exists
        if (constraintCheck.rows.length > 0) {
            console.log('Removing CASCADE constraint from reports table...');
            for (const row of constraintCheck.rows) {
                await client.query(`
                    ALTER TABLE reports 
                    DROP CONSTRAINT ${row.constraint_name}
                `);
            }
            console.log('CASCADE constraint removed');
        }
        
        // Report rate limits table
        await client.query(`
            CREATE TABLE IF NOT EXISTS report_rate_limits (
                user_id VARCHAR(255) PRIMARY KEY,
                report_count INTEGER DEFAULT 0,
                window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Ban history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ban_history (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                action VARCHAR(20) NOT NULL CHECK (action IN ('ban', 'unban')),
                duration VARCHAR(20),
                expires_at TIMESTAMP,
                reason TEXT,
                performed_by VARCHAR(255) NOT NULL,
                performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // User reported history table (when user's comments are reported)
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_reported_history (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                comment_id INTEGER NOT NULL,
                reporter_id VARCHAR(255) NOT NULL,
                reason VARCHAR(500),
                reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
                resolved_by VARCHAR(255),
                resolved_at TIMESTAMP,
                resolution_action VARCHAR(50),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        
        // User report history table (when user reports others)
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_report_history (
                id SERIAL PRIMARY KEY,
                reporter_id VARCHAR(255) NOT NULL,
                reported_user_id VARCHAR(255) NOT NULL,
                comment_id INTEGER NOT NULL,
                reason VARCHAR(500),
                reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
                FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Warnings table
        await client.query(`
            CREATE TABLE IF NOT EXISTS warnings (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'severe')),
                issued_by VARCHAR(255) NOT NULL,
                issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                acknowledged BOOLEAN DEFAULT FALSE,
                acknowledged_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Add trust_score and comment_count to users table if they don't exist
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='trust_score') THEN
                    ALTER TABLE users ADD COLUMN trust_score INTEGER DEFAULT 100;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='comment_count') THEN
                    ALTER TABLE users ADD COLUMN comment_count INTEGER DEFAULT 0;
                END IF;
            END $$;
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);
            CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
            CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
            CREATE INDEX IF NOT EXISTS idx_votes_comment_id ON votes(comment_id);
            CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
            CREATE INDEX IF NOT EXISTS idx_reports_page_id_status ON reports(page_id, status);
            CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
            CREATE INDEX IF NOT EXISTS idx_users_is_moderator ON users(is_moderator);
            CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
            CREATE INDEX IF NOT EXISTS idx_ban_history_user_id ON ban_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_reported_history_user_id ON user_reported_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_report_history_reporter_id ON user_report_history(reporter_id);
            CREATE INDEX IF NOT EXISTS idx_warnings_user_id_acknowledged ON warnings(user_id, acknowledged);
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

// Routes

// Public configuration
app.get('/api/config', (req, res) => {
    res.json({
        discordClientId: config.discord.clientId,
        discordRedirectUri: config.discord.redirectUri
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
                client_id: config.discord.clientId,
                client_secret: config.discord.clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.discord.redirectUri
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
        
        // Get user status including ban details
        const userResult = await pgPool.query(
            'SELECT is_moderator, is_banned, ban_expires_at, ban_reason, banned_at FROM users WHERE id = $1',
            [user.id]
        );
        
        if (userResult.rows.length > 0) {
            const userData = userResult.rows[0];
            user.is_moderator = userData.is_moderator;
            user.is_banned = userData.is_banned;
            
            // Check if ban has expired
            if (userData.is_banned && userData.ban_expires_at && new Date(userData.ban_expires_at) <= new Date()) {
                // Ban has expired, unban the user
                await pgPool.query(
                    `UPDATE users 
                     SET is_banned = FALSE, 
                         ban_expires_at = NULL, 
                         ban_reason = NULL, 
                         banned_by = NULL, 
                         banned_at = NULL 
                     WHERE id = $1`,
                    [user.id]
                );
                user.is_banned = false;
                user.ban_expired = true;
            } else if (userData.is_banned) {
                // User is still banned
                user.ban_info = {
                    is_banned: true,
                    ban_expires_at: userData.ban_expires_at,
                    ban_reason: userData.ban_reason,
                    banned_at: userData.banned_at
                };
                
                if (userData.ban_expires_at) {
                    const remaining = new Date(userData.ban_expires_at) - new Date();
                    user.ban_info.remaining_ms = remaining;
                    user.ban_info.remaining_text = formatBanDuration(remaining);
                } else {
                    user.ban_info.permanent = true;
                }
            }
        }
        
        // Generate session
        const sessionToken = generateSessionToken();
        await safeRedisOp(() => 
            redisClient.setEx(`session:${sessionToken}`, config.session.duration, user.id)
        );
        
        res.json({ user, sessionToken });
    } catch (error) {
        console.error('Discord OAuth error:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            res.status(401).json({ error: 'Invalid authorization code' });
        } else {
            res.status(500).json({ error: 'Discord authentication failed' });
        }
    }
});

// Check ban status
app.get('/api/check-ban-status', authenticateUser, async (req, res) => {
    try {
        const userResult = await pgPool.query(
            'SELECT is_banned, ban_expires_at, ban_reason, banned_at FROM users WHERE id = $1',
            [req.user.id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userResult.rows[0];
        
        // Check if ban has expired
        if (userData.is_banned && userData.ban_expires_at && new Date(userData.ban_expires_at) <= new Date()) {
            // Ban has expired, unban the user
            await pgPool.query(
                `UPDATE users 
                 SET is_banned = FALSE, 
                     ban_expires_at = NULL, 
                     ban_reason = NULL, 
                     banned_by = NULL, 
                     banned_at = NULL 
                 WHERE id = $1`,
                [req.user.id]
            );
            
            res.json({ 
                is_banned: false, 
                ban_expired: true,
                message: 'Your ban has expired. You can now interact with the comment section again.'
            });
        } else if (userData.is_banned) {
            // User is still banned
            const banInfo = {
                is_banned: true,
                ban_expires_at: userData.ban_expires_at,
                ban_reason: userData.ban_reason,
                banned_at: userData.banned_at
            };
            
            if (userData.ban_expires_at) {
                const remaining = new Date(userData.ban_expires_at) - new Date();
                banInfo.remaining_ms = remaining;
                banInfo.remaining_text = formatBanDuration(remaining);
            } else {
                banInfo.permanent = true;
            }
            
            res.json(banInfo);
        } else {
            res.json({ is_banned: false });
        }
    } catch (error) {
        console.error('Check ban status error:', error);
        res.status(500).json({ error: 'Failed to check ban status' });
    }
});

// Logout
app.post('/api/logout', authenticateUser, async (req, res) => {
    const token = req.headers.authorization.substring(7);
    await safeRedisOp(() => redisClient.del(`session:${token}`));
    res.json({ success: true });
});

// Get user data
app.get('/api/users/:userId', authenticateUser, async (req, res) => {
    const { userId } = req.params;
    
    // Users can only get their own data
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

// Get comments by user (moderators only)
app.get('/api/comments/user/:userId', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    try {
        const comments = await pgPool.query(
            `SELECT c.*, u.name as user_name, u.picture as user_picture,
                    c.page_id
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.user_id = $1
             ORDER BY c.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, parseInt(limit), parseInt(offset)]
        );
        
        res.json(comments.rows);
    } catch (error) {
        console.error('Get user comments error:', error);
        res.status(500).json({ error: 'Failed to get user comments' });
    }
});

// Get comments for page
app.get('/api/comments/:pageId', async (req, res) => {
    const { pageId } = req.params;
    const { userId } = req.query;
    
    if (!pageId || pageId.length > 255) {
        return res.status(400).json({ error: 'Invalid page ID' });
    }
    
    try {
        // Query with user votes if authenticated
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
        
        // Transform to API format
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
    
    if (!pageId || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (content.length > 5000) {
        return res.status(400).json({ error: 'Comment too long (max 5000 characters)' });
    }
    
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Verify parent exists if provided
        if (parentId) {
            const parentCheck = await client.query(
                'SELECT id FROM comments WHERE id = $1',
                [parentId]
            );
            if (parentCheck.rows.length === 0) {
                throw new Error('Parent comment not found');
            }
        }
        
        // Get user info
        const userResult = await client.query(
            'SELECT name, picture FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];
        
        // Insert comment
        const result = await client.query(
            `INSERT INTO comments (page_id, user_id, parent_id, content) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [pageId, userId, parentId || null, content]
        );
        
        // Update user's comment count
        await client.query(
            `UPDATE users 
             SET comment_count = COALESCE(comment_count, 0) + 1
             WHERE id = $1`,
            [userId]
        );
        
        const comment = result.rows[0];
        await client.query('COMMIT');
        
        // Clear cache
        await safeRedisOp(() => redisClient.del(`comments:${pageId}`));
        
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
            userName: user.name,
            userPicture: user.picture
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
    
    if (!['like', 'dislike'].includes(voteType)) {
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
                // Remove vote
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
        await safeRedisOp(() => redisClient.del(`comments:${pageId}`));
        
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
        
        // Check permission
        if (comment.user_id !== userId && !isUserModerator) {
            throw new Error('Unauthorized to delete this comment');
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
            
            // Clean up orphaned deleted comments
            let parentId = comment.parent_id;
            while (parentId) {
                const parentCheck = await client.query(
                    'SELECT id, content, parent_id FROM comments WHERE id = $1',
                    [parentId]
                );
                
                if (parentCheck.rows.length === 0) break;
                
                const parent = parentCheck.rows[0];
                if (parent.content === '[deleted]') {
                    const siblingCount = await client.query(
                        'SELECT COUNT(*) as count FROM comments WHERE parent_id = $1',
                        [parent.id]
                    );
                    
                    if (parseInt(siblingCount.rows[0].count) === 0) {
                        await client.query('DELETE FROM comments WHERE id = $1', [parent.id]);
                        parentId = parent.parent_id;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
        }
        
        await client.query('COMMIT');
        
        // Clear cache
        await safeRedisOp(() => redisClient.del(`comments:${comment.page_id}`));
        
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete comment error:', error);
        if (error.message === 'Comment not found') {
            res.status(404).json({ error: 'Comment not found' });
        } else if (error.message === 'Unauthorized to delete this comment') {
            res.status(403).json({ error: 'Unauthorized' });
        } else {
            res.status(500).json({ error: 'Failed to delete comment' });
        }
    } finally {
        client.release();
    }
});

// Report comment
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
        
        // Rate limit check (skip for moderators)
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
        
        // Get comment info with user details
        const commentResult = await client.query(
            `SELECT c.page_id, c.content, c.user_id, u.name as user_name
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.id = $1`,
            [commentIdNum]
        );
        
        if (commentResult.rows.length === 0) {
            throw new Error('Comment not found');
        }
        
        const comment = commentResult.rows[0];
        
        // Create report with comment copy
        console.log(`Creating report for comment ${commentIdNum} on page "${comment.page_id}" (length: ${comment.page_id.length})`);
        
        const reportResult = await client.query(
            `INSERT INTO reports (comment_id, reporter_id, page_id, reason, comment_content, comment_user_id, comment_user_name) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             ON CONFLICT (comment_id, reporter_id) DO NOTHING
             RETURNING id`,
            [commentIdNum, userId, comment.page_id, reason || 'No reason provided', 
             comment.content, comment.user_id, comment.user_name]
        );
        
        // If report was created (not duplicate), track in history
        if (reportResult.rows.length > 0) {
            // Track in user_reported_history (user being reported)
            await client.query(
                `INSERT INTO user_reported_history (user_id, comment_id, reporter_id, reason)
                 VALUES ($1, $2, $3, $4)`,
                [comment.user_id, commentIdNum, userId, reason || 'No reason provided']
            );
            
            // Track in user_report_history (user making the report)
            await client.query(
                `INSERT INTO user_report_history (reporter_id, reported_user_id, comment_id, reason)
                 VALUES ($1, $2, $3, $4)`,
                [userId, comment.user_id, commentIdNum, reason || 'No reason provided']
            );
            
            // Update user's trust score (decrease for being reported)
            await client.query(
                `UPDATE users 
                 SET trust_score = GREATEST(0, trust_score - 5)
                 WHERE id = $1`,
                [comment.user_id]
            );
        }
        
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

// Get reports with optional page filter (moderators only) - MOVED UP TO AVOID ROUTE CONFLICT
app.get('/api/reports/filter', authenticateUser, requireModerator, async (req, res) => {
    const { pageId } = req.query;
    
    console.log(`[FILTER ENDPOINT] Getting reports with filter - pageId: "${pageId}" (length: ${pageId ? pageId.length : 0})`);
    
    try {
        let query = `
            SELECT r.*, 
                   r.comment_content as content,
                   u1.name as reporter_name
            FROM reports r
            JOIN users u1 ON r.reporter_id = u1.id
            WHERE r.status = 'pending'
        `;
        
        const params = [];
        if (pageId) {
            // Use TRIM to handle any whitespace issues
            query += ' AND TRIM(r.page_id) = TRIM($1)';
            params.push(pageId);
            console.log(`[FILTER ENDPOINT] Filtering reports for page: "${pageId}" (trimmed)`);
        }
        
        query += ' ORDER BY r.created_at DESC';
        
        const reports = await pgPool.query(query, params);
        console.log(`[FILTER ENDPOINT] Found ${reports.rows.length} reports${pageId ? ` for page "${pageId}"` : ' (all pages)'}`);
        
        // Enhanced debugging for page_id mismatch
        if (reports.rows.length === 0 && pageId) {
            const allReports = await pgPool.query(
                `SELECT DISTINCT page_id, LENGTH(page_id) as len, 
                        ENCODE(page_id::bytea, 'hex') as hex_value 
                 FROM reports 
                 WHERE status = 'pending' 
                 LIMIT 10`
            );
            console.log('[FILTER ENDPOINT] Sample page_ids in reports table:');
            allReports.rows.forEach(r => {
                console.log(`  - "${r.page_id}" (length: ${r.len}, hex: ${r.hex_value})`);
            });
            
            // Check exact match
            const exactMatch = await pgPool.query(
                `SELECT COUNT(*) as count FROM reports 
                 WHERE page_id = $1 AND status = 'pending'`,
                [pageId]
            );
            console.log(`[FILTER ENDPOINT] Exact match count for "${pageId}": ${exactMatch.rows[0].count}`);
            
            // Check with LIKE to see if there's partial match
            const likeMatch = await pgPool.query(
                `SELECT COUNT(*) as count FROM reports 
                 WHERE page_id LIKE $1 AND status = 'pending'`,
                [`%${pageId}%`]
            );
            console.log(`[FILTER ENDPOINT] LIKE match count for "%${pageId}%": ${likeMatch.rows[0].count}`);
        }
        
        // Prevent caching
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json(reports.rows);
    } catch (error) {
        console.error('[FILTER ENDPOINT] Get filtered reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

// Get reports for page (moderators only)
app.get('/api/reports/:pageId', authenticateUser, requireModerator, async (req, res) => {
    const { pageId } = req.params;
    
    try {
        // Query specifically for this page's reports
        const reports = await pgPool.query(
            `SELECT r.*, 
                    r.comment_content as content,
                    u1.name as reporter_name
             FROM reports r
             JOIN users u1 ON r.reporter_id = u1.id
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

// Get all reports (moderators only)
app.get('/api/reports', authenticateUser, requireModerator, async (req, res) => {
    console.log('Getting all reports (no filter)');
    
    try {
        const reports = await pgPool.query(
            `SELECT r.*, 
                    r.comment_content as content,
                    u1.name as reporter_name
             FROM reports r
             JOIN users u1 ON r.reporter_id = u1.id
             WHERE r.status = 'pending'
             ORDER BY r.created_at DESC`
        );
        
        console.log(`Returning ${reports.rows.length} total reports`);
        
        // Prevent caching
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json(reports.rows);
    } catch (error) {
        console.error('Get all reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

// Resolve report (moderators only)
app.put('/api/reports/:reportId/resolve', authenticateUser, requireModerator, async (req, res) => {
    const { reportId } = req.params;
    const { action } = req.body;
    const userId = req.user.id;
    
    if (!['resolved', 'dismissed'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Get report details
        const reportResult = await client.query(
            'SELECT comment_user_id, comment_id, reporter_id FROM reports WHERE id = $1',
            [reportId]
        );
        
        if (reportResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Report not found' });
        }
        
        const report = reportResult.rows[0];
        
        // Update report status
        await client.query(
            `UPDATE reports 
             SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2
             WHERE id = $3`,
            [action, userId, reportId]
        );
        
        // Update user_reported_history
        await client.query(
            `UPDATE user_reported_history 
             SET status = $1, resolved_by = $2, resolved_at = CURRENT_TIMESTAMP, resolution_action = $3
             WHERE user_id = $4 AND comment_id = $5 AND reporter_id = $6 AND status = 'pending'`,
            [action, userId, action, report.comment_user_id, report.comment_id, report.reporter_id]
        );
        
        // Update user_report_history
        await client.query(
            `UPDATE user_report_history 
             SET status = $1
             WHERE reporter_id = $2 AND comment_id = $3 AND status = 'pending'`,
            [action, report.reporter_id, report.comment_id]
        );
        
        // Update trust scores based on resolution
        if (action === 'dismissed') {
            // Restore trust to reported user if report was dismissed
            await client.query(
                `UPDATE users 
                 SET trust_score = LEAST(100, trust_score + 5)
                 WHERE id = $1`,
                [report.comment_user_id]
            );
            
            // Decrease trust of false reporter
            await client.query(
                `UPDATE users 
                 SET trust_score = GREATEST(0, trust_score - 10)
                 WHERE id = $1`,
                [report.reporter_id]
            );
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Resolve report error:', error);
        res.status(500).json({ error: 'Failed to resolve report' });
    } finally {
        client.release();
    }
});

// Ban user (moderators only)
app.post('/api/users/:targetUserId/ban', authenticateUser, requireModerator, async (req, res) => {
    const { targetUserId } = req.params;
    const { duration, reason, deleteComments = true } = req.body;
    const userId = req.user.id;
    
    // Parse ban duration
    const banDurationMs = parseBanDuration(duration);
    const banExpiresAt = banDurationMs ? new Date(Date.now() + banDurationMs) : null;
    
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Check if user exists
        const userCheck = await client.query(
            'SELECT id, name FROM users WHERE id = $1',
            [targetUserId]
        );
        
        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Ban user with time-based ban details
        await client.query(
            `UPDATE users 
             SET is_banned = TRUE,
                 ban_expires_at = $2,
                 ban_reason = $3,
                 banned_by = $4,
                 banned_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [targetUserId, banExpiresAt, reason || 'No reason provided', userId]
        );
        
        // Record ban in history
        await client.query(
            `INSERT INTO ban_history (user_id, action, duration, expires_at, reason, performed_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [targetUserId, 'ban', duration || 'permanent', banExpiresAt, reason || 'No reason provided', userId]
        );
        
        // Optionally delete comments
        if (deleteComments) {
            await client.query(
                'DELETE FROM comments WHERE user_id = $1',
                [targetUserId]
            );
        }
        
        // Resolve any pending reports for this user
        await client.query(
            `UPDATE reports 
             SET status = 'resolved', 
                 resolved_at = CURRENT_TIMESTAMP, 
                 resolved_by = $1
             WHERE comment_user_id = $2 AND status = 'pending'`,
            [userId, targetUserId]
        );
        
        await client.query('COMMIT');
        
        // Clear all caches
        await safeRedisOp(() => redisClient.flushDb());
        
        // Prepare response
        const banInfo = {
            success: true,
            banned_user: userCheck.rows[0].name,
            ban_type: banExpiresAt ? 'temporary' : 'permanent',
            ban_expires_at: banExpiresAt,
            ban_duration_text: banExpiresAt ? formatBanDuration(banDurationMs) : 'Permanent ban',
            reason: reason || 'No reason provided'
        };
        
        res.json(banInfo);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ban user error:', error);
        res.status(500).json({ error: 'Failed to ban user' });
    } finally {
        client.release();
    }
});

// Issue warning to user (moderators only)
app.post('/api/users/:targetUserId/warn', authenticateUser, requireModerator, async (req, res) => {
    const { targetUserId } = req.params;
    const { message, severity = 'info' } = req.body;
    const userId = req.user.id;
    
    if (!message) {
        return res.status(400).json({ error: 'Warning message is required' });
    }
    
    if (!['info', 'warning', 'severe'].includes(severity)) {
        return res.status(400).json({ error: 'Invalid severity level' });
    }
    
    try {
        // Check if user exists
        const userCheck = await pgPool.query(
            'SELECT id, name FROM users WHERE id = $1',
            [targetUserId]
        );
        
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Create warning
        await pgPool.query(
            `INSERT INTO warnings (user_id, message, severity, issued_by)
             VALUES ($1, $2, $3, $4)`,
            [targetUserId, message, severity, userId]
        );
        
        res.json({ 
            success: true, 
            warned_user: userCheck.rows[0].name,
            message: message,
            severity: severity
        });
    } catch (error) {
        console.error('Warn user error:', error);
        res.status(500).json({ error: 'Failed to issue warning' });
    }
});

// Get user's pending warnings
app.get('/api/warnings', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Get all unacknowledged warnings
        const warnings = await pgPool.query(
            `SELECT w.*, u.name as issued_by_name
             FROM warnings w
             JOIN users u ON w.issued_by = u.id
             WHERE w.user_id = $1 AND w.acknowledged = FALSE
             ORDER BY w.issued_at DESC`,
            [userId]
        );
        
        res.json(warnings.rows);
    } catch (error) {
        console.error('Get warnings error:', error);
        res.status(500).json({ error: 'Failed to get warnings' });
    }
});

// Acknowledge warning
app.put('/api/warnings/:warningId/acknowledge', authenticateUser, async (req, res) => {
    const { warningId } = req.params;
    const userId = req.user.id;
    
    try {
        const result = await pgPool.query(
            `UPDATE warnings 
             SET acknowledged = TRUE, acknowledged_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2 AND acknowledged = FALSE
             RETURNING id`,
            [warningId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Warning not found or already acknowledged' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Acknowledge warning error:', error);
        res.status(500).json({ error: 'Failed to acknowledge warning' });
    }
});

// Get moderators (moderators only)
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

// Get user history (moderators only)
app.get('/api/users/:userId/history', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    
    try {
        // Get ban history
        const banHistory = await pgPool.query(
            `SELECT bh.*, u.name as performed_by_name
             FROM ban_history bh
             JOIN users u ON bh.performed_by = u.id
             WHERE bh.user_id = $1
             ORDER BY bh.performed_at DESC
             LIMIT 10`,
            [userId]
        );
        
        // Get reported history (times user has been reported)
        const reportedHistory = await pgPool.query(
            `SELECT urh.*, u.name as reporter_name
             FROM user_reported_history urh
             JOIN users u ON urh.reporter_id = u.id
             WHERE urh.user_id = $1
             ORDER BY urh.reported_at DESC
             LIMIT 10`,
            [userId]
        );
        
        // Get report history (times user has reported others)
        const reportHistory = await pgPool.query(
            `SELECT urh.*, u.name as reported_user_name
             FROM user_report_history urh
             JOIN users u ON urh.reported_user_id = u.id
             WHERE urh.reporter_id = $1
             ORDER BY urh.reported_at DESC
             LIMIT 10`,
            [userId]
        );
        
        res.json({
            banHistory: banHistory.rows,
            reportedHistory: reportedHistory.rows,
            reportHistory: reportHistory.rows
        });
    } catch (error) {
        console.error('Get user history error:', error);
        res.status(500).json({ error: 'Failed to get user history' });
    }
});

// Get all users with stats (moderators only)
app.get('/api/users', authenticateUser, requireModerator, async (req, res) => {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let query = `
            SELECT 
                u.*,
                COUNT(DISTINCT c.id) as comment_count,
                COUNT(DISTINCT urh.id) as times_reported,
                COUNT(DISTINCT urh2.id) as reports_made,
                COUNT(DISTINCT bh.id) as ban_count,
                CASE WHEN u.is_banned = TRUE THEN 
                    CASE WHEN u.ban_expires_at IS NULL THEN 'permanent'
                         ELSE 'temporary'
                    END
                ELSE NULL END as current_ban_status
            FROM users u
            LEFT JOIN comments c ON u.id = c.user_id
            LEFT JOIN user_reported_history urh ON u.id = urh.user_id
            LEFT JOIN user_report_history urh2 ON u.id = urh2.reporter_id
            LEFT JOIN ban_history bh ON u.id = bh.user_id AND bh.action = 'ban'
        `;
        
        const params = [];
        
        if (search) {
            query += ` WHERE (LOWER(u.name) LIKE LOWER($1) OR LOWER(u.email) LIKE LOWER($1) OR u.id LIKE $1)`;
            params.push(`%${search}%`);
        }
        
        query += `
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        
        params.push(parseInt(limit), offset);
        
        const result = await pgPool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM users';
        const countParams = [];
        
        if (search) {
            countQuery += ` WHERE (LOWER(name) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1) OR id LIKE $1)`;
            countParams.push(`%${search}%`);
        }
        
        const countResult = await pgPool.query(countQuery, countParams);
        
        res.json({
            users: result.rows,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Set moderator status (moderators only)
app.put('/api/users/:targetUserId/moderator', authenticateUser, requireModerator, async (req, res) => {
    const { targetUserId } = req.params;
    const { isModerator } = req.body;
    
    if (typeof isModerator !== 'boolean') {
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

// Delete all comments for page (moderators only)
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
        
        if (deletedCount === 0) {
            await client.query('COMMIT');
            return res.json({ success: true, deletedCount: 0, message: 'No comments to delete' });
        }
        
        // Delete comments only (preserve reports)
        await client.query('DELETE FROM comments WHERE page_id = $1', [pageId]);
        
        await client.query('COMMIT');
        
        // Clear cache
        await safeRedisOp(() => redisClient.del(`comments:${pageId}`));
        
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

// Get all pages with comments (moderators only)
app.get('/api/pages', authenticateUser, requireModerator, async (req, res) => {
    try {
        const pages = await pgPool.query(`
            SELECT DISTINCT page_id, COUNT(*) as comment_count 
            FROM comments 
            GROUP BY page_id 
            ORDER BY comment_count DESC
        `);
        
        console.log(`Returning ${pages.rows.length} pages for dropdown`);
        if (pages.rows.length > 0) {
            console.log('Sample pages:', pages.rows.slice(0, 3).map(p => 
                `${p.page_id} (${p.comment_count} comments)`
            ));
        }
        
        res.json(pages.rows);
    } catch (error) {
        console.error('Get pages error:', error);
        res.status(500).json({ error: 'Failed to get pages' });
    }
});

// Get pages with pending reports (moderators only)
app.get('/api/reports/pages', authenticateUser, requireModerator, async (req, res) => {
    try {
        const pages = await pgPool.query(`
            SELECT DISTINCT page_id, COUNT(*) as report_count 
            FROM reports 
            WHERE status = 'pending'
            GROUP BY page_id 
            ORDER BY report_count DESC
        `);
        
        console.log(`Returning ${pages.rows.length} pages with pending reports`);
        
        res.json(pages.rows);
    } catch (error) {
        console.error('Get report pages error:', error);
        res.status(500).json({ error: 'Failed to get pages with reports' });
    }
});


// Error handlers
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

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => console.log('HTTP server closed'));
    await pgPool.end();
    await redisClient.quit();
    process.exit(0);
});

// Start server
const server = app.listen(port, () => {
    console.log(`Comment API server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database host: ${process.env.DB_HOST || 'localhost'}`);
});