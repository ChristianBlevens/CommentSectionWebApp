const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const redis = require('redis');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

// Create Express app instance
const app = express();
const port = process.env.PORT || 3000;

// Enable proxy trust for accurate IP addresses
app.set('trust proxy', true);

// App configuration settings
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
        // duration removed - sessions no longer expire
    }
};

// Check Discord OAuth credentials are set
if (!config.discord.clientId || !config.discord.clientSecret || 
    config.discord.clientId === 'YOUR_DISCORD_CLIENT_ID') {
    console.error('ERROR: Discord OAuth credentials not configured!');
    process.exit(1);
}

// Apply security headers and settings
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

// PostgreSQL connection pool setup
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

// Redis client for session storage
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Redis reconnection failed');
            return Math.min(retries * 100, 3000);
        }
    }
});

// Initialize Redis connection
redisClient.connect().catch(err => {
    console.error('Redis connection failed:', err);
});

// Parse mentions from comment content
function parseMentions(content) {
    const mentions = [];
    const mentionRegex = /@([a-zA-Z0-9_]+)(?=\s|$|[^a-zA-Z0-9_])/g;
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push({
            username: match[1]
        });
    }
    
    return mentions;
}

// Check if user is moderator to bypass rate limits
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

// Apply moderator check globally
app.use(checkModeratorForRateLimit);

// Create rate limiting middleware
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

// Apply rate limiting to all routes
app.use(generalLimiter);

// Utility functions
const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

// Generate a public ID from Discord ID using hash
function generatePublicId(discordId) {
    if (!discordId) return null;
    return crypto.createHash('sha256')
        .update(discordId + process.env.SESSION_SECRET)
        .digest('hex')
        .substring(0, 16); // 16 char public ID
}

// Cache for performance
const publicIdCache = new Map();
const reverseIdCache = new Map(); // Maps public IDs back to Discord IDs

function getPublicId(discordId) {
    if (!discordId) return null;
    
    if (publicIdCache.has(discordId)) {
        return publicIdCache.get(discordId);
    }
    
    const publicId = generatePublicId(discordId);
    publicIdCache.set(discordId, publicId);
    reverseIdCache.set(publicId, discordId); // Also store reverse mapping
    return publicId;
}

// Get Discord ID from public ID
function getDiscordId(publicId) {
    if (!publicId) return null;
    
    // Check if it's already a Discord ID
    if (publicId.startsWith('discord_') || publicId.length > 16) {
        return publicId;
    }
    
    // Look up in reverse cache
    if (reverseIdCache.has(publicId)) {
        return reverseIdCache.get(publicId);
    }
    
    // If not in cache, we need to find it in the database
    // This will be populated when users are loaded
    console.warn(`Public ID ${publicId} not found in reverse cache`);
    return null;
}

// Populate reverse cache from database
async function populateIdCaches() {
    try {
        const result = await pgPool.query('SELECT DISTINCT id FROM users');
        console.log(`Populating ID caches for ${result.rows.length} users...`);
        
        for (const row of result.rows) {
            const publicId = getPublicId(row.id); // This will populate both caches
        }
        
        console.log(`ID caches populated. Public cache: ${publicIdCache.size}, Reverse cache: ${reverseIdCache.size}`);
    } catch (error) {
        console.error('Error populating ID caches:', error);
    }
}

// Sanitize user object to hide Discord ID
function sanitizeUser(user) {
    if (!user) return null;
    const sanitized = {
        id: getPublicId(user.id),
        name: user.name,
        username: user.name || user.username, // Support both field names
        picture: user.picture,
        avatar: user.picture || user.avatar, // Support both field names
        email: user.email,
        is_moderator: user.is_moderator,
        is_super_moderator: user.is_super_moderator,
        is_banned: user.is_banned,
        allow_discord_dms: user.allow_discord_dms !== undefined ? user.allow_discord_dms : true // Default to true if not set
    };
    
    // Include ban information if user is banned
    if (user.is_banned || user.ban_info) {
        sanitized.ban_expires_at = user.ban_expires_at || user.ban_info?.ban_expires_at;
        sanitized.ban_reason = user.ban_reason || user.ban_info?.ban_reason;
        sanitized.banned_at = user.banned_at || user.ban_info?.banned_at;
        sanitized.ban_expired = user.ban_expired;
    }
    
    return sanitized;
}

// Sanitize comment to hide Discord ID
function sanitizeComment(comment, currentUserId = null) {
    return {
        ...comment,
        userId: getPublicId(comment.user_id),
        user_id: undefined, // Remove original
        isOwner: currentUserId && comment.user_id === currentUserId
    };
}

const safeRedisOp = async (operation) => {
    try {
        if (!redisClient.isReady) return null;
        return await operation();
    } catch (error) {
        console.error('Redis operation failed:', error);
        return null;
    }
};

// Clean orphaned sessions from user sets
const cleanUserSessions = async (userId) => {
    const sessions = await redisClient.sMembers(`user_sessions:${userId}`);
    for (const token of sessions) {
        const exists = await redisClient.exists(`session:${token}`);
        if (!exists) {
            await redisClient.sRem(`user_sessions:${userId}`, token);
        }
    }
};

// Convert milliseconds to human-readable time
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

// Convert duration string to milliseconds
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

// Auth middleware that doesn't require login
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }
    
    const token = authHeader.substring(7);
    try {
        // Lookup user ID from session
        const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
        if (!userId) {
            req.user = null;
            return next();
        }
        
        // Fetch user details
        const userResult = await pgPool.query(
            'SELECT id, name, is_moderator, is_super_moderator FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length > 0) {
            req.user = userResult.rows[0];
        } else {
            req.user = null;
        }
    } catch (error) {
        console.error('Optional auth error:', error);
        req.user = null;
    }
    
    next();
};

// Require user to be logged in
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    try {
        // Lookup user ID from session
        const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
        if (!userId) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        // Fetch user details with ban details and super moderator status
        const userResult = await pgPool.query(
            'SELECT id, name, is_moderator, is_super_moderator, is_banned, ban_expires_at, ban_reason, banned_at, allow_discord_dms FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        // Check if user is banned and handle expired bans
        if (user.is_banned) {
            if (user.ban_expires_at && new Date(user.ban_expires_at) <= new Date()) {
                // Auto-unban expired temporary bans
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
                user.ban_expired = true; // Mark ban as expired for UI
            } else {
                // Get ban time remaining
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

// Require user to be a moderator
const requireModerator = (req, res, next) => {
    if (!req.user?.is_moderator) {
        return res.status(403).json({ error: 'Moderator access required' });
    }
    next();
};

// Require user to be a super moderator
const requireSuperModerator = (req, res, next) => {
    if (!req.user?.is_super_moderator) {
        return res.status(403).json({ error: 'Super moderator access required' });
    }
    next();
};

// Create database tables and indexes
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
        
        // Add ban tracking columns to users table
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
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='allow_discord_dms') THEN
                    ALTER TABLE users ADD COLUMN allow_discord_dms BOOLEAN DEFAULT TRUE;
                    -- Set existing users to have DMs enabled by default
                    UPDATE users SET allow_discord_dms = TRUE WHERE allow_discord_dms IS NULL;
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
        
        // Create comments table
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
        
        // Create votes table
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
        
        // Create reports table
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
        
        // Update reports table schema
        // Check for comment_user_id column
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'reports' 
            AND column_name = 'comment_user_id'
        `);
        
        if (columnCheck.rows.length === 0) {
            console.log('Migrating reports table schema...');
            
            // Add comment tracking columns
            await client.query(`
                ALTER TABLE reports 
                ADD COLUMN IF NOT EXISTS comment_content TEXT,
                ADD COLUMN IF NOT EXISTS comment_user_id VARCHAR(255),
                ADD COLUMN IF NOT EXISTS comment_user_name VARCHAR(255)
            `);
            
            // Copy comment data to reports
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
            
            // Make comment_content required
            await client.query(`
                ALTER TABLE reports 
                ALTER COLUMN comment_content SET NOT NULL
            `);
            
            console.log('Reports table migration completed');
        }
        
        // Check for CASCADE constraint
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
        
        // Remove CASCADE to preserve reports
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
        
        // Create report rate limiting table
        await client.query(`
            CREATE TABLE IF NOT EXISTS report_rate_limits (
                user_id VARCHAR(255) PRIMARY KEY,
                report_count INTEGER DEFAULT 0,
                window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Create warnings table
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
        
        // Create moderation_logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS moderation_logs (
                id SERIAL PRIMARY KEY,
                action_type VARCHAR(50) NOT NULL,
                moderator_id VARCHAR(255) NOT NULL,
                moderator_name VARCHAR(255) NOT NULL,
                target_user_id VARCHAR(255),
                target_user_name VARCHAR(255),
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add warning tracking columns
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warnings' AND column_name='reason') THEN
                    ALTER TABLE warnings ADD COLUMN reason VARCHAR(500) NOT NULL DEFAULT 'No reason provided';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warnings' AND column_name='message') THEN
                    ALTER TABLE warnings ADD COLUMN message TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warnings' AND column_name='acknowledged') THEN
                    ALTER TABLE warnings ADD COLUMN acknowledged BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warnings' AND column_name='acknowledged_at') THEN
                    ALTER TABLE warnings ADD COLUMN acknowledged_at TIMESTAMP;
                END IF;
            END $$;
        `);
        
        // Add moderation_logs columns if table exists but columns are missing
        await client.query(`
            DO $$ 
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='moderation_logs') THEN
                    -- Handle the case where both 'action' and 'action_type' columns might exist
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='action') THEN
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='action_type') THEN
                            -- Both columns exist, drop the old 'action' column
                            ALTER TABLE moderation_logs DROP COLUMN action;
                        ELSE
                            -- Only 'action' exists, rename it to 'action_type'
                            ALTER TABLE moderation_logs RENAME COLUMN action TO action_type;
                        END IF;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='action_type') THEN
                        ALTER TABLE moderation_logs ADD COLUMN action_type VARCHAR(50) NOT NULL DEFAULT 'unknown';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='moderator_id') THEN
                        ALTER TABLE moderation_logs ADD COLUMN moderator_id VARCHAR(255) NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='moderator_name') THEN
                        ALTER TABLE moderation_logs ADD COLUMN moderator_name VARCHAR(255) NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='target_user_id') THEN
                        ALTER TABLE moderation_logs ADD COLUMN target_user_id VARCHAR(255);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='target_user_name') THEN
                        ALTER TABLE moderation_logs ADD COLUMN target_user_name VARCHAR(255);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='details') THEN
                        ALTER TABLE moderation_logs ADD COLUMN details JSONB;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderation_logs' AND column_name='created_at') THEN
                        ALTER TABLE moderation_logs ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                    END IF;
                    -- Remove foreign key constraint if it exists
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.table_constraints 
                        WHERE constraint_name = 'moderation_logs_moderator_id_fkey' 
                        AND table_name = 'moderation_logs'
                    ) THEN
                        ALTER TABLE moderation_logs DROP CONSTRAINT moderation_logs_moderator_id_fkey;
                    END IF;
                END IF;
            END $$;
        `);
        
        // Create performance indexes
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
            CREATE INDEX IF NOT EXISTS idx_moderation_logs_moderator_id ON moderation_logs(moderator_id);
            CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_moderation_logs_action_type ON moderation_logs(action_type);
        `);
        
        // One-time update to set all NULL allow_discord_dms to TRUE
        await client.query(`
            UPDATE users 
            SET allow_discord_dms = TRUE 
            WHERE allow_discord_dms IS NULL
        `);
        
        // Create site_settings table for theme storage
        await client.query(`
            CREATE TABLE IF NOT EXISTS site_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme_data JSONB,
                custom_presets JSONB,
                theme_history JSONB,
                other_settings JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add indexes for JSONB queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_site_settings_theme_data ON site_settings USING gin(theme_data);
            CREATE INDEX IF NOT EXISTS idx_site_settings_custom_presets ON site_settings USING gin(custom_presets);
        `);
        
        // Insert default row if it doesn't exist
        await client.query(`
            INSERT INTO site_settings (id) VALUES (1) ON CONFLICT DO NOTHING
        `);
        
        // Create analytics cache table
        await client.query(`
            CREATE TABLE IF NOT EXISTS analytics_cache (
                id SERIAL PRIMARY KEY,
                period_type VARCHAR(10) NOT NULL,
                period_date DATE NOT NULL,
                data JSONB NOT NULL,
                generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(period_type, period_date)
            )
        `);
        
        // Create indexes for analytics cache
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_analytics_cache_lookup 
            ON analytics_cache(period_type, period_date)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_analytics_cache_date 
            ON analytics_cache(period_date)
        `);
        
        await client.query('COMMIT');
        console.log('Database schema initialized successfully');
        
        // Migrate existing data
        await runDataMigrations();
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database initialization error:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Update user statistics from existing data
const runDataMigrations = async () => {
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Count total comments per user
        await client.query(`
            UPDATE users u
            SET total_comments = COALESCE((
                SELECT COUNT(*) 
                FROM comments c 
                WHERE c.user_id = u.id
            ), 0)
            WHERE u.total_comments = 0
        `);
        
        // Count reports made by each user
        await client.query(`
            UPDATE users u
            SET total_reports_made = COALESCE((
                SELECT COUNT(*) 
                FROM reports r 
                WHERE r.reporter_id = u.id
            ), 0)
            WHERE u.total_reports_made = 0
        `);
        
        // Count reports received by each user
        await client.query(`
            UPDATE users u
            SET total_reports_received = COALESCE((
                SELECT COUNT(*) 
                FROM reports r 
                WHERE r.comment_user_id = u.id
            ), 0)
            WHERE u.total_reports_received = 0
        `);
        
        // Grant super moderator status to initial mods
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

// Setup database tables on start
initDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

// Log moderation actions
const logModerationAction = async (actionType, moderatorId, moderatorName, targetUserId = null, targetUserName = null, details = {}) => {
    try {
        const result = await pgPool.query(
            `INSERT INTO moderation_logs (action_type, moderator_id, moderator_name, target_user_id, target_user_name, details)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [actionType, moderatorId, moderatorName, targetUserId, targetUserName, JSON.stringify(details)]
        );
        console.log(`Moderation action logged: ${actionType} by ${moderatorName} (ID: ${result.rows[0].id})`);
    } catch (error) {
        console.error('Failed to log moderation action:', {
            error: error.message,
            actionType,
            moderatorId,
            moderatorName,
            details: error.detail || error.hint
        });
        // Don't throw - logging failures shouldn't break the main action
    }
};

// API endpoints

// Get Discord OAuth config
app.get('/api/config', (req, res) => {
    res.json({
        discordClientId: config.discord.clientId,
        discordRedirectUri: config.discord.redirectUri,
        discordServerUrl: process.env.DISCORD_SERVER_URL || ''
    });
});

// Check API and database health
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

// Handle Discord OAuth redirect
app.post('/api/discord/callback', authLimiter, async (req, res) => {
    const { code, state } = req.body;
    
    if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    try {
        // Get Discord access token
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
        
        // Fetch Discord user profile
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
        
        // Check if user is initial moderator
        const initialModerators = process.env.INITIAL_MODERATORS?.split(',').map(id => id.trim()) || [];
        const isInitialModerator = initialModerators.includes(user.id);
        
        // Create or update user record
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
        
        // Check user permissions and ban status
        const userResult = await pgPool.query(
            'SELECT is_moderator, is_super_moderator, is_banned, ban_expires_at, ban_reason, banned_at, allow_discord_dms FROM users WHERE id = $1',
            [user.id]
        );
        
        if (userResult.rows.length > 0) {
            const userData = userResult.rows[0];
            user.name = user.username; // Add name property for consistency
            user.picture = user.avatar; // Add picture property for consistency
            user.is_moderator = userData.is_moderator;
            user.is_super_moderator = userData.is_super_moderator;
            user.is_banned = userData.is_banned;
            user.allow_discord_dms = userData.allow_discord_dms;
            
            // Handle expired temporary bans
            if (userData.is_banned && userData.ban_expires_at && new Date(userData.ban_expires_at) <= new Date()) {
                // Auto-unban expired temporary bans
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
                // User remains banned
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
        
        // Clean any orphaned sessions before creating new one
        await safeRedisOp(() => cleanUserSessions(user.id));
        
        // Create session token
        const sessionToken = generateSessionToken();
        await safeRedisOp(async () => {
            // Store the session
            await redisClient.set(`session:${sessionToken}`, user.id);
            
            // Add to user's session set
            await redisClient.sAdd(`user_sessions:${user.id}`, sessionToken);
        });
        
        res.json({ 
            user: {
                ...sanitizeUser(user),
                _internalId: user.id // Add real ID only for current user
            }, 
            sessionToken 
        });
    } catch (error) {
        console.error('Discord OAuth error:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            res.status(401).json({ error: 'Invalid authorization code' });
        } else {
            res.status(500).json({ error: 'Discord authentication failed' });
        }
    }
});

// Get current ban status
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

// Verify session token validity
app.get('/api/session/validate', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    try {
        // Lookup user ID from session
        const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
        if (!userId) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        // Fetch user details including ban information
        const userResult = await pgPool.query(
            'SELECT id, email, name, picture, is_moderator, is_super_moderator, is_banned, ban_expires_at, ban_reason, banned_at, allow_discord_dms FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        // Check if ban has expired
        if (user.is_banned && user.ban_expires_at && new Date(user.ban_expires_at) <= new Date()) {
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
            
            // Update the user object to reflect the unban
            user.is_banned = false;
            user.ban_expired = true;
            
            // Keep the old ban info for the notification
            user.previous_ban_reason = user.ban_reason;
            user.ban_expires_at = null;
            user.ban_reason = null;
            user.banned_at = null;
        }
        
        res.json({
            id: getPublicId(user.id),
            username: user.name,
            email: user.email,
            avatar: user.picture,
            is_moderator: user.is_moderator,
            is_super_moderator: user.is_super_moderator,
            is_banned: user.is_banned,
            ban_expires_at: user.ban_expires_at,
            ban_reason: user.ban_reason,
            banned_at: user.banned_at,
            ban_expired: user.ban_expired,
            previous_ban_reason: user.previous_ban_reason,
            allow_discord_dms: user.allow_discord_dms,
            _internalId: user.id // Add real ID only for current user
        });
    } catch (error) {
        console.error('Session validation error:', error);
        res.status(500).json({ error: 'Session validation failed' });
    }
});

// Destroy user session
app.post('/api/logout', authenticateUser, async (req, res) => {
    const token = req.headers.authorization.substring(7);
    const userId = req.user.id;
    
    await safeRedisOp(async () => {
        // Remove the session
        await redisClient.del(`session:${token}`);
        
        // Remove from user's session set
        await redisClient.sRem(`user_sessions:${userId}`, token);
    });
    
    res.json({ success: true });
});

// List user's active sessions
app.get('/api/sessions', authenticateUser, async (req, res) => {
    const sessions = await safeRedisOp(() => 
        redisClient.sMembers(`user_sessions:${req.user.id}`)
    );
    
    // Return session count (tokens themselves are opaque)
    res.json({ 
        sessionCount: sessions ? sessions.length : 0,
        currentSession: req.headers.authorization.substring(7)
    });
});

// Sign out from all devices
app.post('/api/logout/all', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    
    await safeRedisOp(async () => {
        // Get all user sessions
        const sessions = await redisClient.sMembers(`user_sessions:${userId}`);
        
        // Delete all session keys
        if (sessions.length > 0) {
            await redisClient.del(...sessions.map(token => `session:${token}`));
        }
        
        // Clear the user's session set
        await redisClient.del(`user_sessions:${userId}`);
    });
    
    res.json({ success: true });
});

// Fetch user profile
app.get('/api/users/:userId', authenticateUser, async (req, res) => {
    const { userId } = req.params;
    
    // Check if it's a public ID or Discord ID
    const requestedPublicId = userId.startsWith('discord_') ? getPublicId(userId) : userId;
    const currentUserPublicId = getPublicId(req.user.id);
    
    // Restrict to own profile only
    if (requestedPublicId !== currentUserPublicId) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        const result = await pgPool.query(
            'SELECT id, email, name, picture, is_moderator, is_super_moderator, is_banned FROM users WHERE id = $1',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
        res.json({
            id: getPublicId(user.id),
            username: user.name,
            email: user.email,
            avatar: user.picture,
            is_moderator: user.is_moderator,
            is_super_moderator: user.is_super_moderator,
            is_banned: user.is_banned,
            _internalId: user.id // Add real ID only for current user
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// Get comments by page or user
app.get('/api/comments', optionalAuth, async (req, res) => {
    const { pageId, userId, limit, offset = 0, orderBy = 'created_at', order = 'ASC' } = req.query;
    
    // Require pageId or userId
    if (!pageId && !userId) {
        return res.status(400).json({ error: 'Either pageId or userId parameter is required' });
    }
    
    try {
        // Construct query conditions
        const whereConditions = [];
        const queryParams = [];
        
        if (pageId) {
            whereConditions.push(`c.page_id = $${queryParams.length + 1}`);
            queryParams.push(pageId);
        }
        
        if (userId) {
            // Convert public ID to Discord ID
            const discordId = getDiscordId(userId);
            if (discordId) {
                whereConditions.push(`c.user_id = $${queryParams.length + 1}`);
                queryParams.push(discordId);
            } else {
                // If we can't resolve the ID, return empty results
                return res.json([]);
            }
        }
        
        // Include user's votes if logged in
        queryParams.push(req.user?.id || null);
        const userVoteParam = `$${queryParams.length}`;
        
        // Sanitize sort parameters
        const validOrderBy = ['created_at', 'likes', 'dislikes'];
        const validOrder = ['ASC', 'DESC'];
        const safeOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'created_at';
        const safeOrder = validOrder.includes(order.toUpperCase()) ? order.toUpperCase() : 'ASC';
        
        // Construct SQL query
        let query = `
            SELECT 
                c.id, c.page_id, c.user_id, c.parent_id, c.content, 
                c.likes, c.dislikes, c.created_at, c.updated_at,
                u.name as user_name, u.picture as user_picture,
                v.vote_type as user_vote
            FROM comments c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN votes v ON c.id = v.comment_id AND v.user_id = ${userVoteParam}
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY c.${safeOrderBy} ${safeOrder}
        `;
        
        // Apply pagination
        if (limit) {
            const limitNum = parseInt(limit);
            if (!isNaN(limitNum) && limitNum > 0 && limitNum <= 100) {
                query += ` LIMIT ${limitNum}`;
                
                const offsetNum = parseInt(offset);
                if (!isNaN(offsetNum) && offsetNum >= 0) {
                    query += ` OFFSET ${offsetNum}`;
                }
            }
        }
        
        const result = await pgPool.query(query, queryParams);
        
        // Format response data
        const comments = result.rows.map(row => ({
            id: row.id,
            pageId: row.page_id,
            userId: getPublicId(row.user_id),
            parentId: row.parent_id,
            content: row.content,
            likes: row.likes,
            dislikes: row.dislikes,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userName: row.user_name,
            userPicture: row.user_picture,
            userVote: row.user_vote,
            isOwner: req.user && row.user_id === req.user.id
        }));
        
        // Disable browser caching
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// Get single comment by ID
app.get('/api/comments/:commentId', optionalAuth, async (req, res) => {
    const { commentId } = req.params;
    const userId = req.user?.id;
    
    try {
        // Get the comment with user info and nested replies
        const result = await pgPool.query(`
            WITH RECURSIVE comment_tree AS (
                -- Get the target comment
                SELECT 
                    c.id,
                    c.page_id,
                    c.user_id,
                    c.content,
                    c.parent_id,
                    c.created_at,
                    c.updated_at,
                    u.name as user_name,
                    u.picture as user_picture,
                    0 as depth,
                    ARRAY[c.created_at] as path
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.id = $1
                
                UNION ALL
                
                -- Get all replies recursively
                SELECT 
                    c.id,
                    c.page_id,
                    c.user_id,
                    c.content,
                    c.parent_id,
                    c.created_at,
                    c.updated_at,
                    u.name as user_name,
                    u.picture as user_picture,
                    ct.depth + 1,
                    ct.path || c.created_at
                FROM comments c
                JOIN users u ON c.user_id = u.id
                JOIN comment_tree ct ON c.parent_id = ct.id
                WHERE ct.depth < 50  -- Prevent infinite recursion
            )
            SELECT 
                ct.*,
                v.vote_type as user_vote,
                COALESCE(vote_counts.upvotes, 0) as upvotes,
                COALESCE(vote_counts.downvotes, 0) as downvotes
            FROM comment_tree ct
            LEFT JOIN votes v ON ct.id = v.comment_id AND v.user_id = $2
            LEFT JOIN (
                SELECT 
                    comment_id,
                    SUM(CASE WHEN vote_type = 'like' THEN 1 ELSE 0 END) as upvotes,
                    SUM(CASE WHEN vote_type = 'dislike' THEN 1 ELSE 0 END) as downvotes
                FROM votes
                GROUP BY comment_id
            ) vote_counts ON ct.id = vote_counts.comment_id
            ORDER BY ct.path
        `, [commentId, userId || null]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        
        // Build the comment tree structure
        const commentMap = new Map();
        let rootComment = null;
        
        result.rows.forEach(row => {
            const comment = {
                id: row.id,
                pageId: row.page_id,
                userId: getPublicId(row.user_id),
                content: row.content,
                parentId: row.parent_id,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                userName: row.user_name,
                userPicture: row.user_picture,
                likes: row.upvotes,
                dislikes: row.downvotes,
                userVote: row.user_vote,
                children: [],
                isOwner: userId && row.user_id === userId
            };
            
            commentMap.set(comment.id, comment);
            
            if (comment.id === parseInt(commentId)) {
                rootComment = comment;
            }
        });
        
        // Build parent-child relationships
        result.rows.forEach(row => {
            if (row.parent_id && row.id !== parseInt(commentId)) {
                const parent = commentMap.get(row.parent_id);
                const child = commentMap.get(row.id);
                if (parent && child) {
                    parent.children.push(child);
                }
            }
        });
        
        res.json(rootComment);
    } catch (error) {
        console.error('Error fetching comment:', error);
        res.status(500).json({ error: 'Failed to fetch comment' });
    }
});

// Create comment
app.post('/api/comments', authenticateUser, async (req, res) => {
    console.log('Create comment - req.body:', req.body);
    console.log('Parent ID type:', typeof req.body.parentId, 'value:', req.body.parentId);
    const { pageId, content, parentId } = req.body;
    const userId = req.user.id;
    
    if (!pageId || !content) {
        console.log('Missing fields - pageId:', pageId, 'content:', content);
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
        
        // Process mentions
        const mentions = parseMentions(content);
        if (mentions.length > 0) {
            const redisPublisher = redis.createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379'
            });
            await redisPublisher.connect();
            
            for (const mention of mentions.slice(0, 5)) {
                // Look up user by username instead of ID
                const userResult = await client.query(
                    'SELECT id, name FROM users WHERE LOWER(name) = LOWER($1) AND is_banned = false',
                    [mention.username]
                );
                
                if (userResult.rows.length > 0) {
                    const mentionedUser = userResult.rows[0];
                    await redisPublisher.publish('comment:mentions', JSON.stringify({
                        mentionedUserId: mentionedUser.id,
                        commentId: comment.id,
                        pageId,
                        authorName: req.user.name,
                        preview: content
                    }));
                }
            }
            
            await redisPublisher.quit();
        }
        
        // Clear cache
        await safeRedisOp(() => redisClient.del(`comments:${pageId}`));
        
        // Return formatted comment
        res.json({
            id: comment.id,
            pageId: comment.page_id,
            userId: getPublicId(comment.user_id),
            parentId: comment.parent_id,
            content: comment.content,
            likes: 0,
            dislikes: 0,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            userName: user.name,
            userPicture: user.picture,
            isOwner: true // Always true for the comment creator
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
                
                if (voteType === 'like') {
                    await client.query(
                        'UPDATE comments SET likes = likes - 1 WHERE id = $1',
                        [commentIdNum]
                    );
                } else {
                    await client.query(
                        'UPDATE comments SET dislikes = dislikes - 1 WHERE id = $1',
                        [commentIdNum]
                    );
                }
                
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
            
            if (voteType === 'like') {
                await client.query(
                    'UPDATE comments SET likes = likes + 1 WHERE id = $1',
                    [commentIdNum]
                );
            } else {
                await client.query(
                    'UPDATE comments SET dislikes = dislikes + 1 WHERE id = $1',
                    [commentIdNum]
                );
            }
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
            
            // Remove deleted parent comments
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
        
        // Log moderation action if deleted by moderator (not own comment)
        if (isUserModerator && comment.user_id !== userId) {
            // Get comment author name
            const authorResult = await pgPool.query(
                'SELECT name FROM users WHERE id = $1',
                [comment.user_id]
            );
            const authorName = authorResult.rows.length > 0 ? authorResult.rows[0].name : 'Unknown User';
            
            await logModerationAction(
                'delete_comment',
                req.user.id,
                req.user.name,
                comment.user_id,
                authorName,
                {
                    comment_id: commentIdNum,
                    page_id: comment.page_id,
                    content_preview: comment.content.substring(0, 100) + (comment.content.length > 100 ? '...' : '')
                }
            );
        }
        
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

// Flag comment for moderation
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
        
        // Apply report rate limit
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
        
        // Fetch comment and author details
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
        
        // Save report with comment snapshot
        console.log(`Creating report for comment ${commentIdNum} on page "${comment.page_id}" (length: ${comment.page_id.length})`);
        
        const reportResult = await client.query(
            `INSERT INTO reports (comment_id, reporter_id, page_id, reason, comment_content, comment_user_id, comment_user_name) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             ON CONFLICT (comment_id, reporter_id) DO NOTHING
             RETURNING id`,
            [commentIdNum, userId, comment.page_id, reason || 'No reason provided', 
             comment.content, comment.user_id, comment.user_name]
        );
        
        // Update report counters if new report
        if (reportResult.rows.length > 0) {
            // Increment reporter's counter
            await client.query(
                'UPDATE users SET total_reports_made = total_reports_made + 1 WHERE id = $1',
                [userId]
            );
            
            // Increment reported user's counter
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

// List moderation reports
// Get reports with filters
app.get('/api/reports', authenticateUser, requireModerator, async (req, res) => {
    const { pageId, userId, includePages, status = 'pending' } = req.query;
    
    // Sanitize report status
    const validStatuses = ['pending', 'resolved', 'dismissed'];
    const sanitizedStatus = validStatuses.includes(status) ? status : 'pending';
    
    console.log('GET /api/reports called with params:', { pageId, userId, includePages, status: sanitizedStatus });
    
    try {
        // Build the WHERE clause dynamically
        const whereConditions = ['r.status = $1'];
        const queryParams = [sanitizedStatus];
        
        if (pageId && pageId !== 'all') {
            whereConditions.push(`r.page_id = $${queryParams.length + 1}`);
            queryParams.push(pageId);
        }
        
        if (userId) {
            // Convert public ID to Discord ID
            const discordId = getDiscordId(userId);
            if (discordId) {
                whereConditions.push(`r.comment_user_id = $${queryParams.length + 1}`);
                queryParams.push(discordId);
            }
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Query reports table
        const reportsQuery = `
            SELECT r.*, 
                   r.comment_content as content,
                   u1.name as reporter_name,
                   u2.name as comment_user_name,
                   u1.picture as reporter_picture,
                   u2.picture as comment_user_picture,
                   u2.is_moderator as comment_user_is_moderator,
                   u2.is_super_moderator as comment_user_is_super_moderator
            FROM reports r
            JOIN users u1 ON r.reporter_id = u1.id
            LEFT JOIN users u2 ON r.comment_user_id = u2.id
            WHERE ${whereClause}
            ORDER BY r.created_at DESC
        `;
        
        const reportsResult = await pgPool.query(reportsQuery, queryParams);
        
        console.log(`Found ${reportsResult.rows.length} reports`);
        
        // Prepare API response with sanitized IDs
        const sanitizedReports = reportsResult.rows.map(report => ({
            ...report,
            reporter_id: getPublicId(report.reporter_id),
            comment_user_id: getPublicId(report.comment_user_id)
        }));
        
        const response = {
            reports: sanitizedReports
        };
        
        // Add page statistics if needed
        if (includePages === 'true') {
            const pagesResult = await pgPool.query(`
                SELECT DISTINCT page_id, COUNT(*) as report_count 
                FROM reports 
                WHERE status = $1
                GROUP BY page_id 
                ORDER BY report_count DESC
            `, [status]);
            
            response.pages = pagesResult.rows;
            console.log(`Found ${pagesResult.rows.length} pages with reports`);
        }
        
        // Disable browser caching
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json(response);
    } catch (error) {
        console.error('Get reports error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to get reports', details: error.message });
    }
});

// Mark report as handled
app.put('/api/reports/:reportId/resolve', authenticateUser, requireModerator, async (req, res) => {
    const { reportId } = req.params;
    const { action } = req.body;
    const userId = req.user.id;
    
    if (!['resolved', 'dismissed'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    try {
        // Get report details for logging
        const reportResult = await pgPool.query(
            `SELECT r.*, u.name as reporter_name, u2.name as comment_user_name
             FROM reports r
             LEFT JOIN users u ON r.reporter_id = u.id
             LEFT JOIN users u2 ON r.comment_user_id = u2.id
             WHERE r.id = $1`,
            [reportId]
        );
        
        if (reportResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        const report = reportResult.rows[0];
        
        await pgPool.query(
            `UPDATE reports 
             SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2
             WHERE id = $3`,
            [action, userId, reportId]
        );
        
        // Log moderation action
        await logModerationAction(
            action === 'dismissed' ? 'dismiss_report' : 'resolve_report',
            req.user.id,
            req.user.name,
            report.comment_user_id,
            report.comment_user_name,
            {
                report_id: reportId,
                reporter_name: report.reporter_name,
                report_reason: report.reason,
                page_id: report.page_id,
                comment_preview: report.comment_content ? report.comment_content.substring(0, 100) + (report.comment_content.length > 100 ? '...' : '') : ''
            }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Resolve report error:', error);
        res.status(500).json({ error: 'Failed to resolve report' });
    }
});

// Block user from commenting
app.post('/api/users/:targetUserId/ban', authenticateUser, requireModerator, async (req, res) => {
    const { targetUserId } = req.params;
    const { duration, reason, deleteComments = true } = req.body;
    const userId = req.user.id;
    
    // Convert public ID to Discord ID
    const discordId = getDiscordId(targetUserId);
    if (!discordId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Convert duration to timestamp
    const banDurationMs = parseBanDuration(duration);
    const banExpiresAt = banDurationMs ? new Date(Date.now() + banDurationMs) : null;
    
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Verify user exists
        const userCheck = await client.query(
            'SELECT id, name FROM users WHERE id = $1',
            [discordId]
        );
        
        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Apply ban to user account
        await client.query(
            `UPDATE users 
             SET is_banned = TRUE,
                 ban_expires_at = $2,
                 ban_reason = $3,
                 banned_by = $4,
                 banned_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [discordId, banExpiresAt, reason || 'No reason provided', userId]
        );
        
        // Remove user's comments if requested
        if (deleteComments) {
            await client.query(
                'DELETE FROM comments WHERE user_id = $1',
                [discordId]
            );
        }
        
        // Auto-resolve reports for banned user
        await client.query(
            `UPDATE reports 
             SET status = 'resolved', 
                 resolved_at = CURRENT_TIMESTAMP, 
                 resolved_by = $1
             WHERE comment_user_id = $2 AND status = 'pending'`,
            [userId, discordId]
        );
        
        await client.query('COMMIT');
        
        // Invalidate all sessions for the banned user
        await safeRedisOp(async () => {
            // Get all sessions for the banned user
            const sessions = await redisClient.sMembers(`user_sessions:${discordId}`);
            
            // Delete all session keys
            if (sessions.length > 0) {
                await redisClient.del(...sessions.map(token => `session:${token}`));
            }
            
            // Clear the user's session set
            await redisClient.del(`user_sessions:${discordId}`);
            
            console.log(`Invalidated ${sessions.length} sessions for banned user ${discordId}`);
        });
        
        // Format ban details
        const banInfo = {
            success: true,
            banned_user: userCheck.rows[0].name,
            ban_type: banExpiresAt ? 'temporary' : 'permanent',
            ban_expires_at: banExpiresAt,
            ban_duration_text: banExpiresAt ? formatBanDuration(banDurationMs) : 'Permanent ban',
            reason: reason || 'No reason provided'
        };
        
        // Log moderation action
        await logModerationAction(
            'ban_user',
            req.user.id,
            req.user.name,
            discordId,
            userCheck.rows[0].name,
            {
                duration: duration || 'permanent',
                ban_expires_at: banExpiresAt,
                reason: reason || 'No reason provided',
                comments_deleted: deleteComments
            }
        );
        
        res.json(banInfo);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ban user error:', error);
        res.status(500).json({ error: 'Failed to ban user' });
    } finally {
        client.release();
    }
});

// List all moderators
app.get('/api/moderators', authenticateUser, requireModerator, async (req, res) => {
    try {
        const moderators = await pgPool.query(
            'SELECT id, name, picture, email FROM users WHERE is_moderator = TRUE ORDER BY name'
        );
        const sanitizedModerators = moderators.rows.map(mod => ({
            ...sanitizeUser(mod),
            email: mod.email // Keep email for moderator view
        }));
        res.json(sanitizedModerators);
    } catch (error) {
        console.error('Get moderators error:', error);
        res.status(500).json({ error: 'Failed to get moderators' });
    }
});


// Clear all page comments
app.delete('/api/comments/page/:pageId/all', authenticateUser, requireModerator, async (req, res) => {
    const { pageId } = req.params;
    
    if (!pageId || pageId.length > 255) {
        return res.status(400).json({ error: 'Invalid page ID' });
    }
    
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Get comment count
        const countResult = await client.query(
            'SELECT COUNT(*) as count FROM comments WHERE page_id = $1',
            [pageId]
        );
        
        const deletedCount = parseInt(countResult.rows[0].count);
        
        if (deletedCount === 0) {
            await client.query('COMMIT');
            return res.json({ success: true, deletedCount: 0, message: 'No comments to delete' });
        }
        
        // Delete comments but keep reports
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

// List pages with comment counts
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

// Get recent comments grouped by page with proper tree structure
app.get('/api/pages/recent-comments', authenticateUser, requireModerator, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 25, 100);
        
        // Get the most recent comments with user info
        const recentComments = await pgPool.query(`
            SELECT 
                c.id,
                c.page_id,
                c.user_id,
                c.parent_id,
                c.content,
                c.likes,
                c.dislikes,
                c.created_at,
                c.updated_at,
                u.name as user_name,
                u.picture as user_picture,
                v.vote_type as user_vote
            FROM comments c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN votes v ON c.id = v.comment_id AND v.user_id = $2
            ORDER BY c.created_at DESC
            LIMIT $1
        `, [limit, req.user?.id || null]);
        
        res.json(recentComments.rows);
    } catch (error) {
        console.error('Error fetching recent comments:', error);
        res.status(500).json({ error: 'Failed to fetch recent comments' });
    }
});


// Get users with filters
app.get('/api/users', authenticateUser, requireModerator, async (req, res) => {
    const { 
        filter,           // 'all', 'moderators', 'banned', 'warned', 'reported'
        userId,           // Get specific user
        includeDetails,   // Include activity details
        limit,           
        offset = 0,
        orderBy = 'created_at',
        order = 'DESC'
    } = req.query;
    
    try {
        // Construct query conditions
        const whereConditions = [];
        const queryParams = [];
        
        if (userId) {
            // Convert public ID to Discord ID if needed
            const discordId = getDiscordId(userId);
            if (discordId) {
                whereConditions.push(`u.id = $${queryParams.length + 1}`);
                queryParams.push(discordId);
            } else {
                console.error(`Failed to resolve user ID: ${userId}`);
                // Return empty result if we can't resolve the ID
                return res.json([]);
            }
        }
        
        // Apply user filters
        switch (filter) {
            case 'moderators':
                whereConditions.push('u.is_moderator = true');
                break;
            case 'banned':
                whereConditions.push('u.is_banned = true');
                break;
            case 'warned':
                whereConditions.push('u.warning_count > 0');
                break;
            case 'reported':
                whereConditions.push('u.total_reports_received > 0');
                break;
            // 'all' or undefined - no additional filter
        }
        
        // Sanitize sort parameters
        const validOrderBy = ['created_at', 'name', 'total_comments', 'total_reports_received', 'warning_count', 'trust_score'];
        const validOrder = ['ASC', 'DESC'];
        const safeOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'created_at';
        const safeOrder = validOrder.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
        
        // Build base query
        let query = `
            SELECT 
                u.id, u.email, u.name, u.picture, u.is_moderator, u.is_super_moderator,
                u.is_banned, u.ban_expires_at, u.ban_reason, u.warning_count,
                u.total_comments, u.total_reports_made, u.total_reports_received,
                u.trust_score, u.created_at
        `;
        
        // Include user activity data
        if (includeDetails === 'true' && userId) {
            query = `
                SELECT 
                    u.id, u.email, u.name, u.picture, u.is_moderator, u.is_super_moderator,
                    u.is_banned, u.ban_expires_at, u.ban_reason, u.banned_by, u.banned_at,
                    u.warning_count, u.last_warning_at, u.total_comments, 
                    u.total_reports_made, u.total_reports_received,
                    u.trust_score, u.created_at,
                    
                    -- Last 5 comments
                    COALESCE(
                        json_agg(
                            DISTINCT jsonb_build_object(
                                'id', c.id,
                                'page_id', c.page_id,
                                'content', c.content,
                                'created_at', c.created_at
                            )
                        ) FILTER (WHERE c.id IS NOT NULL), '[]'
                    ) as comments,
                    
                    -- User warnings
                    COALESCE(
                        json_agg(
                            DISTINCT jsonb_build_object(
                                'id', w.id,
                                'reason', w.reason,
                                'message', w.message,
                                'created_at', w.created_at,
                                'acknowledged', w.acknowledged,
                                'moderator_name', m.name
                            )
                        ) FILTER (WHERE w.id IS NOT NULL), '[]'
                    ) as warnings,
                    
                    -- Reports against user
                    COALESCE(
                        json_agg(
                            DISTINCT jsonb_build_object(
                                'id', r.id,
                                'reason', r.reason,
                                'comment_content', r.comment_content,
                                'created_at', r.created_at,
                                'status', r.status,
                                'resolved_at', r.resolved_at,
                                'reporter_name', rep.name
                            )
                        ) FILTER (WHERE r.id IS NOT NULL), '[]'
                    ) as reports_received,
                    
                    -- Current ban info (if any)
                    CASE 
                        WHEN u.banned_at IS NOT NULL THEN 
                            jsonb_build_object(
                                'banned_at', u.banned_at,
                                'ban_expires_at', u.ban_expires_at,
                                'ban_reason', u.ban_reason,
                                'banned_by_name', banner.name,
                                'is_active', u.is_banned
                            )
                        ELSE NULL
                    END as current_ban,
                    
                    -- Ban history from moderation logs
                    COALESCE(
                        (
                            SELECT json_agg(ban_entry ORDER BY ban_entry->>'banned_at' DESC)
                            FROM (
                                SELECT jsonb_build_object(
                                    'action_type', ml.action_type,
                                    'banned_at', ml.created_at,
                                    'banned_by_name', ml.moderator_name,
                                    'moderator_name', ml.moderator_name,
                                    'ban_duration', COALESCE(ml.details->>'duration', 'unknown'),
                                    'ban_reason', COALESCE(ml.details->>'reason', ''),
                                    'is_active', CASE 
                                        WHEN ml.action_type = 'ban_user' 
                                        AND ml.created_at = (
                                            SELECT MAX(created_at) 
                                            FROM moderation_logs 
                                            WHERE target_user_id = u.id 
                                            AND action_type IN ('ban_user', 'unban_user')
                                        )
                                        AND u.is_banned = true
                                        THEN true 
                                        ELSE false 
                                    END
                                ) as ban_entry
                                FROM moderation_logs ml
                                WHERE ml.target_user_id = u.id 
                                AND ml.action_type = 'ban_user'
                                ORDER BY ml.created_at DESC
                                LIMIT 5
                            ) AS ban_data
                        ), '[]'::json
                    ) as ban_history
            `;
        }
        
        query += `
            FROM users u
            ${includeDetails === 'true' && userId ? `
                LEFT JOIN LATERAL (
                    SELECT * FROM comments 
                    WHERE user_id = u.id 
                    ORDER BY created_at DESC 
                    LIMIT 5
                ) c ON true
                LEFT JOIN warnings w ON w.user_id = u.id
                LEFT JOIN users m ON w.moderator_id = m.id
                LEFT JOIN LATERAL (
                    SELECT * FROM reports 
                    WHERE comment_user_id = u.id 
                    ORDER BY created_at DESC 
                    LIMIT 5
                ) r ON true
                LEFT JOIN users rep ON r.reporter_id = rep.id
                LEFT JOIN users banner ON u.banned_by = banner.id
            ` : ''}
            ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
            ${includeDetails === 'true' && userId ? 'GROUP BY u.id, banner.id, banner.name' : ''}
            ORDER BY u.${safeOrderBy} ${safeOrder}
        `;
        
        // Apply pagination
        if (limit && !userId) { // Don't limit when getting specific user details
            const limitNum = parseInt(limit);
            if (!isNaN(limitNum) && limitNum > 0 && limitNum <= 100) {
                query += ` LIMIT ${limitNum}`;
                
                const offsetNum = parseInt(offset);
                if (!isNaN(offsetNum) && offsetNum >= 0) {
                    query += ` OFFSET ${offsetNum}`;
                }
            }
        }
        
        const result = await pgPool.query(query, queryParams);
        
        // Sanitize user IDs before returning
        const sanitizedUsers = result.rows.map(user => ({
            ...sanitizeUser(user),
            // Keep additional fields for moderator view
            email: user.email,
            is_banned: user.is_banned,
            ban_expires_at: user.ban_expires_at,
            ban_reason: user.ban_reason,
            banned_at: user.banned_at,
            banned_by: user.banned_by,
            warning_count: user.warning_count,
            total_comments: user.total_comments,
            total_reports_made: user.total_reports_made,
            total_reports_received: user.total_reports_received,
            trust_score: user.trust_score,
            created_at: user.created_at,
            // Include aggregated data if available
            comments: user.comments || [],
            warnings: user.warnings || [],
            reports_received: user.reports_received || [],
            current_ban: user.current_ban || null,
            ban_history: user.ban_history || []
        }));
        
        // Return single object for user details
        if (userId && includeDetails === 'true' && sanitizedUsers.length > 0) {
            res.json(sanitizedUsers[0]);
        } else {
            res.json(sanitizedUsers);
        }
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});



// Send warning to user
app.post('/api/users/:userId/warn', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    const { reason, message } = req.body;
    const moderatorId = req.user.id;
    
    // Convert public ID to Discord ID
    const discordId = getDiscordId(userId);
    if (!discordId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    if (!reason) {
        return res.status(400).json({ error: 'Reason is required' });
    }
    
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Get target user name
        const userResult = await client.query(
            'SELECT name FROM users WHERE id = $1',
            [discordId]
        );
        
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        const targetUserName = userResult.rows[0].name;
        
        // Create warning
        await client.query(
            `INSERT INTO warnings (user_id, moderator_id, reason, message)
             VALUES ($1, $2, $3, $4)`,
            [discordId, moderatorId, reason, message || null]
        );
        
        // Update warning statistics
        await client.query(
            `UPDATE users 
             SET warning_count = warning_count + 1,
                 last_warning_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [discordId]
        );
        
        await client.query('COMMIT');
        
        // Log moderation action
        await logModerationAction(
            'warn_user',
            req.user.id,
            req.user.name,
            discordId,
            targetUserName,
            {
                reason: reason,
                message: message || null
            }
        );
        
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Warn user error:', error);
        res.status(500).json({ error: 'Failed to issue warning' });
    } finally {
        client.release();
    }
});

// Check for new warnings
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

// Mark warnings as read
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

// Get users for mention suggestions
app.get('/api/mention-users', authenticateUser, async (req, res) => {
    const { q = '', limit = 5 } = req.query;
    
    try {
        let query;
        let params;
        
        if (q.length === 0) {
            // Return all users for empty search
            query = `SELECT id, name, picture as avatar 
                     FROM users 
                     WHERE is_banned = false
                     ORDER BY name
                     LIMIT $1`;
            params = [parseInt(limit)];
        } else {
            // Use case-insensitive search for any length
            query = `SELECT id, name, picture as avatar 
                     FROM users 
                     WHERE LOWER(name) LIKE LOWER($1)
                     AND is_banned = false
                     ORDER BY name
                     LIMIT $2`;
            params = [`${q}%`, parseInt(limit)];
        }
        
        const result = await pgPool.query(query, params);
        // Return array directly for consistency
        res.json(result.rows);
    } catch (error) {
        console.error('Get mention users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Update Discord DM preference
app.put('/api/users/discord-dms', authenticateUser, async (req, res) => {
    const { allow_discord_dms } = req.body;
    
    try {
        await pgPool.query(
            'UPDATE users SET allow_discord_dms = $1 WHERE id = $2',
            [allow_discord_dms, req.user.id]
        );
        
        res.json({ 
            success: true,
            allow_discord_dms: allow_discord_dms 
        });
    } catch (error) {
        console.error('Update Discord DM preference error:', error);
        res.status(500).json({ error: 'Failed to update Discord DM preference' });
    }
});

// Change moderator status
app.put('/api/users/:userId/moderator', authenticateUser, async (req, res) => {
    const { userId } = req.params;
    const { is_moderator } = req.body;
    
    // Convert public ID to Discord ID
    const discordId = getDiscordId(userId);
    if (!discordId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Verify super moderator permission
    if (!req.user.is_super_moderator) {
        const initialMods = process.env.INITIAL_MODERATORS?.split(',').map(id => id.trim()).filter(Boolean) || [];
        if (!initialMods.includes(req.user.id)) {
            return res.status(403).json({ error: 'Only super moderators can change moderator status' });
        }
    }
    
    try {
        // Get user name
        const userResult = await pgPool.query(
            'SELECT name FROM users WHERE id = $1',
            [discordId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const targetUserName = userResult.rows[0].name;
        
        await pgPool.query(
            'UPDATE users SET is_moderator = $1 WHERE id = $2',
            [is_moderator, discordId]
        );
        
        // Log moderation action
        await logModerationAction(
            is_moderator ? 'grant_moderator' : 'revoke_moderator',
            req.user.id,
            req.user.name,
            discordId,
            targetUserName,
            {}
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Toggle moderator error:', error);
        res.status(500).json({ error: 'Failed to update moderator status' });
    }
});

// Remove user ban
app.post('/api/users/:userId/unban', authenticateUser, requireModerator, async (req, res) => {
    const { userId } = req.params;
    
    // Convert public ID to Discord ID
    const discordId = getDiscordId(userId);
    if (!discordId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    try {
        // Get user name
        const userResult = await pgPool.query(
            'SELECT name FROM users WHERE id = $1',
            [discordId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const targetUserName = userResult.rows[0].name;
        await pgPool.query(
            `UPDATE users 
             SET is_banned = FALSE, 
                 ban_expires_at = NULL, 
                 ban_reason = NULL,
                 banned_by = NULL,
                 banned_at = NULL
             WHERE id = $1`,
            [discordId]
        );
        
        // Log moderation action
        await logModerationAction(
            'unban_user',
            req.user.id,
            req.user.name,
            discordId,
            targetUserName,
            {}
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Unban user error:', error);
        res.status(500).json({ error: 'Failed to unban user' });
    }
});

// Count pending reports
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

// Get moderation logs
app.get('/api/moderation-logs', authenticateUser, requireModerator, async (req, res) => {
    const { userId, limit = 25, offset = 0 } = req.query;
    
    try {
        let query = `
            SELECT 
                ml.*,
                u.picture as moderator_picture,
                u2.picture as target_user_picture
            FROM moderation_logs ml
            LEFT JOIN users u ON ml.moderator_id = u.id
            LEFT JOIN users u2 ON ml.target_user_id = u2.id
        `;
        
        const queryParams = [];
        
        if (userId) {
            // Convert public ID to Discord ID
            const discordId = getDiscordId(userId);
            if (discordId) {
                query += ' WHERE ml.moderator_id = $1';
                queryParams.push(discordId);
            }
        }
        
        query += ' ORDER BY ml.created_at DESC';
        
        // Add pagination
        const limitNum = Math.min(parseInt(limit) || 25, 100);
        const offsetNum = parseInt(offset) || 0;
        query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;
        
        const result = await pgPool.query(query, queryParams);
        
        // Get list of moderators for filtering
        const moderatorsResult = await pgPool.query(
            'SELECT id, name, picture FROM users WHERE is_moderator = TRUE ORDER BY name'
        );
        
        // Disable browser caching
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        // Sanitize IDs in logs
        const sanitizedLogs = result.rows.map(log => ({
            ...log,
            moderator_id: getPublicId(log.moderator_id),
            target_user_id: log.target_user_id ? getPublicId(log.target_user_id) : null
        }));
        
        // Sanitize moderator IDs
        const sanitizedModerators = moderatorsResult.rows.map(mod => sanitizeUser(mod));
        
        res.json({
            logs: sanitizedLogs,
            moderators: sanitizedModerators
        });
    } catch (error) {
        console.error('Get moderation logs error:', error);
        res.status(500).json({ error: 'Failed to get moderation logs' });
    }
});

// Theme Management Endpoints removed - theme editor functionality has been removed

// Legacy endpoint removed - use /api/reports

// Theme management endpoints

// Get current theme
app.get('/api/theme', authenticateUser, requireSuperModerator, async (req, res) => {
    try {
        const result = await pgPool.query(
            'SELECT theme_data FROM site_settings WHERE id = $1',
            [1]
        );
        
        if (result.rows.length > 0 && result.rows[0].theme_data) {
            res.json(result.rows[0].theme_data);
        } else {
            // Return default theme
            res.json({ colors: getDefaultThemeColors() });
        }
    } catch (error) {
        console.error('Error loading theme:', error);
        res.status(500).json({ error: 'Failed to load theme' });
    }
});

// Save theme
app.post('/api/theme', authenticateUser, requireSuperModerator, async (req, res) => {
    try {
        const { colors } = req.body;
        
        // Validate colors structure
        if (!validateThemeColors(colors)) {
            return res.status(400).json({ error: 'Invalid theme data' });
        }
        
        await pgPool.query(`
            INSERT INTO site_settings (id, theme_data, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (id) DO UPDATE
            SET theme_data = $2, updated_at = NOW()
        `, [1, { colors }]);
        
        // Clear any cached theme data
        await safeRedisOp(() => redisClient.del('theme:current'));
        await safeRedisOp(() => redisClient.del('theme:css'));
        await safeRedisOp(() => redisClient.del('theme:public:data'));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving theme:', error);
        res.status(500).json({ error: 'Failed to save theme' });
    }
});

// Public endpoint to fetch theme data (no authentication required)
app.get('/api/theme/public', async (req, res) => {
    try {
        // Try cache first
        const cached = await safeRedisOp(() => redisClient.get('theme:public:data'));
        if (cached) {
            res.json(JSON.parse(cached));
            return;
        }
        
        // Load from database
        const result = await pgPool.query(
            'SELECT theme_data FROM site_settings WHERE id = $1',
            [1]
        );
        
        let themeData;
        if (result.rows.length > 0 && result.rows[0].theme_data) {
            themeData = result.rows[0].theme_data;
        } else {
            // Return default theme structure
            themeData = { colors: getDefaultThemeColors() };
        }
        
        // Cache for 1 hour
        await safeRedisOp(() => redisClient.setEx('theme:public:data', 3600, JSON.stringify(themeData)));
        
        res.json(themeData);
    } catch (error) {
        console.error('Error fetching public theme:', error);
        res.status(500).json({ error: 'Failed to fetch theme' });
    }
});

// Serve theme CSS for non-authenticated users
app.get('/theme.css', async (req, res) => {
    try {
        // Try cache first
        const cached = await safeRedisOp(() => redisClient.get('theme:css'));
        if (cached) {
            res.type('text/css').send(cached);
            return;
        }
        
        // Load from database
        const result = await pgPool.query(
            'SELECT theme_data FROM site_settings WHERE id = $1',
            [1]
        );
        
        let css = '';
        if (result.rows.length > 0 && result.rows[0].theme_data?.colors) {
            css = generateThemeCSS(result.rows[0].theme_data.colors);
        } else {
            css = generateThemeCSS(getDefaultThemeColors());
        }
        
        // Cache for 1 hour
        await safeRedisOp(() => redisClient.setEx('theme:css', 3600, css));
        
        res.type('text/css').send(css);
    } catch (error) {
        console.error('Error serving theme CSS:', error);
        res.status(500).send('/* Error loading theme */');
    }
});

// Helper functions for theme management
function getDefaultThemeColors() {
    return {
        primary: {
            main: '#3b82f6',
            hover: '#2563eb',
            light: '#dbeafe'
        },
        backgrounds: {
            main: '#ffffff',
            secondary: '#f3f4f6',
            hover: '#f9fafb'
        },
        text: {
            primary: '#111827',
            secondary: '#6b7280',
            muted: '#9ca3af'
        },
        borders: {
            light: '#e5e7eb',
            medium: '#d1d5db'
        }
    };
}

function validateThemeColors(colors) {
    // Basic validation of theme structure
    const required = ['primary', 'backgrounds', 'text', 'borders'];
    return required.every(key => colors[key] && typeof colors[key] === 'object');
}

function generateThemeCSS(colors) {
    let css = ':root {\n';
    
    Object.entries(colors).forEach(([category, categoryColors]) => {
        Object.entries(categoryColors).forEach(([key, value]) => {
            css += `  --color-${category}-${key}: ${value};\n`;
        });
    });
    
    css += '}';
    return css;
}

// Global error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Analytics endpoint - moderator only
app.get('/api/analytics/activity-data', authenticateUser, requireModerator, async (req, res) => {
    try {
        const { period = 'day', index = 0 } = req.query;
        const idx = parseInt(index);
        
        // First, get the most recent date from the database
        const recentResult = await pgPool.query(
            `SELECT MAX(period_date) as max_date FROM analytics_cache WHERE period_type = $1`,
            [period]
        );
        
        const referenceDate = recentResult.rows[0]?.max_date 
            ? new Date(recentResult.rows[0].max_date) 
            : new Date();
        
        // Add one day to reference date since data is for "yesterday"
        referenceDate.setDate(referenceDate.getDate() + 1);
        
        console.log(`Reference date for ${period}: ${referenceDate.toISOString()}`);
        
        // Calculate the date based on period and index
        let targetDate = new Date(referenceDate);
        if (period === 'day') {
            targetDate.setDate(targetDate.getDate() - (idx + 1)); // -1 for yesterday, -2 for 2 days ago, etc.
        } else if (period === 'week') {
            // Rolling 7-day periods, go back idx weeks
            targetDate.setDate(targetDate.getDate() - 1 - (idx * 7)); // Yesterday minus idx weeks
        } else if (period === 'month') {
            // Rolling 30-day periods, go back idx months
            targetDate.setDate(targetDate.getDate() - 1 - (idx * 30)); // Yesterday minus idx * 30 days
        } else if (period === 'quarter') {
            // Rolling 90-day period (only index 0 supported)
            targetDate.setDate(targetDate.getDate() - 1); // Yesterday
        }
        
        // Get pre-calculated data from database
        const result = await pgPool.query(
            `SELECT data, generated_at 
             FROM analytics_cache 
             WHERE period_type = $1 
               AND period_date = $2
             ORDER BY generated_at DESC
             LIMIT 1`,
            [period, targetDate.toISOString().split('T')[0]]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                success: true,
                pages: [],
                generatedAt: new Date(),
                message: 'No data available yet'
            });
        }
        
        const { data, generated_at } = result.rows[0];
        
        res.json({
            success: true,
            ...data,
            generatedAt: generated_at
        });
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
});

// Analytics data for bar chart - fetch multiple periods
app.get('/api/analytics/period-summary', authenticateUser, requireModerator, async (req, res) => {
    try {
        const { period = 'day', count = 24 } = req.query;
        const limit = Math.min(parseInt(count), 90); // Max 90 items
        
        let query;
        if (period === 'day') {
            // Get last N days (just get all available data)
            query = `
                SELECT period_date, data
                FROM analytics_cache
                WHERE period_type = 'day'
                ORDER BY period_date DESC
                LIMIT ${limit}
            `;
        } else if (period === 'week') {
            // Get last N weeks (rolling 7-day periods)
            query = `
                SELECT period_date, data
                FROM analytics_cache
                WHERE period_type = 'week'
                ORDER BY period_date DESC
                LIMIT ${limit}
            `;
        } else if (period === 'month') {
            // Get last N months (rolling 30-day periods)
            query = `
                SELECT period_date, data
                FROM analytics_cache
                WHERE period_type = 'month'
                ORDER BY period_date DESC
                LIMIT ${limit}
            `;
        } else {
            return res.status(400).json({ error: 'Invalid period type' });
        }
        
        const result = await pgPool.query(query);
        
        // Create a map of existing data
        const dataMap = new Map();
        result.rows.forEach(row => {
            const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
            const totalComments = data?.totalComments || 0;
            console.log(`Existing data: ${row.period_date} = ${totalComments} comments`);
            dataMap.set(row.period_date, totalComments);
        });
        
        // Generate all dates needed, filling gaps with 0
        const summaryData = [];
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        console.log(`Generating ${limit} ${period} entries ending on ${yesterday.toISOString().split('T')[0]}`);
        
        for (let i = limit - 1; i >= 0; i--) {
            const currentDate = new Date(yesterday);
            
            if (period === 'day') {
                // For daily: go back from yesterday
                currentDate.setDate(currentDate.getDate() - i);
            } else if (period === 'week') {
                // For weekly: rolling 7-day periods ending on each day
                currentDate.setDate(currentDate.getDate() - (i * 7));
            } else if (period === 'month') {
                // For monthly: rolling 30-day periods ending on each day
                currentDate.setDate(currentDate.getDate() - (i * 30));
            }
            
            const dateStr = currentDate.toISOString().split('T')[0];
            const totalComments = dataMap.get(dateStr) || 0;
            
            console.log(`${period} ${i}: ${dateStr} - ${totalComments} comments`);
            
            summaryData.push({
                date: dateStr,
                totalComments: totalComments,
                periodType: period
            });
        }
        
        console.log(`Returning ${summaryData.length} entries for period ${period}`);
        
        res.json({
            success: true,
            period,
            data: summaryData
        });
    } catch (error) {
        console.error('Error fetching period summary:', error);
        res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
});

// Diagnostic endpoint to check analytics data integrity
app.get('/api/analytics/diagnostic', authenticateUser, requireModerator, async (req, res) => {
    try {
        // Check total comments in database
        const totalComments = await pgPool.query(
            'SELECT COUNT(*) as total FROM comments'
        );
        
        // Check comments by date
        const commentsByDate = await pgPool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM comments
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 10
        `);
        
        // Check analytics cache data
        const analyticsData = await pgPool.query(`
            SELECT 
                period_type,
                period_date,
                data->>'totalComments' as total_comments,
                jsonb_array_length(data->'pages') as page_count,
                generated_at
            FROM analytics_cache
            WHERE period_type = 'day'
            ORDER BY period_date DESC
            LIMIT 10
        `);
        
        // Check for data inconsistencies
        const inconsistencies = await pgPool.query(`
            SELECT 
                period_type,
                COUNT(*) as entries,
                SUM((data->>'totalComments')::int) as sum_total_comments,
                COUNT(CASE WHEN (data->>'totalComments')::int = 0 THEN 1 END) as zero_entries,
                COUNT(CASE WHEN (data->>'totalComments')::int > 0 THEN 1 END) as non_zero_entries
            FROM analytics_cache
            GROUP BY period_type
        `);
        
        res.json({
            totalCommentsInDB: parseInt(totalComments.rows[0].total),
            recentCommentsByDate: commentsByDate.rows,
            recentAnalyticsData: analyticsData.rows,
            analyticsSummary: inconsistencies.rows,
            diagnostic: {
                hasComments: parseInt(totalComments.rows[0].total) > 0,
                hasAnalyticsData: analyticsData.rows.length > 0,
                zeroTotalIssue: analyticsData.rows.some(row => 
                    parseInt(row.page_count) > 0 && parseInt(row.total_comments) === 0
                )
            }
        });
    } catch (error) {
        console.error('Diagnostic error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Temporary endpoint to manually trigger analytics recalculation
app.post('/api/analytics/recalculate', authenticateUser, requireModerator, async (req, res) => {
    try {
        const { AnalyticsCalculator } = require('./jobs/analytics-calculator');
        const calculator = new AnalyticsCalculator(pgPool);
        
        // Clear existing data
        await pgPool.query('DELETE FROM analytics_cache');
        
        // Repopulate
        await calculator.populateHistoricalData();
        
        res.json({ success: true, message: 'Analytics recalculation started' });
    } catch (error) {
        console.error('Error recalculating analytics:', error);
        res.status(500).json({ error: 'Failed to recalculate analytics' });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Handle process termination
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => console.log('HTTP server closed'));
    await pgPool.end();
    await redisClient.quit();
    process.exit(0);
});

// Launch API server
const server = app.listen(port, async () => {
    console.log(`Comment API server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database host: ${process.env.DB_HOST || 'localhost'}`);
    
    // Populate ID caches on startup
    await populateIdCaches();
    
    // Check if analytics data needs to be initialized
    try {
        const result = await pgPool.query('SELECT COUNT(*) FROM analytics_cache');
        const count = parseInt(result.rows[0].count);
        
        if (count === 0) {
            console.log('No analytics data found. Running initial analytics calculation...');
            const { AnalyticsCalculator } = require('./jobs/analytics-calculator');
            const calculator = new AnalyticsCalculator(pgPool);
            
            // Run initial population in the background
            calculator.populateHistoricalData()
                .then(() => console.log('Initial analytics calculation complete'))
                .catch(err => console.error('Error during initial analytics calculation:', err));
        } else {
            console.log(`Found ${count} analytics cache entries`);
        }
    } catch (error) {
        console.error('Error checking analytics data:', error);
    }
    
    // Start analytics job
    const { startAnalyticsJob } = require('./jobs/analytics-calculator');
    startAnalyticsJob(pgPool);
    console.log('Analytics job scheduler started');
});