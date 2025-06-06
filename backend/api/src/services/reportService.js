const pool = require('../db/connection');
const config = require('../config');

class ReportService {
  async createReport(reportData) {
    const { commentId, reporterId, reason } = reportData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check rate limiting
      const rateLimit = await client.query(
        `SELECT report_count, window_start 
         FROM report_rate_limits 
         WHERE user_id = $1`,
        [reporterId]
      );
      
      const now = new Date();
      const windowStart = rateLimit.rows[0]?.window_start || now;
      const timeDiff = now - new Date(windowStart);
      
      if (rateLimit.rows.length > 0 && timeDiff < config.security.reportWindowMs) {
        if (rateLimit.rows[0].report_count >= config.security.maxReportsPerWindow) {
          await client.query('ROLLBACK');
          return { error: 'Rate limit exceeded. Please try again later.' };
        }
        
        // Increment count
        await client.query(
          'UPDATE report_rate_limits SET report_count = report_count + 1 WHERE user_id = $1',
          [reporterId]
        );
      } else {
        // Reset or create rate limit
        await client.query(
          `INSERT INTO report_rate_limits (user_id, report_count, window_start)
           VALUES ($1, 1, $2)
           ON CONFLICT (user_id) DO UPDATE
           SET report_count = 1, window_start = $2`,
          [reporterId, now]
        );
      }
      
      // Get comment details for snapshot
      const commentResult = await client.query(
        `SELECT c.*, u.name as author_name
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.id = $1`,
        [commentId]
      );
      
      if (commentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Comment not found' };
      }
      
      const comment = commentResult.rows[0];
      
      // Create report with comment snapshot
      const reportResult = await client.query(
        `INSERT INTO reports (
          comment_id, reporter_id, page_id, reason,
          comment_content, comment_author_id, comment_author_name, comment_created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (comment_id, reporter_id) DO NOTHING
        RETURNING *`,
        [
          commentId, reporterId, comment.page_id, reason,
          comment.content, comment.user_id, comment.author_name, comment.created_at
        ]
      );
      
      await client.query('COMMIT');
      
      if (reportResult.rows.length === 0) {
        return { error: 'You have already reported this comment' };
      }
      
      return reportResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async getReports(filters = {}) {
    const { pageId, status = 'pending', limit = 50, offset = 0 } = filters;
    
    let query = `
      SELECT 
        r.*,
        u.name as reporter_name,
        u.picture as reporter_picture,
        resolver.name as resolver_name
      FROM reports r
      JOIN users u ON r.reporter_id = u.id
      LEFT JOIN users resolver ON r.resolved_by = resolver.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (pageId) {
      params.push(pageId);
      query += ` AND r.page_id = $${++paramCount}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND r.status = $${++paramCount}`;
    }
    
    query += ` ORDER BY r.created_at DESC`;
    
    params.push(limit, offset);
    query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }
  
  async getReportsByPage(pageId) {
    return this.getReports({ pageId });
  }
  
  async resolveReport(reportId, resolvedBy, action, notes = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update report
      const reportResult = await client.query(
        `UPDATE reports 
         SET status = 'resolved', 
             resolved_at = CURRENT_TIMESTAMP,
             resolved_by = $2,
             resolution_action = $3,
             resolution_notes = $4
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [reportId, resolvedBy, action, notes]
      );
      
      if (reportResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Report not found or already resolved' };
      }
      
      const report = reportResult.rows[0];
      
      // Handle resolution action
      if (action === 'deleted' && report.comment_id) {
        // Soft delete the comment
        await client.query(
          `UPDATE comments 
           SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, deleted_by = $2
           WHERE id = $1`,
          [report.comment_id, resolvedBy]
        );
      } else if (action === 'banned') {
        // Ban the comment author
        await client.query(
          'UPDATE users SET is_banned = TRUE WHERE id = $1',
          [report.comment_author_id]
        );
      }
      
      // Update reporter's trust score based on resolution
      if (action === 'dismissed') {
        // False report - decrease trust
        await client.query(
          `UPDATE trusted_users 
           SET false_reports = false_reports + 1,
               trust_score = GREATEST(0, trust_score - 0.05)
           WHERE id = $1`,
          [report.reporter_id]
        );
      } else {
        // Helpful report - increase trust
        await client.query(
          `UPDATE trusted_users 
           SET helpful_reports = helpful_reports + 1,
               trust_score = LEAST(1, trust_score + 0.02)
           WHERE id = $1`,
          [report.reporter_id]
        );
      }
      
      await client.query('COMMIT');
      return report;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async dismissReport(reportId, dismissedBy) {
    return this.resolveReport(reportId, dismissedBy, 'dismissed');
  }
  
  async getReportStats() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed_count,
        COUNT(*) as total_count,
        COUNT(DISTINCT page_id) as affected_pages,
        COUNT(DISTINCT reporter_id) as unique_reporters
      FROM reports
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `);
    
    return result.rows[0];
  }
}

module.exports = new ReportService();