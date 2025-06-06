const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const natural = require('natural');
const { Pool } = require('pg');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// Configuration
const config = {
    adminKey: process.env.ADMIN_KEY,
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
            : '*',
        credentials: true
    },
    moderation: {
        spamThreshold: parseFloat(process.env.SPAM_THRESHOLD) || 0.7,
        sentimentThreshold: parseFloat(process.env.SENTIMENT_THRESHOLD) || -3,
        capsRatioThreshold: parseFloat(process.env.CAPS_RATIO_THRESHOLD) || 0.8,
        minTrustScore: parseFloat(process.env.MIN_TRUST_SCORE) || 0.1,
        maxTrustScore: parseFloat(process.env.MAX_TRUST_SCORE) || 1.0
    }
};

// Validate admin key
if (!config.adminKey || config.adminKey === 'your_secure_admin_key_here') {
    console.warn('WARNING: Admin key not configured! Admin endpoints disabled.');
}

// Middleware
app.use(cors(config.cors));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Database connection
const pgPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'moderation_db',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Initialize database schema
const initDatabase = async () => {
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // Moderation logs table
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
        
        // Blocked words table
        await client.query(`
            CREATE TABLE IF NOT EXISTS blocked_words (
                id SERIAL PRIMARY KEY,
                word VARCHAR(255) UNIQUE NOT NULL,
                severity VARCHAR(50) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Trusted users table
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
        
        // Create indexes
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

// Initialize database on startup
initDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

// NLP setup
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const sentiment = new natural.SentimentAnalyzer('English', stemmer, 'afinn');

// Content moderation class
class ContentModerator {
    constructor() {
        this.blockedWords = new Map();
        this.loadBlockedWords();
        // Refresh blocked words every minute
        setInterval(() => this.loadBlockedWords(), 60000);
    }
    
    // Load blocked words from database
    async loadBlockedWords() {
        try {
            const result = await pgPool.query('SELECT word, severity FROM blocked_words');
            this.blockedWords.clear();
            result.rows.forEach(row => {
                this.blockedWords.set(row.word.toLowerCase(), row.severity);
            });
        } catch (error) {
            console.error('Error loading blocked words:', error);
        }
    }
    
    // Main moderation function
    async moderate(content, userId = null) {
        const result = {
            approved: true,
            reason: null,
            confidence: 1.0,
            flaggedWords: []
        };
        
        // Check empty content
        if (!content || content.trim().length === 0) {
            result.approved = false;
            result.reason = 'Empty content';
            return result;
        }
        
        // Check content length
        if (content.length > 5000) {
            result.approved = false;
            result.reason = 'Content too long (max 5000 characters)';
            return result;
        }
        
        // Check for code injection
        if (this.checkForCode(content)) {
            result.approved = false;
            result.reason = 'HTML, CSS, or JavaScript code is not allowed';
            return result;
        }
        
        // Check for unauthorized links
        if (this.checkForLinks(content)) {
            result.approved = false;
            result.reason = 'External links are not allowed';
            return result;
        }
        
        // Tokenize and analyze
        const tokens = tokenizer.tokenize(content.toLowerCase());
        
        // Check blocked words
        const foundBlockedWords = [];
        let severityScore = 0;
        
        for (const token of tokens) {
            if (this.blockedWords.has(token)) {
                const severity = this.blockedWords.get(token);
                foundBlockedWords.push(token);
                // Calculate severity score
                severityScore += severity === 'low' ? 1 : severity === 'medium' ? 3 : 5;
            }
        }
        
        // Check spam patterns
        const spamScore = this.checkSpamPatterns(content);
        
        // Sentiment analysis
        const sentimentScore = sentiment.getSentiment(tokens);
        
        // Check caps ratio
        const capsRatio = this.getCapsRatio(content);
        
        // Check repetition
        const hasRepetition = this.checkRepetition(content);
        
        // Get user trust score
        const trustScore = userId ? await this.getUserTrustScore(userId) : 0.5;
        
        // Make moderation decision
        if (foundBlockedWords.length > 0 && severityScore >= 5) {
            result.approved = false;
            result.reason = 'Contains prohibited language';
            result.flaggedWords = foundBlockedWords;
            result.confidence = 0.9;
        } else if (spamScore > config.moderation.spamThreshold) {
            result.approved = false;
            result.reason = 'Detected as spam';
            result.confidence = spamScore;
        } else if (sentimentScore < config.moderation.sentimentThreshold) {
            result.approved = false;
            result.reason = 'Extremely negative content';
            result.confidence = 0.8;
        } else if (capsRatio > config.moderation.capsRatioThreshold && content.length > 10) {
            result.approved = false;
            result.reason = 'Excessive capitalization';
            result.confidence = 0.9;
        } else if (hasRepetition) {
            result.approved = false;
            result.reason = 'Excessive character repetition';
            result.confidence = 0.85;
        }
        
        // Trust score adjustment
        if (!result.approved && trustScore > 0.8 && result.confidence < 0.7) {
            result.approved = true;
            result.reason = null;
            result.flaggedWords = [];
        }
        
        // Log moderation
        await this.logModeration(content, result, userId);
        
        return result;
    }
    
    // Check spam patterns
    checkSpamPatterns(content) {
        let spamScore = 0;
        const lowerContent = content.toLowerCase();
        
        // Spam phrases
        const spamPhrases = [
            'click here', 'buy now', 'limited offer', 'act now',
            'make money', 'work from home', 'congratulations you won',
            'increase your', 'free gift', 'risk free', 'no obligation'
        ];
        
        spamPhrases.forEach(phrase => {
            if (lowerContent.includes(phrase)) spamScore += 0.15;
        });
        
        // Excessive punctuation
        const exclamations = (content.match(/!/g) || []).length;
        const questions = (content.match(/\?/g) || []).length;
        if (exclamations > 5 || exclamations / content.length > 0.1) spamScore += 0.3;
        if (questions > 5 || questions / content.length > 0.1) spamScore += 0.2;
        
        // Phone/email patterns
        if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(content)) spamScore += 0.4;
        if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content)) spamScore += 0.3;
        
        return Math.min(spamScore, 1.0);
    }
    
    // Get caps ratio
    getCapsRatio(content) {
        const letters = content.replace(/[^a-zA-Z]/g, '');
        if (letters.length === 0) return 0;
        const upperCount = (letters.match(/[A-Z]/g) || []).length;
        return upperCount / letters.length;
    }
    
    // Check character repetition
    checkRepetition(content) {
        return /(.)\1{4,}/.test(content);
    }
    
    // Check for links (excluding markdown embeds)
    checkForLinks(content) {
        let filtered = content;
        // Remove markdown image/video embeds
        filtered = filtered.replace(/!\[.*?\]\(.*?\)/g, '');
        filtered = filtered.replace(/!video\[.*?\]\(.*?\)/g, '');
        // Check remaining URLs
        return /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+\.(com|org|net|io|co|uk)[^\s]*)/gi.test(filtered);
    }
    
    // Check for code injection
    checkForCode(content) {
        const patterns = [
            /<[^>]+>/gi,                 // HTML tags
            /&[#a-zA-Z0-9]+;/gi,        // HTML entities
            /javascript\s*:/gi,          // JavaScript protocol
            /on\w+\s*=/gi,              // Event handlers
            /style\s*=/gi,              // Style attributes
            /@import/gi,                // CSS imports
            /vbscript\s*:/gi            // VBScript protocol
        ];
        
        return patterns.some(pattern => pattern.test(content));
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
            
            // Initialize new user
            await pgPool.query(
                'INSERT INTO trusted_users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
                [userId]
            );
            
            return 0.5;
        } catch (error) {
            console.error('Error getting trust score:', error);
            return 0.5;
        }
    }
    
    // Update user trust score
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
            
            // Update stats
            totalComments++;
            if (!wasApproved) flaggedComments++;
            
            // Recalculate trust score
            if (totalComments >= 5) {
                trustScore = 1 - (flaggedComments / totalComments);
                trustScore = Math.max(config.moderation.minTrustScore, 
                           Math.min(config.moderation.maxTrustScore, trustScore));
            }
            
            // Update database
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
                    content.substring(0, 5000),
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

// Initialize moderator
const moderator = new ContentModerator();

// Routes

// Main moderation endpoint
app.post('/api/moderate', async (req, res) => {
    const { content, userId } = req.body;
    
    if (content === undefined || content === null) {
        return res.status(400).json({ error: 'Content parameter is required' });
    }
    
    try {
        const result = await moderator.moderate(content, userId);
        
        // Update trust score asynchronously
        if (userId) {
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

// Admin: Add/update blocked word
app.post('/api/admin/blocked-words', async (req, res) => {
    const { word, severity = 'medium', adminKey } = req.body;
    
    if (!config.adminKey || adminKey !== config.adminKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
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

// Admin: Remove blocked word
app.delete('/api/admin/blocked-words/:word', async (req, res) => {
    const { word } = req.params;
    const { adminKey } = req.query;
    
    if (!config.adminKey || adminKey !== config.adminKey) {
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

// Admin: Get moderation statistics
app.get('/api/admin/stats', async (req, res) => {
    const { adminKey, hours = 24 } = req.query;
    
    if (!config.adminKey || adminKey !== config.adminKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        // Overall stats
        const stats = await pgPool.query(`
            SELECT 
                COUNT(*) as total_moderated,
                SUM(CASE WHEN approved THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN NOT approved THEN 1 ELSE 0 END) as rejected_count,
                AVG(confidence) as avg_confidence
            FROM moderation_logs
            WHERE created_at > NOW() - INTERVAL '${parseInt(hours)} hours'
        `);
        
        // Rejection reasons
        const reasons = await pgPool.query(`
            SELECT reason, COUNT(*) as count
            FROM moderation_logs
            WHERE NOT approved AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'
            GROUP BY reason
            ORDER BY count DESC
        `);
        
        // Top flagged words
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

// Health check
app.get('/api/health', async (req, res) => {
    try {
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
    process.exit(0);
});

// Start server
const server = app.listen(port, () => {
    console.log(`Moderation service running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Admin endpoints: ${config.adminKey ? 'enabled' : 'disabled'}`);
});