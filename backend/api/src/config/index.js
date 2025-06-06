const path = require('path');

// Validate required environment variables
const requiredEnvVars = {
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
};

// Check for required variables
for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value || value === `YOUR_${key}`) {
    console.error(`ERROR: ${key} not configured! Please set it in .env file`);
    process.exit(1);
  }
}

const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
  },

  // Database configuration
  database: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'comments_db',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis reconnection limit reached');
        return new Error('Redis reconnection failed');
      }
      return Math.min(retries * 100, 3000);
    },
  },

  // Discord OAuth configuration
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:8080/oauth-callback.html',
    apiEndpoint: 'https://discord.com/api',
  },

  // CORS configuration
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.ALLOWED_ORIGINS?.split(',') || '*')
      : '*',
    credentials: true,
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },

  // Session configuration
  session: {
    secret: process.env.SESSION_SECRET || 'default-dev-secret-change-in-production',
    duration: parseInt(process.env.SESSION_DURATION || '86400'), // 24 hours in seconds
  },

  // Moderation service
  moderation: {
    apiUrl: process.env.MODERATION_API_URL || 'http://localhost:3001',
  },

  // Initial moderators (Discord IDs)
  initialModerators: process.env.INITIAL_MODERATORS?.split(',').filter(Boolean) || [],

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // Security
  security: {
    maxCommentLength: 5000,
    maxReportLength: 500,
    maxReportsPerWindow: 5,
    reportWindowMs: 3600000, // 1 hour
  },
};

module.exports = config;