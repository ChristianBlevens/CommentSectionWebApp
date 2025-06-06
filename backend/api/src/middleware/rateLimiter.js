const rateLimit = require('express-rate-limit');
const { client: redisClient } = require('../db/redis');
const config = require('../config');

// Create rate limiter factory
function createRateLimiter(windowMs, max, message) {
  const options = {
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.user && req.user.is_moderator, // Skip for moderators
  };
  
  // Use Redis store in production if available
  if (config.server.isProduction && redisClient.isReady) {
    const RedisStore = require('rate-limit-redis');
    options.store = new RedisStore({
      client: redisClient,
      prefix: 'rate-limit:',
    });
  }
  
  return rateLimit(options);
}

// Different rate limiters for different endpoints
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5,
  'Too many authentication attempts'
);

const generalLimiter = createRateLimiter(
  config.rateLimit.windowMs,
  config.rateLimit.maxRequests,
  'Too many requests'
);

const strictLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10,
  'Too many requests'
);

const commentLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  10,
  'Too many comments, please slow down'
);

const reportLimiter = createRateLimiter(
  config.security.reportWindowMs,
  config.security.maxReportsPerWindow,
  'Too many reports submitted'
);

module.exports = {
  authLimiter,
  generalLimiter,
  strictLimiter,
  commentLimiter,
  reportLimiter,
};