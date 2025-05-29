// moderation-server.js - Content Moderation Service
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const natural = require('natural');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database for moderation logs
const pgPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'moderation_db',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5433, // Different port for separate database
});

// Initialize database
const initDatabase = async () => {
    try {
        // Moderation logs table
        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS moderation_logs (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                approved BOOLEAN NOT NULL,
                reason VARCHAR(255),
                confidence FLOAT,
                flagged_words TEXT[],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Blocked words table
        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS blocked_words (
                id SERIAL PRIMARY KEY,
                word VARCHAR(255) UNIQUE NOT NULL,
                severity VARCHAR(50) DEFAULT 'medium',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Trusted users table
        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS trusted_users (
                id VARCHAR(255) PRIMARY KEY,
                trust_score FLOAT DEFAULT 0.5,
                total_comments INTEGER DEFAULT 0,
                flagged_comments INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Initialize with some default blocked words
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

        for (const word of defaultBlockedWords) {
            await pgPool.query(
                `INSERT INTO blocked_words (word, severity) 
                 VALUES ($1, $2) 
                 ON CONFLICT (word) DO NOTHING`,
                [word.word, word.severity]
            );
        }

        console.log('Moderation database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
};

initDatabase();

// Natural Language Processing setup
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const sentiment = new natural.SentimentAnalyzer('English', stemmer, 'afinn');

// Moderation class
class ContentModerator {
    constructor() {
        this.blockedWords = new Map();
        this.loadBlockedWords();
    }

    async loadBlockedWords() {
        try {
            const result = await pgPool.query('SELECT word, severity FROM blocked_words');
            result.rows.forEach(row => {
                this.blockedWords.set(row.word.toLowerCase(), row.severity);
            });
        } catch (error) {
            console.error('Error loading blocked words:', error);
        }
    }

    async moderate(content, userId = null) {
        const result = {
            approved: true,
            reason: null,
            confidence: 1.0,
            flaggedWords: [],
            suggestions: []
        };

        // Check for empty content
        if (!content || content.trim().length === 0) {
            result.approved = false;
            result.reason = 'Empty content';
            result.confidence = 1.0;
            return result;
        }

        // Check content length
        if (content.length > 5000) {
            result.approved = false;
            result.reason = 'Content too long';
            result.confidence = 1.0;
            return result;
        }

        // IMPORTANT: Check for custom HTML/CSS/JS in raw input BEFORE any processing
        const hasCustomCode = this.checkForCustomCode(content);
        if (hasCustomCode) {
            result.approved = false;
            result.reason = 'HTML, CSS, or JavaScript code is not allowed';
            result.confidence = 1.0;
            return result;
        }

        // Check for links (links are not allowed except in image/video embeds)
        const hasLinks = this.checkForLinks(content);
        if (hasLinks) {
            result.approved = false;
            result.reason = 'Links are not allowed (except in image/video embeds)';
            result.confidence = 1.0;
            return result;
        }

        // Tokenize and analyze
        const tokens = tokenizer.tokenize(content.toLowerCase());
        
        // Check for blocked words
        const foundBlockedWords = [];
        let severityScore = 0;
        
        for (const token of tokens) {
            if (this.blockedWords.has(token)) {
                const severity = this.blockedWords.get(token);
                foundBlockedWords.push({ word: token, severity });
                
                switch (severity) {
                    case 'low': severityScore += 1; break;
                    case 'medium': severityScore += 3; break;
                    case 'high': severityScore += 5; break;
                }
            }
        }

        // Check for spam patterns
        const spamScore = this.checkSpamPatterns(content);
        
        // Sentiment analysis
        const sentimentScore = sentiment.getSentiment(tokens);
        
        // Check for excessive caps
        const capsRatio = this.getCapsRatio(content);
        
        // Check for repeated characters
        const hasExcessiveRepetition = this.checkRepetition(content);
        
        // User trust score
        let trustScore = 0.5;
        if (userId) {
            trustScore = await this.getUserTrustScore(userId);
        }
        
        // Calculate final decision
        if (foundBlockedWords.length > 0 && severityScore >= 5) {
            result.approved = false;
            result.reason = 'Contains prohibited language';
            result.flaggedWords = foundBlockedWords.map(w => w.word);
            result.confidence = 0.9;
        } else if (spamScore > 0.7) {
            result.approved = false;
            result.reason = 'Detected as spam';
            result.confidence = spamScore;
        } else if (sentimentScore < -3) {
            result.approved = false;
            result.reason = 'Extremely negative content';
            result.confidence = 0.8;
        } else if (capsRatio > 0.8) {
            result.approved = false;
            result.reason = 'Excessive capitalization';
            result.confidence = 0.9;
        } else if (hasExcessiveRepetition) {
            result.approved = false;
            result.reason = 'Excessive character repetition';
            result.confidence = 0.85;
        }

        // Adjust based on trust score
        if (!result.approved && trustScore > 0.8) {
            // Give trusted users benefit of doubt for borderline cases
            if (result.confidence < 0.7) {
                result.approved = true;
                result.reason = null;
            }
        }

        // Log the moderation result
        await this.logModeration(content, result);

        return result;
    }

    checkSpamPatterns(content) {
        let spamScore = 0;
        
        // Check for common spam phrases
        const spamPhrases = [
            'click here', 'buy now', 'limited offer', 'act now',
            'make money', 'work from home', 'congratulations you won',
            'increase your', 'free gift', 'risk free'
        ];
        
        const lowerContent = content.toLowerCase();
        for (const phrase of spamPhrases) {
            if (lowerContent.includes(phrase)) {
                spamScore += 0.2;
            }
        }
        
        // Check for excessive exclamation marks
        const exclamationCount = (content.match(/!/g) || []).length;
        if (exclamationCount > 5) {
            spamScore += 0.3;
        }
        
        // Check for phone number patterns
        const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
        if (phonePattern.test(content)) {
            spamScore += 0.4;
        }
        
        return Math.min(spamScore, 1.0);
    }

    getCapsRatio(content) {
        const letters = content.replace(/[^a-zA-Z]/g, '');
        if (letters.length === 0) return 0;
        
        const upperCount = (letters.match(/[A-Z]/g) || []).length;
        return upperCount / letters.length;
    }

    checkRepetition(content) {
        // Check for repeated characters (e.g., "hiiiiiii")
        const repeatedPattern = /(.)\1{4,}/;
        return repeatedPattern.test(content);
    }

    checkForLinks(content) {
        // First, remove image and video embeds from the content
        let filteredContent = content;
        
        // Remove markdown images: ![alt](url)
        filteredContent = filteredContent.replace(/!\[.*?\]\(.*?\)/g, '');
        
        // Remove markdown video embeds: !video[alt](url)
        filteredContent = filteredContent.replace(/!video\[.*?\]\(.*?\)/g, '');
        
        // Remove HTML img tags
        filteredContent = filteredContent.replace(/<img[^>]+>/gi, '');
        
        // Remove HTML video tags
        filteredContent = filteredContent.replace(/<video[^>]+>[\s\S]*?<\/video>/gi, '');
        
        // Remove iframe tags (for embedded videos)
        filteredContent = filteredContent.replace(/<iframe[^>]+>[\s\S]*?<\/iframe>/gi, '');
        
        // Now check for URLs in the filtered content
        const urlPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+\.(com|org|net|io|co|uk|ca|de|fr|jp|au|us|ru|ch|it|nl|se|no|es|mil|edu|gov)[^\s]*)/gi;
        return urlPattern.test(filteredContent);
    }

    checkForCustomCode(content) {
        // Check raw user input for any HTML/CSS/JS before processing
        
        // Check for any HTML tags
        const htmlTagPattern = /<[^>]+>/gi;
        
        // Check for HTML entities that might be used to bypass
        const htmlEntityPattern = /&[#a-zA-Z0-9]+;/gi;
        
        // Check for javascript: protocol
        const jsProtocolPattern = /javascript\s*:/gi;
        
        // Check for event handler attributes (even without tags)
        const eventHandlerPattern = /on\w+\s*=/gi;
        
        // Check for style attributes
        const styleAttributePattern = /style\s*=/gi;
        
        // Check for CSS expressions
        const cssExpressionPattern = /expression\s*\(/gi;
        
        // Check for CSS @import
        const cssImportPattern = /@import/gi;
        
        // Check for data URIs that might contain scripts
        const dataUriPattern = /data:[^,]*script[^,]*,/gi;
        
        // Check for vbscript: protocol
        const vbScriptPattern = /vbscript\s*:/gi;
        
        // Check for base64 encoded scripts
        const base64ScriptPattern = /base64[^'"]*script/gi;
        
        return htmlTagPattern.test(content) ||
               htmlEntityPattern.test(content) ||
               jsProtocolPattern.test(content) ||
               eventHandlerPattern.test(content) ||
               styleAttributePattern.test(content) ||
               cssExpressionPattern.test(content) ||
               cssImportPattern.test(content) ||
               dataUriPattern.test(content) ||
               vbScriptPattern.test(content) ||
               base64ScriptPattern.test(content);
    }

    async getUserTrustScore(userId) {
        try {
            const result = await pgPool.query(
                'SELECT trust_score FROM trusted_users WHERE id = $1',
                [userId]
            );
            
            if (result.rows.length > 0) {
                return result.rows[0].trust_score;
            }
            
            // Initialize new user
            await pgPool.query(
                'INSERT INTO trusted_users (id) VALUES ($1) ON CONFLICT DO NOTHING',
                [userId]
            );
            
            return 0.5; // Default trust score
        } catch (error) {
            console.error('Error getting trust score:', error);
            return 0.5;
        }
    }

    async updateUserTrustScore(userId, wasApproved) {
        try {
            const client = await pgPool.connect();
            await client.query('BEGIN');
            
            // Get current stats
            const result = await client.query(
                'SELECT trust_score, total_comments, flagged_comments FROM trusted_users WHERE id = $1',
                [userId]
            );
            
            let trustScore = 0.5;
            let totalComments = 0;
            let flaggedComments = 0;
            
            if (result.rows.length > 0) {
                trustScore = result.rows[0].trust_score;
                totalComments = result.rows[0].total_comments;
                flaggedComments = result.rows[0].flagged_comments;
            }
            
            // Update stats
            totalComments++;
            if (!wasApproved) {
                flaggedComments++;
            }
            
            // Calculate new trust score
            if (totalComments >= 5) {
                trustScore = 1 - (flaggedComments / totalComments);
                trustScore = Math.max(0.1, Math.min(1.0, trustScore));
            }
            
            // Update database
            await client.query(
                `INSERT INTO trusted_users (id, trust_score, total_comments, flagged_comments) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (id) DO UPDATE 
                 SET trust_score = $2, total_comments = $3, flagged_comments = $4, updated_at = CURRENT_TIMESTAMP`,
                [userId, trustScore, totalComments, flaggedComments]
            );
            
            await client.query('COMMIT');
            client.release();
        } catch (error) {
            console.error('Error updating trust score:', error);
        }
    }

    async logModeration(content, result) {
        try {
            await pgPool.query(
                `INSERT INTO moderation_logs (content, approved, reason, confidence, flagged_words) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [content, result.approved, result.reason, result.confidence, result.flaggedWords]
            );
        } catch (error) {
            console.error('Error logging moderation:', error);
        }
    }
}

// Initialize moderator
const moderator = new ContentModerator();

// Routes

// Moderate content
app.post('/api/moderate', async (req, res) => {
    const { content, userId } = req.body;
    
    try {
        const result = await moderator.moderate(content, userId);
        
        // Update user trust score
        if (userId) {
            await moderator.updateUserTrustScore(userId, result.approved);
        }
        
        res.json(result);
    } catch (error) {
        console.error('Moderation error:', error);
        res.status(500).json({ 
            approved: false, 
            reason: 'Moderation service error',
            error: error.message 
        });
    }
});

// Add blocked word (admin endpoint)
app.post('/api/admin/blocked-words', async (req, res) => {
    const { word, severity = 'medium', adminKey } = req.body;
    
    // Simple admin authentication
    if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        await pgPool.query(
            'INSERT INTO blocked_words (word, severity) VALUES ($1, $2) ON CONFLICT (word) DO UPDATE SET severity = $2',
            [word.toLowerCase(), severity]
        );
        
        // Reload blocked words
        await moderator.loadBlockedWords();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Add blocked word error:', error);
        res.status(500).json({ error: 'Failed to add blocked word' });
    }
});

// Get moderation stats (admin endpoint)
app.get('/api/admin/stats', async (req, res) => {
    const { adminKey } = req.query;
    
    if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const stats = await pgPool.query(`
            SELECT 
                COUNT(*) as total_moderated,
                SUM(CASE WHEN approved THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN NOT approved THEN 1 ELSE 0 END) as rejected_count,
                AVG(confidence) as avg_confidence
            FROM moderation_logs
            WHERE created_at > NOW() - INTERVAL '24 hours'
        `);
        
        const reasons = await pgPool.query(`
            SELECT reason, COUNT(*) as count
            FROM moderation_logs
            WHERE NOT approved AND created_at > NOW() - INTERVAL '24 hours'
            GROUP BY reason
            ORDER BY count DESC
        `);
        
        res.json({
            stats: stats.rows[0],
            rejectionReasons: reasons.rows
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.listen(port, () => {
    console.log(`Moderation service running on port ${port}`);
});

// package.json
/*
{
  "name": "comment-moderation-service",
  "version": "1.0.0",
  "description": "Content moderation service for comment system",
  "main": "moderation-server.js",
  "scripts": {
    "start": "node moderation-server.js",
    "dev": "nodemon moderation-server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "pg": "^8.11.3",
    "natural": "^6.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
*/

// docker-compose.yml for moderation database
/*
version: '3.8'

services:
  postgres-moderation:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: moderation_db
    ports:
      - "5433:5432"
    volumes:
      - postgres_moderation_data:/var/lib/postgresql/data

volumes:
  postgres_moderation_data:
*/