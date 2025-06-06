const pool = require('../db/connection');
const nlpService = require('./nlpService');
const config = require('../config');

class ModerationService {
  constructor() {
    this.blockedWords = new Map();
    this.blockedWordsLastUpdate = 0;
    this.updateInterval = 60000; // 1 minute
  }
  
  async initialize() {
    await this.loadBlockedWords();
    // Refresh blocked words periodically
    setInterval(() => this.loadBlockedWords(), this.updateInterval);
  }
  
  async loadBlockedWords() {
    try {
      const result = await pool.query(
        'SELECT word, severity FROM blocked_words WHERE is_active = true'
      );
      
      this.blockedWords.clear();
      result.rows.forEach(row => {
        this.blockedWords.set(row.word.toLowerCase(), row.severity);
      });
      
      this.blockedWordsLastUpdate = Date.now();
      console.log(`Loaded ${this.blockedWords.size} blocked words`);
    } catch (error) {
      console.error('Error loading blocked words:', error);
    }
  }
  
  async moderate(content, userId = null, pageId = null) {
    const result = {
      approved: true,
      reason: null,
      confidence: 1.0,
      flaggedWords: [],
      suggestions: [],
      scores: {},
    };
    
    // Validate content
    if (!content || content.trim().length === 0) {
      result.approved = false;
      result.reason = 'Empty content';
      result.confidence = 1.0;
      return result;
    }
    
    const trimmedContent = content.trim();
    
    // Check content length
    if (trimmedContent.length < config.moderation.minCommentLength) {
      result.approved = false;
      result.reason = 'Content too short';
      result.confidence = 1.0;
      return result;
    }
    
    if (trimmedContent.length > config.moderation.maxCommentLength) {
      result.approved = false;
      result.reason = 'Content too long';
      result.confidence = 1.0;
      return result;
    }
    
    // Perform various checks
    const checks = await Promise.all([
      this.checkBlockedWords(trimmedContent),
      this.checkSpam(trimmedContent),
      this.checkSentiment(trimmedContent),
      this.checkFormat(trimmedContent),
      this.checkUserTrust(userId),
    ]);
    
    const [blockedWords, spam, sentiment, format, userTrust] = checks;
    
    // Aggregate results
    result.flaggedWords = blockedWords.flagged;
    result.scores = {
      spam: spam.score,
      sentiment: sentiment.score,
      toxicity: sentiment.toxicity,
      capsRatio: format.capsRatio,
      linkCount: format.linkCount,
      userTrust: userTrust.score,
    };
    
    // Apply rules
    if (blockedWords.severity === 'critical' || blockedWords.severity === 'high') {
      result.approved = false;
      result.reason = 'Contains prohibited content';
      result.confidence = 0.95;
    } else if (spam.score > config.moderation.spamThreshold) {
      result.approved = false;
      result.reason = 'Likely spam';
      result.confidence = spam.score;
    } else if (sentiment.score < config.moderation.sentimentThreshold) {
      result.approved = false;
      result.reason = 'Toxic content detected';
      result.confidence = Math.abs(sentiment.score) / 5;
    } else if (format.capsRatio > config.moderation.capsRatioThreshold) {
      result.suggestions.push('Please avoid excessive use of capital letters');
      if (format.capsRatio > 0.9) {
        result.approved = false;
        result.reason = 'Excessive capitals';
        result.confidence = 0.8;
      }
    } else if (format.linkCount > config.moderation.maxLinksAllowed) {
      result.approved = false;
      result.reason = 'Too many links';
      result.confidence = 0.9;
    }
    
    // Adjust based on user trust
    if (result.approved && userTrust.score < config.moderation.minTrustScore) {
      result.confidence *= 0.8;
    }
    
    // Log moderation decision
    await this.logModeration(content, result, userId, pageId);
    
    return result;
  }
  
  async checkBlockedWords(content) {
    const words = content.toLowerCase().split(/\s+/);
    const flagged = [];
    let maxSeverity = null;
    
    for (const word of words) {
      if (this.blockedWords.has(word)) {
        const severity = this.blockedWords.get(word);
        flagged.push(word);
        
        if (!maxSeverity || this.getSeverityLevel(severity) > this.getSeverityLevel(maxSeverity)) {
          maxSeverity = severity;
        }
      }
    }
    
    return { flagged, severity: maxSeverity };
  }
  
  async checkSpam(content) {
    const spamProbability = nlpService.calculateSpamProbability(content);
    const patterns = nlpService.findRepeatedPatterns(content);
    
    let score = spamProbability;
    
    // Increase score for repeated patterns
    if (patterns.hasRepeatedChars) score += 0.2;
    if (patterns.hasRepeatedWords) score += 0.3;
    
    return { score: Math.min(score, 1) };
  }
  
  async checkSentiment(content) {
    const sentiment = nlpService.calculateSentiment(content);
    
    // Map sentiment to toxicity score
    let toxicity = 0;
    if (sentiment.score < -2) {
      toxicity = Math.min(Math.abs(sentiment.score) / 5, 1);
    }
    
    return {
      score: sentiment.score,
      label: sentiment.label,
      toxicity,
    };
  }
  
  async checkFormat(content) {
    const capsRatio = nlpService.detectCapsRatio(content);
    const linkCount = nlpService.countLinks(content);
    
    return { capsRatio, linkCount };
  }
  
  async checkUserTrust(userId) {
    if (!userId) return { score: 0.5 };
    
    try {
      const result = await pool.query(
        'SELECT trust_score FROM trusted_users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length > 0) {
        return { score: result.rows[0].trust_score };
      }
      
      // Create new trust record
      await pool.query(
        'INSERT INTO trusted_users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [userId]
      );
      
      return { score: 0.5 };
    } catch (error) {
      console.error('Error checking user trust:', error);
      return { score: 0.5 };
    }
  }
  
  async updateUserTrust(userId, delta) {
    try {
      await pool.query(
        `UPDATE trusted_users 
         SET trust_score = LEAST(GREATEST(trust_score + $2, $3), $4),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId, delta, config.moderation.minTrustScore, config.moderation.maxTrustScore]
      );
    } catch (error) {
      console.error('Error updating user trust:', error);
    }
  }
  
  async logModeration(content, result, userId, pageId) {
    try {
      await pool.query(
        `INSERT INTO moderation_logs 
         (content, approved, reason, confidence, flagged_words, user_id, page_id,
          spam_score, toxicity_score, caps_ratio, link_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          content,
          result.approved,
          result.reason,
          result.confidence,
          result.flaggedWords,
          userId,
          pageId,
          result.scores?.spam || 0,
          result.scores?.toxicity || 0,
          result.scores?.capsRatio || 0,
          result.scores?.linkCount || 0,
        ]
      );
    } catch (error) {
      console.error('Error logging moderation:', error);
    }
  }
  
  getSeverityLevel(severity) {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return levels[severity] || 0;
  }
  
  async getBlockedWords() {
    const result = await pool.query(
      'SELECT * FROM blocked_words ORDER BY severity DESC, word ASC'
    );
    return result.rows;
  }
  
  async addBlockedWord(word, severity = 'medium', category = 'general') {
    const result = await pool.query(
      `INSERT INTO blocked_words (word, severity, category) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (word, pattern) DO UPDATE 
       SET severity = EXCLUDED.severity, category = EXCLUDED.category
       RETURNING *`,
      [word.toLowerCase(), severity, category]
    );
    
    await this.loadBlockedWords();
    return result.rows[0];
  }
  
  async removeBlockedWord(wordId) {
    const result = await pool.query(
      'DELETE FROM blocked_words WHERE id = $1 RETURNING *',
      [wordId]
    );
    
    await this.loadBlockedWords();
    return result.rows[0];
  }
}

module.exports = new ModerationService();