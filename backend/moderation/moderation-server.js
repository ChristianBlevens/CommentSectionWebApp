const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const natural = require('natural');
const { Pool } = require('pg');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// Validate admin key is configured
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY || ADMIN_KEY === 'your_secure_admin_key_here') {
    console.warn('WARNING: Admin key not properly configured!');
    console.warn('Admin endpoints will be disabled. Set ADMIN_KEY in .env file');
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
app.use(bodyParser.json({ limit: '1mb' })); // Limit request size for security
app.use(bodyParser.urlencoded({ extended: true }));

// PostgreSQL connection pool
const pgPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'moderation_db',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 10, // Smaller pool for moderation service
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pgPool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Database connected successfully');
});

// Initialize database schema
const initDatabase = async () => {
    const client = await pgPool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Create moderation logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS moderation_logs (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                approved BOOLEAN NOT NULL,
                reason VARCHAR(255),
                confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
                flagged_words TEXT[],
                user_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create blocked words table with unique constraint
        await client.query(`
            CREATE TABLE IF NOT EXISTS blocked_words (
                id SERIAL PRIMARY KEY,
                word VARCHAR(255) UNIQUE NOT NULL,
                severity VARCHAR(50) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create trusted users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS trusted_users (
                id VARCHAR(255) PRIMARY KEY,
                trust_score FLOAT DEFAULT 0.5 CHECK (trust_score >= 0 AND trust_score <= 1),
                total_comments INTEGER DEFAULT 0 CHECK (total_comments >= 0),
                flagged_comments INTEGER DEFAULT 0 CHECK (flagged_comments >= 0),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create indexes for performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_moderation_logs_user_id ON moderation_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_blocked_words_word ON blocked_words(word);
        `);
        
        // Insert default blocked words
        const defaultBlockedWords = [
            { word: 'spam', severity: 'low' },
            { word: 'scam', severity: 'medium' },
            { word: 'hate', severity: 'high' },
            { word: 'violence', severity: 'high' },
            { word: 'abuse', severity: 'high' },
            { word: 'harassment', severity: 'high' },
            { word: 'threat', severity: 'high' },
            { word: 'racist', severity: 'high' },
            { word: 'sexist', severity: 'high' },
            { word: 'homophobic', severity: 'high' }
        ];
        
        for (const { word, severity } of defaultBlockedWords) {
            await client.query(
                `INSERT INTO blocked_words (word, severity) 
                 VALUES ($1, $2) 
                 ON CONFLICT (word) DO NOTHING`,
                [word.toLowerCase(), severity]
            );
        }
        
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

// Store database initialization promise
const databaseInitPromise = initDatabase();

// Natural Language Processing setup
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const sentiment = new natural.SentimentAnalyzer('English', stemmer, 'afinn');

// Content moderation class
class ContentModerator {
    constructor() {
        this.blockedWords = new Map();
        // Don't load blocked words in constructor
        // Will be loaded after database is initialized
    }
    
    // Initialize moderator after database is ready
    async initialize() {
        console.log('Initializing content moderator...');
        await this.loadBlockedWords();
        
        // Refresh blocked words periodically
        setInterval(() => this.loadBlockedWords(), 60000); // Every minute
        console.log('Content moderator initialized');
    }
    
    // Load blocked words from database
    async loadBlockedWords() {
        try {
            console.log('Loading blocked words from database...');
            const result = await pgPool.query('SELECT word, severity FROM blocked_words');
            
            // Clear existing words
            this.blockedWords.clear();
            
            // Load new words
            result.rows.forEach(row => {
                this.blockedWords.set(row.word.toLowerCase(), row.severity);
            });
            
            console.log(`Loaded ${this.blockedWords.size} blocked words from database`);
        } catch (error) {
            console.error('Error loading blocked words:', error);
        }
    }
    
    // Main moderation function
    async moderate(content, userId = null) {
        console.log('Moderating content:', { userId, contentLength: content?.length });
        
        const result = {
            approved: true,
            reason: null,
            confidence: 1.0,
            flaggedWords: [],
            suggestions: []
        };
        
        // Validate content exists
        if (!content || content.trim().length === 0) {
            console.log('Content rejected: Empty content');
            result.approved = false;
            result.reason = 'Empty content';
            result.confidence = 1.0;
            return result;
        }
        
        // Check content length limit
        if (content.length > 5000) {
            console.log('Content rejected: Too long', content.length);
            result.approved = false;
            result.reason = 'Content too long (max 5000 characters)';
            result.confidence = 1.0;
            return result;
        }
        
        // Check for HTML/CSS/JavaScript injection attempts
        console.log('Checking for code injection...');
        const hasCustomCode = this.checkForCustomCode(content);
        if (hasCustomCode) {
            console.log('Content rejected: Code injection detected');
            result.approved = false;
            result.reason = 'HTML, CSS, or JavaScript code is not allowed';
            result.confidence = 1.0;
            return result;
        }
        
        // Check for unauthorized links
        console.log('Checking for unauthorized links...');
        const hasLinks = this.checkForLinks(content);
        if (hasLinks) {
            console.log('Content rejected: Unauthorized links detected');
            result.approved = false;
            result.reason = 'External links are not allowed';
            result.confidence = 1.0;
            return result;
        }
        
        // Tokenize content for analysis
        const tokens = tokenizer.tokenize(content.toLowerCase());
        
        // Check against blocked words
        console.log('Checking against blocked words...');
        const foundBlockedWords = [];
        let severityScore = 0;
        
        for (const token of tokens) {
            if (this.blockedWords.has(token)) {
                const severity = this.blockedWords.get(token);
                foundBlockedWords.push({ word: token, severity });
                console.log(`Found blocked word: ${token} (${severity})`);
                
                // Calculate severity score
                switch (severity) {
                    case 'low': severityScore += 1; break;
                    case 'medium': severityScore += 3; break;
                    case 'high': severityScore += 5; break;
                }
            }
        }
        
        // Check for spam patterns
        const spamScore = this.checkSpamPatterns(content);
        
        // Perform sentiment analysis
        const sentimentScore = sentiment.getSentiment(tokens);
        
        // Check capitalization ratio
        const capsRatio = this.getCapsRatio(content);
        
        // Check for character repetition
        const hasExcessiveRepetition = this.checkRepetition(content);
        
        // Get user trust score if userId provided
        let trustScore = 0.5;
        if (userId) {
            trustScore = await this.getUserTrustScore(userId);
            console.log(`User trust score for ${userId}: ${trustScore}`);
        }
        
        // Make moderation decision based on all factors
        console.log('Making moderation decision...', { 
            severityScore, spamScore, sentimentScore, capsRatio, hasExcessiveRepetition 
        });
        
        if (foundBlockedWords.length > 0 && severityScore >= 5) {
            console.log('Content rejected: Prohibited language');
            result.approved = false;
            result.reason = 'Contains prohibited language';
            result.flaggedWords = foundBlockedWords.map(w => w.word);
            result.confidence = 0.9;
        } else if (spamScore > 0.7) {
            console.log('Content rejected: Spam detected');
            result.approved = false;
            result.reason = 'Detected as spam';
            result.confidence = spamScore;
        } else if (sentimentScore < -3) {
            console.log('Content rejected: Extremely negative');
            result.approved = false;
            result.reason = 'Extremely negative content';
            result.confidence = 0.8;
        } else if (capsRatio > 0.8 && content.length > 10) {
            console.log('Content rejected: Excessive caps');
            result.approved = false;
            result.reason = 'Excessive capitalization';
            result.confidence = 0.9;
        } else if (hasExcessiveRepetition) {
            console.log('Content rejected: Character repetition');
            result.approved = false;
            result.reason = 'Excessive character repetition';
            result.confidence = 0.85;
        }
        
        // Apply trust score adjustment for borderline cases
        if (!result.approved && trustScore > 0.8 && result.confidence < 0.7) {
            result.approved = true;
            result.reason = null;
            result.flaggedWords = [];
        }
        
        // Log moderation result
        await this.logModeration(content, result, userId);
        
        return result;
    }
    
    // Check for spam patterns
    checkSpamPatterns(content) {
        let spamScore = 0;
        
        // Common spam phrases
        const spamPhrases = [
            'click here', 'buy now', 'limited offer', 'act now',
            'make money', 'work from home', 'congratulations you won',
            'increase your', 'free gift', 'risk free', 'no obligation',
            'order now', 'special promotion', 'call now'
        ];
        
        const lowerContent = content.toLowerCase();
        
        // Check each spam phrase
        for (const phrase of spamPhrases) {
            if (lowerContent.includes(phrase)) {
                spamScore += 0.15;
            }
        }
        
        // Check for excessive punctuation
        const exclamationCount = (content.match(/!/g) || []).length;
        const questionCount = (content.match(/\?/g) || []).length;
        const contentLength = content.length;
        
        if (exclamationCount > 5 || exclamationCount / contentLength > 0.1) {
            spamScore += 0.3;
        }
        
        if (questionCount > 5 || questionCount / contentLength > 0.1) {
            spamScore += 0.2;
        }
        
        // Check for phone number patterns
        const phonePattern = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
        if (phonePattern.test(content)) {
            spamScore += 0.4;
        }
        
        // Check for email patterns
        const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        if (emailPattern.test(content)) {
            spamScore += 0.3;
        }
        
        return Math.min(spamScore, 1.0);
    }
    
    // Calculate capitalization ratio
    getCapsRatio(content) {
        const letters = content.replace(/[^a-zA-Z]/g, '');
        if (letters.length === 0) return 0;
        
        const upperCount = (letters.match(/[A-Z]/g) || []).length;
        return upperCount / letters.length;
    }
    
    // Check for excessive character repetition
    checkRepetition(content) {
        // Pattern for 5 or more repeated characters
        const repeatedPattern = /(.)\1{4,}/;
        return repeatedPattern.test(content);
    }
    
    // Check for unauthorized links
    checkForLinks(content) {
        // Create a copy to filter out allowed embeds
        let filteredContent = content;
        
        // Remove markdown image embeds
        filteredContent = filteredContent.replace(/!\[.*?\]\(.*?\)/g, '');
        
        // Remove markdown video embeds
        filteredContent = filteredContent.replace(/!video\[.*?\]\(.*?\)/g, '');
        
        // Check for remaining URLs
        const urlPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+\.(com|org|net|io|co|uk|ca|de|fr|jp|au|us|ru|ch|it|nl|se|no|es|mil|edu|gov)[^\s]*)/gi;
        return urlPattern.test(filteredContent);
    }
    
    // Check for HTML/CSS/JavaScript injection attempts
    checkForCustomCode(content) {
        // List of patterns to check
        const patterns = [
            /<[^>]+>/gi,                    // HTML tags
            /&[#a-zA-Z0-9]+;/gi,           // HTML entities
            /javascript\s*:/gi,             // JavaScript protocol
            /on\w+\s*=/gi,                 // Event handlers
            /style\s*=/gi,                 // Style attributes
            /expression\s*\(/gi,           // CSS expressions
            /@import/gi,                   // CSS imports
            /data:[^,]*script[^,]*,/gi,    // Data URI scripts
            /vbscript\s*:/gi,              // VBScript protocol
            /base64[^'"]*script/gi         // Base64 encoded scripts
        ];
        
        // Check each pattern
        for (const pattern of patterns) {
            if (pattern.test(content)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Get user trust score
    async getUserTrustScore(userId) {
        try {
            const result = await pgPool.query(
                'SELECT trust_score FROM trusted_users WHERE id = $1',
                [userId]
            );
            
            if (result.rows.length > 0) {
                return parseFloat(result.rows[0].trust_score);
            }
            
            // Initialize new user with default trust score
            await pgPool.query(
                'INSERT INTO trusted_users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
                [userId]
            );
            
            return 0.5; // Default trust score
        } catch (error) {
            console.error('Error getting trust score:', error);
            return 0.5;
        }
    }
    
    // Update user trust score based on moderation results
    async updateUserTrustScore(userId, wasApproved) {
        const client = await pgPool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get current stats
            const result = await client.query(
                'SELECT trust_score, total_comments, flagged_comments FROM trusted_users WHERE id = $1 FOR UPDATE',
                [userId]
            );
            
            let trustScore = 0.5;
            let totalComments = 0;
            let flaggedComments = 0;
            
            if (result.rows.length > 0) {
                trustScore = parseFloat(result.rows[0].trust_score);
                totalComments = parseInt(result.rows[0].total_comments);
                flaggedComments = parseInt(result.rows[0].flagged_comments);
            }
            
            // Update statistics
            totalComments++;
            if (!wasApproved) {
                flaggedComments++;
            }
            
            // Recalculate trust score after minimum comments
            if (totalComments >= 5) {
                trustScore = 1 - (flaggedComments / totalComments);
                trustScore = Math.max(0.1, Math.min(1.0, trustScore));
            }
            
            // Update or insert user record
            await client.query(
                `INSERT INTO trusted_users (id, trust_score, total_comments, flagged_comments) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (id) DO UPDATE 
                 SET trust_score = EXCLUDED.trust_score, 
                     total_comments = EXCLUDED.total_comments, 
                     flagged_comments = EXCLUDED.flagged_comments, 
                     updated_at = CURRENT_TIMESTAMP`,
                [userId, trustScore, totalComments, flaggedComments]
            );
            
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating trust score:', error);
        } finally {
            client.release();
        }
    }
    
    // Log moderation result
    async logModeration(content, result, userId = null) {
        try {
            await pgPool.query(
                `INSERT INTO moderation_logs (content, approved, reason, confidence, flagged_words, user_id) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    content.substring(0, 5000), // Truncate for storage
                    result.approved,
                    result.reason,
                    result.confidence,
                    result.flaggedWords,
                    userId
                ]
            );
        } catch (error) {
            console.error('Error logging moderation:', error);
        }
    }
}

// Initialize content moderator
const moderator = new ContentModerator();

// Initialize everything after database is ready
databaseInitPromise
    .then(async () => {
        // Initialize moderator after database is ready
        await moderator.initialize();
    })
    .catch(err => {
        console.error('Failed to initialize:', err);
        process.exit(1);
    });

// Routes

// Main moderation endpoint
app.post('/api/moderate', async (req, res) => {
    const { content, userId } = req.body;
    
    console.log('Moderation request received:', { userId, contentLength: content?.length });
    
    // Validate content parameter
    if (content === undefined || content === null) {
        console.error('Missing content parameter in moderation request');
        return res.status(400).json({ 
            error: 'Content parameter is required' 
        });
    }
    
    try {
        // Perform moderation
        console.log('Starting content moderation...');
        const result = await moderator.moderate(content, userId);
        console.log('Moderation result:', { approved: result.approved, reason: result.reason, confidence: result.confidence });
        
        // Update user trust score if userId provided
        if (userId) {
            console.log('Updating user trust score for:', userId);
            moderator.updateUserTrustScore(userId, result.approved)
                .catch(err => console.error('Failed to update trust score:', err));
        }
        
        res.json(result);
    } catch (error) {
        console.error('Moderation error:', error);
        res.status(500).json({ 
            approved: false, 
            reason: 'Moderation service error',
            confidence: 1.0
        });
    }
});

// Admin endpoint to add/update blocked words
app.post('/api/admin/blocked-words', async (req, res) => {
    const { word, severity = 'medium', adminKey } = req.body;
    
    // Validate admin key
    if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Validate parameters
    if (!word || typeof word !== 'string') {
        return res.status(400).json({ error: 'Invalid word parameter' });
    }
    
    if (!['low', 'medium', 'high'].includes(severity)) {
        return res.status(400).json({ error: 'Invalid severity level' });
    }
    
    try {
        await pgPool.query(
            `INSERT INTO blocked_words (word, severity) 
             VALUES ($1, $2) 
             ON CONFLICT (word) DO UPDATE SET severity = EXCLUDED.severity`,
            [word.toLowerCase().trim(), severity]
        );
        
        // Reload blocked words
        await moderator.loadBlockedWords();
        
        res.json({ 
            success: true,
            message: `Blocked word '${word}' added/updated with severity '${severity}'`
        });
    } catch (error) {
        console.error('Add blocked word error:', error);
        res.status(500).json({ error: 'Failed to add blocked word' });
    }
});

// Admin endpoint to remove blocked words
app.delete('/api/admin/blocked-words/:word', async (req, res) => {
    const { word } = req.params;
    const { adminKey } = req.query;
    
    // Validate admin key
    if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const result = await pgPool.query(
            'DELETE FROM blocked_words WHERE word = $1',
            [word.toLowerCase()]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Word not found' });
        }
        
        // Reload blocked words
        await moderator.loadBlockedWords();
        
        res.json({ 
            success: true,
            message: `Blocked word '${word}' removed`
        });
    } catch (error) {
        console.error('Remove blocked word error:', error);
        res.status(500).json({ error: 'Failed to remove blocked word' });
    }
});

// Admin endpoint to get moderation statistics
app.get('/api/admin/stats', async (req, res) => {
    const { adminKey, hours = 24 } = req.query;
    
    // Validate admin key
    if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        // Get overall statistics
        const stats = await pgPool.query(`
            SELECT 
                COUNT(*) as total_moderated,
                SUM(CASE WHEN approved THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN NOT approved THEN 1 ELSE 0 END) as rejected_count,
                AVG(confidence) as avg_confidence
            FROM moderation_logs
            WHERE created_at > NOW() - INTERVAL '${parseInt(hours)} hours'
        `);
        
        // Get rejection reasons breakdown
        const reasons = await pgPool.query(`
            SELECT reason, COUNT(*) as count
            FROM moderation_logs
            WHERE NOT approved AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'
            GROUP BY reason
            ORDER BY count DESC
        `);
        
        // Get most flagged words
        const flaggedWords = await pgPool.query(`
            SELECT unnest(flagged_words) as word, COUNT(*) as count
            FROM moderation_logs
            WHERE flagged_words IS NOT NULL AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'
            GROUP BY word
            ORDER BY count DESC
            LIMIT 10
        `);
        
        res.json({
            timeRange: `${hours} hours`,
            stats: stats.rows[0],
            rejectionReasons: reasons.rows,
            topFlaggedWords: flaggedWords.rows
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Check database connection
        await pgPool.query('SELECT 1');
        
        res.json({ 
            status: 'healthy',
            blockedWords: moderator.blockedWords.size,
            uptime: process.uptime()
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
    
    process.exit(0);
});

// Start server
const server = app.listen(port, () => {
    console.log(`Moderation service running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Admin endpoints: ${ADMIN_KEY ? 'enabled' : 'disabled'}`);
    console.log(`Database host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`Natural language processing enabled`);
    console.log(`Trust scoring system active`);
});