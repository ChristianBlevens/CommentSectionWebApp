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
        
        // Get user from database with ban details and super moderator status
        const userResult = await pgPool.query(
            'SELECT id, name, is_moderator, is_super_moderator, is_banned, ban_expires_at, ban_reason, banned_at FROM users WHERE id = $1',
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
                -- Add new columns for enhanced user tracking
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='warning_count') THEN
                    ALTER TABLE users ADD COLUMN warning_count INTEGER DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_warning_at') THEN
                    ALTER TABLE users ADD COLUMN last_warning_at TIMESTAMP;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='total_comments') THEN
                    ALTER TABLE users ADD COLUMN total_comments INTEGER DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='total_reports_made') THEN
                    ALTER TABLE users ADD COLUMN total_reports_made INTEGER DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='total_reports_received') THEN
                    ALTER TABLE users ADD COLUMN total_reports_received INTEGER DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_super_moderator') THEN
                    ALTER TABLE users ADD COLUMN is_super_moderator BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='trust_score') THEN
                    ALTER TABLE users ADD COLUMN trust_score FLOAT DEFAULT 0.5;
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
        
        // Warnings table
        await client.query(`
            CREATE TABLE IF NOT EXISTS warnings (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                moderator_id VARCHAR(255) NOT NULL,
                reason VARCHAR(500) NOT NULL,
                message TEXT,
                acknowledged BOOLEAN DEFAULT FALSE,
                acknowledged_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL
            )
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
            CREATE INDEX IF NOT EXISTS idx_warnings_user_id ON warnings(user_id);
            CREATE INDEX IF NOT EXISTS idx_warnings_acknowledged ON warnings(acknowledged);
        `);
        
        await client.query('COMMIT');
        console.log('Database schema initialized successfully');
        
        // Run data migrations
        await runDataMigrations();
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database initialization error:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Run data migrations to populate new columns
const runDataMigrations = async () => {
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Update total_comments for users
        await client.query(`
            UPDATE users u
            SET total_comments = COALESCE((
                SELECT COUNT(*) 
                FROM comments c 
                WHERE c.user_id = u.id
            ), 0)
            WHERE u.total_comments = 0
        `);
        
        // Update total_reports_made for users
        await client.query(`
            UPDATE users u
            SET total_reports_made = COALESCE((
                SELECT COUNT(*) 
                FROM reports r 
                WHERE r.reporter_id = u.id
            ), 0)
            WHERE u.total_reports_made = 0
        `);
        
        // Update total_reports_received for users
        await client.query(`
            UPDATE users u
            SET total_reports_received = COALESCE((
                SELECT COUNT(*) 
                FROM reports r 
                WHERE r.comment_user_id = u.id
            ), 0)
            WHERE u.total_reports_received = 0
        `);
        
        // Set initial moderators as super moderators
        const initialMods = process.env.INITIAL_MODERATORS?.split(',').map(id => id.trim()).filter(Boolean) || [];
        if (initialMods.length > 0) {
            await client.query(
                `UPDATE users SET is_super_moderator = TRUE WHERE id = ANY($1)`,
                [initialMods]
            );
            console.log(`Set ${initialMods.length} initial moderators as super moderators`);
        }
        
        await client.query('COMMIT');
        console.log('Data migrations completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Data migration error:', error);
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
            `INSERT INTO users (id, email, name, picture, is_moderator, is_super_moderator) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (id) DO UPDATE 
             SET name = EXCLUDED.name, 
                 picture = EXCLUDED.picture, 
                 is_moderator = CASE 
                     WHEN $5 = true THEN true 
                     ELSE users.is_moderator 
                 END,
                 is_super_moderator = CASE 
                     WHEN $6 = true THEN true 
                     ELSE users.is_super_moderator 
                 END,
                 updated_at = CURRENT_TIMESTAMP`,
            [user.id, user.email, user.username, user.avatar, isInitialModerator, isInitialModerator]
        );
        
        // Get user status including ban details
        const userResult = await pgPool.query(
            'SELECT is_moderator, is_super_moderator, is_banned, ban_expires_at, ban_reason, banned_at FROM users WHERE id = $1',
            [user.id]
        );
        
        if (userResult.rows.length > 0) {
            const userData = userResult.rows[0];
            user.is_moderator = userData.is_moderator;
            user.is_super_moderator = userData.is_super_moderator;
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
            'SELECT id, email, name, picture, is_moderator, is_super_moderator, is_banned FROM users WHERE id = $1',
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
            is_super_moderator: user.is_super_moderator,
            is_banned: user.is_banned
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
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
        
        const comment = result.rows[0];
        
        // Update user's comment count
        await client.query(
            'UPDATE users SET total_comments = total_comments + 1 WHERE id = $1',
            [userId]
        );
        
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
        
        // Only update statistics if report was actually created (not duplicate)
        if (reportResult.rows.length > 0) {
            // Update reporter's report count
            await client.query(
                'UPDATE users SET total_reports_made = total_reports_made + 1 WHERE id = $1',
                [userId]
            );
            
            // Update reported user's report count
            if (comment.user_id) {
                await client.query(
                    'UPDATE users SET total_reports_received = total_reports_received + 1 WHERE id = $1',
                    [comment.user_id]
                );
            }
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


// Get all users (moderators only)
app.get('/api/users', authenticateUser, requireModerator, async (req, res) => {
    try {
        const users = await pgPool.query(`
            SELECT 
                u.id, u.email, u.name, u.picture, u.is_moderator, u.is_super_moderator,
                u.is_banned, u.ban_expires_at, u.ban_reason, u.warning_count,
                u.total_comments, u.total_reports_made, u.total_reports_received,
                u.trust_score, u.created_at
            FROM users u
            ORDER BY u.created_at DESC
        `);
        
        res.json(users.rows);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Get user details with activity (moderators only)
app.get('/api/users/:userId/full', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    
    try {
        // Get user details
        const userResult = await pgPool.query(
            `SELECT 
                u.id, u.email, u.name, u.picture, u.is_moderator, u.is_super_moderator,
                u.is_banned, u.ban_expires_at, u.ban_reason, u.banned_by, u.banned_at,
                u.warning_count, u.last_warning_at, u.total_comments, 
                u.total_reports_made, u.total_reports_received,
                u.trust_score, u.created_at
            FROM users u
            WHERE u.id = $1`,
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        // Get recent comments (limit 5)
        const commentsResult = await pgPool.query(
            `SELECT id, page_id, content, created_at
             FROM comments
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 5`,
            [userId]
        );
        
        // Get warnings
        const warningsResult = await pgPool.query(
            `SELECT w.id, w.reason, w.message, w.created_at, w.acknowledged,
                    m.name as moderator_name
             FROM warnings w
             JOIN users m ON w.moderator_id = m.id
             WHERE w.user_id = $1
             ORDER BY w.created_at DESC`,
            [userId]
        );
        
        // Get reports against user
        const reportsReceivedResult = await pgPool.query(
            `SELECT r.id, r.reason, r.created_at, r.status, r.resolved_at,
                    rep.name as reporter_name
             FROM reports r
             JOIN users rep ON r.reporter_id = rep.id
             WHERE r.comment_user_id = $1
             ORDER BY r.created_at DESC
             LIMIT 10`,
            [userId]
        );
        
        res.json({
            ...user,
            comments: commentsResult.rows,
            warnings: warningsResult.rows,
            reports_received: reportsReceivedResult.rows
        });
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ error: 'Failed to get user details' });
    }
});

// Get user comments (moderators only)
app.get('/api/users/:userId/comments', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        const result = await pgPool.query(
            `SELECT id, page_id, parent_id, content, likes, dislikes, created_at
             FROM comments
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        
        const countResult = await pgPool.query(
            'SELECT COUNT(*) FROM comments WHERE user_id = $1',
            [userId]
        );
        
        res.json({
            comments: result.rows,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Get user comments error:', error);
        res.status(500).json({ error: 'Failed to get user comments' });
    }
});

// Issue warning to user (moderators only)
app.post('/api/users/:userId/warn', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    const { reason, message } = req.body;
    const moderatorId = req.user.id;
    
    if (!reason) {
        return res.status(400).json({ error: 'Reason is required' });
    }
    
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Create warning
        await client.query(
            `INSERT INTO warnings (user_id, moderator_id, reason, message)
             VALUES ($1, $2, $3, $4)`,
            [userId, moderatorId, reason, message || null]
        );
        
        // Update user warning count and timestamp
        await client.query(
            `UPDATE users 
             SET warning_count = warning_count + 1,
                 last_warning_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [userId]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Warn user error:', error);
        res.status(500).json({ error: 'Failed to issue warning' });
    } finally {
        client.release();
    }
});

// Get unread warnings for current user
app.get('/api/users/warnings/unread', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    
    try {
        const result = await pgPool.query(
            `SELECT id, reason, message, created_at
             FROM warnings
             WHERE user_id = $1 AND acknowledged = FALSE
             ORDER BY created_at DESC`,
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get unread warnings error:', error);
        res.status(500).json({ error: 'Failed to get warnings' });
    }
});

// Acknowledge warnings
app.post('/api/users/warnings/acknowledge', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    
    try {
        await pgPool.query(
            `UPDATE warnings 
             SET acknowledged = TRUE,
                 acknowledged_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND acknowledged = FALSE`,
            [userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Acknowledge warnings error:', error);
        res.status(500).json({ error: 'Failed to acknowledge warnings' });
    }
});

// Toggle moderator status (super moderators only)
app.put('/api/users/:userId/moderator', authenticateUser, async (req, res) => {
    const { userId } = req.params;
    const { is_moderator } = req.body;
    
    // Check if user is super moderator
    if (!req.user.is_super_moderator) {
        const initialMods = process.env.INITIAL_MODERATORS?.split(',').map(id => id.trim()).filter(Boolean) || [];
        if (!initialMods.includes(req.user.id)) {
            return res.status(403).json({ error: 'Only super moderators can change moderator status' });
        }
    }
    
    try {
        await pgPool.query(
            'UPDATE users SET is_moderator = $1 WHERE id = $2',
            [is_moderator, userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Toggle moderator error:', error);
        res.status(500).json({ error: 'Failed to update moderator status' });
    }
});

// Unban user (moderators only)
app.post('/api/users/:userId/unban', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    
    try {
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
        
        res.json({ success: true });
    } catch (error) {
        console.error('Unban user error:', error);
        res.status(500).json({ error: 'Failed to unban user' });
    }
});

// Get report count
app.get('/api/reports/count', authenticateUser, requireModerator, async (req, res) => {
    try {
        const result = await pgPool.query(
            'SELECT COUNT(*) FROM reports WHERE status = $1',
            ['pending']
        );
        
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Get report count error:', error);
        res.status(500).json({ error: 'Failed to get report count' });
    }
});

// Get all reports with pagination (moderators only)
app.get('/api/reports/all', authenticateUser, requireModerator, async (req, res) => {
    try {
        // Get all pending reports
        const reportsResult = await pgPool.query(`
            SELECT r.*, 
                   r.comment_content as content,
                   u1.name as reporter_name
            FROM reports r
            JOIN users u1 ON r.reporter_id = u1.id
            WHERE r.status = 'pending'
            ORDER BY r.created_at DESC
        `);
        
        // Get unique pages with report counts
        const pagesResult = await pgPool.query(`
            SELECT DISTINCT page_id, COUNT(*) as report_count 
            FROM reports 
            WHERE status = 'pending'
            GROUP BY page_id 
            ORDER BY report_count DESC
        `);
        
        res.json({
            reports: reportsResult.rows,
            pages: pagesResult.rows
        });
    } catch (error) {
        console.error('Get all reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
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