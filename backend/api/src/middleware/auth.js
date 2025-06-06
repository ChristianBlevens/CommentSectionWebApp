const pool = require('../db/connection');
const { safeRedisOp, client: redisClient } = require('../db/redis');

async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Get user ID from Redis session
    const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    
    // Get user from database
    const userResult = await pool.query(
      'SELECT id, name, email, picture, is_moderator, is_banned FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'User is banned' });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

function requireModerator(req, res, next) {
  if (!req.user || !req.user.is_moderator) {
    return res.status(403).json({ error: 'Moderator access required' });
  }
  next();
}

// Optional authentication - attaches user if authenticated but doesn't require it
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  const token = authHeader.substring(7);
  
  try {
    const userId = await safeRedisOp(() => redisClient.get(`session:${token}`));
    
    if (userId) {
      const userResult = await pool.query(
        'SELECT id, name, email, picture, is_moderator, is_banned FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length > 0 && !userResult.rows[0].is_banned) {
        req.user = userResult.rows[0];
      }
    }
  } catch (error) {
    console.error('Optional auth error:', error);
  }
  
  next();
}

module.exports = {
  authenticateUser,
  requireModerator,
  optionalAuth,
};