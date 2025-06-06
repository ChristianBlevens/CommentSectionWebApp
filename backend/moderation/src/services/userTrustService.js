const pool = require('../db/connection');
const config = require('../config');

class UserTrustService {
  async getUserTrust(userId) {
    const result = await pool.query(
      'SELECT * FROM trusted_users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create new trust record
      const newUser = await pool.query(
        `INSERT INTO trusted_users (id) 
         VALUES ($1) 
         ON CONFLICT (id) DO NOTHING 
         RETURNING *`,
        [userId]
      );
      
      return newUser.rows[0] || { id: userId, trust_score: 0.5 };
    }
    
    return result.rows[0];
  }
  
  async updateUserMetrics(userId, metrics) {
    const {
      totalComments = 0,
      approvedComments = 0,
      flaggedComments = 0,
      reportedComments = 0,
      helpfulReports = 0,
      falseReports = 0,
    } = metrics;
    
    await pool.query(
      `INSERT INTO trusted_users (
        id, total_comments, approved_comments, flagged_comments,
        reported_comments, helpful_reports, false_reports
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        total_comments = trusted_users.total_comments + EXCLUDED.total_comments,
        approved_comments = trusted_users.approved_comments + EXCLUDED.approved_comments,
        flagged_comments = trusted_users.flagged_comments + EXCLUDED.flagged_comments,
        reported_comments = trusted_users.reported_comments + EXCLUDED.reported_comments,
        helpful_reports = trusted_users.helpful_reports + EXCLUDED.helpful_reports,
        false_reports = trusted_users.false_reports + EXCLUDED.false_reports,
        last_activity = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        totalComments,
        approvedComments,
        flaggedComments,
        reportedComments,
        helpfulReports,
        falseReports,
      ]
    );
    
    // Recalculate trust score
    await this.recalculateTrustScore(userId);
  }
  
  async recalculateTrustScore(userId) {
    const user = await this.getUserTrust(userId);
    
    if (!user) return;
    
    let score = 0.5; // Base score
    
    // Positive factors
    if (user.total_comments > 0) {
      const approvalRate = user.approved_comments / user.total_comments;
      score += approvalRate * 0.3;
    }
    
    if (user.helpful_reports > 0) {
      score += Math.min(user.helpful_reports * 0.02, 0.2);
    }
    
    // Negative factors
    if (user.total_comments > 0) {
      const flagRate = user.flagged_comments / user.total_comments;
      score -= flagRate * 0.4;
    }
    
    if (user.false_reports > 0) {
      score -= Math.min(user.false_reports * 0.05, 0.3);
    }
    
    // Ensure score is within bounds
    score = Math.max(config.moderation.minTrustScore, 
                    Math.min(config.moderation.maxTrustScore, score));
    
    await pool.query(
      'UPDATE trusted_users SET trust_score = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId, score]
    );
    
    return score;
  }
  
  async getTopTrustedUsers(limit = 10) {
    const result = await pool.query(
      `SELECT id, trust_score, total_comments, approved_comments
       FROM trusted_users
       WHERE total_comments > 5
       ORDER BY trust_score DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
  
  async getLowTrustUsers(threshold = 0.3, limit = 20) {
    const result = await pool.query(
      `SELECT id, trust_score, total_comments, flagged_comments, false_reports
       FROM trusted_users
       WHERE trust_score < $1 AND total_comments > 0
       ORDER BY trust_score ASC
       LIMIT $2`,
      [threshold, limit]
    );
    
    return result.rows;
  }
  
  async getUserStats(userId) {
    const user = await this.getUserTrust(userId);
    
    if (!user) {
      return {
        trustScore: 0.5,
        totalComments: 0,
        approvalRate: 0,
        reportAccuracy: 0,
      };
    }
    
    const approvalRate = user.total_comments > 0
      ? user.approved_comments / user.total_comments
      : 0;
    
    const totalReports = user.helpful_reports + user.false_reports;
    const reportAccuracy = totalReports > 0
      ? user.helpful_reports / totalReports
      : 0;
    
    return {
      trustScore: user.trust_score,
      totalComments: user.total_comments,
      approvalRate,
      reportAccuracy,
      flaggedComments: user.flagged_comments,
      reportedComments: user.reported_comments,
    };
  }
}

module.exports = new UserTrustService();