const pool = require('../db/connection');
const { client: redisClient } = require('../db/redis');
const moderationClient = require('../services/moderationClient');
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
      health.status = 'degraded';
    }
    
    // Check Redis
    try {
      if (redisClient.isReady) {
        await redisClient.ping();
        health.services.redis = { status: 'healthy' };
      } else {
        health.services.redis = { status: 'unhealthy', error: 'Not connected' };
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.redis = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }
    
    // Check moderation service
    try {
      const moderationHealth = await moderationClient.checkHealth();
      health.services.moderation = moderationHealth;
    } catch (error) {
      health.services.moderation = { status: 'unhealthy', error: error.message };
      // Don't degrade overall health for moderation service
    }
    
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  }
  
  async getConfig(req, res) {
    // Log config request for debugging
    console.log('Config requested, Discord configured:', config.discord.isConfigured);
    
    // Return public configuration for frontend
    const publicConfig = {
      discordClientId: config.discord.clientId,
      redirectUri: config.discord.redirectUri,
      maxCommentLength: config.security.maxCommentLength,
      maxReportLength: config.security.maxReportLength,
      environment: config.server.env,
      discordConfigured: config.discord.isConfigured,
    };
    
    // Log what we're sending (without sensitive data)
    console.log('Sending config:', {
      ...publicConfig,
      discordClientId: publicConfig.discordClientId ? 'set' : 'not set',
    });
    
    res.json(publicConfig);
  }
  
  async getStats(req, res) {
    if (!req.user?.is_moderator) {
      return res.status(403).json({ error: 'Moderator access required' });
    }
    
    try {
      const dbStats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM users WHERE is_moderator = true) as total_moderators,
          (SELECT COUNT(*) FROM users WHERE is_banned = true) as banned_users,
          (SELECT COUNT(*) FROM comments) as total_comments,
          (SELECT COUNT(*) FROM comments WHERE is_deleted = true) as deleted_comments,
          (SELECT COUNT(*) FROM reports) as total_reports,
          (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports
      `);
      
      res.json({
        database: dbStats.rows[0],
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
        },
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }
}

module.exports = new HealthController();