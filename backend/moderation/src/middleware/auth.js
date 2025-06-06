const config = require('../config');

function requireAdminKey(req, res, next) {
  if (!config.admin.isConfigured) {
    return res.status(503).json({ 
      error: 'Admin features not configured',
      message: 'Please set ADMIN_KEY in environment variables',
    });
  }
  
  const providedKey = req.headers['x-admin-key'] || req.query.admin_key;
  
  if (!providedKey) {
    return res.status(401).json({ error: 'Admin key required' });
  }
  
  if (providedKey !== config.admin.key) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }
  
  next();
}

module.exports = {
  requireAdminKey,
};