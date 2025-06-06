const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '3001'),
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
  },

  // Database configuration
  database: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'moderation_db',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // CORS configuration
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.ALLOWED_ORIGINS?.split(',') || '*')
      : '*',
    credentials: true,
  },

  // Admin configuration
  admin: {
    key: process.env.ADMIN_KEY,
    isConfigured: process.env.ADMIN_KEY && process.env.ADMIN_KEY !== 'your_secure_admin_key_here',
  },

  // Moderation thresholds
  moderation: {
    spamThreshold: parseFloat(process.env.SPAM_THRESHOLD || '0.7'),
    sentimentThreshold: parseFloat(process.env.SENTIMENT_THRESHOLD || '-3'),
    capsRatioThreshold: parseFloat(process.env.CAPS_RATIO_THRESHOLD || '0.8'),
    minTrustScore: parseFloat(process.env.MIN_TRUST_SCORE || '0.1'),
    maxTrustScore: parseFloat(process.env.MAX_TRUST_SCORE || '1.0'),
    maxLinksAllowed: parseInt(process.env.MAX_LINKS_ALLOWED || '3'),
    minCommentLength: 1,
    maxCommentLength: 5000,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate admin configuration
if (!config.admin.isConfigured) {
  console.warn('WARNING: Admin key not properly configured!');
  console.warn('Admin endpoints will be disabled. Set ADMIN_KEY in .env file');
}

module.exports = config;