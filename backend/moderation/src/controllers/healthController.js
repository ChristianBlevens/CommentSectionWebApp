const pool = require('../db/connection');
const config = require('../config');

class HealthController {
  async checkHealth(req, res) {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {},
    };
    
    // Check database
    try {
      await pool.query('SELECT 1');
      health.services.database = { status: 'healthy' };
    } catch (error) {
      health.services.database = { status: 'unhealthy', error: error.message };
      health.status = 'error';
    }
    
    // Check configuration
    health.services.configuration = {
      adminConfigured: config.admin.isConfigured,
      environment: config.server.env,
    };
    
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  }
  
  async getStats(req, res) {
    try {
      const stats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM moderation_logs) as total_moderations,
          (SELECT COUNT(*) FROM moderation_logs WHERE approved = false) as rejected_count,
          (SELECT COUNT(*) FROM blocked_words WHERE is_active = true) as active_blocked_words,
          (SELECT COUNT(*) FROM trusted_users) as tracked_users,
          (SELECT AVG(trust_score) FROM trusted_users) as avg_trust_score
      `);
      
      const recentActivity = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as moderations,
          COUNT(*) FILTER (WHERE approved = false) as rejections
        FROM moderation_logs
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);
      
      res.json({
        overview: stats.rows[0],
        recentActivity: recentActivity.rows,
        configuration: {
          spamThreshold: config.moderation.spamThreshold,
          sentimentThreshold: config.moderation.sentimentThreshold,
          capsRatioThreshold: config.moderation.capsRatioThreshold,
        },
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }
}

module.exports = new HealthController();