const redis = require('redis');
const config = require('../config');

// Create Redis client
const client = redis.createClient({
  url: config.redis.url,
  socket: {
    reconnectStrategy: config.redis.reconnectStrategy,
  },
});

// Handle Redis events
client.on('error', (err) => console.error('Redis Client Error:', err));
client.on('connect', () => console.log('Redis connected successfully'));
client.on('reconnecting', () => console.log('Redis reconnecting...'));

// Connect to Redis
client.connect().catch((err) => {
  console.error('Redis connection failed:', err);
  // Continue without cache if Redis fails
});

// Helper function for safe Redis operations
const safeRedisOp = async (operation, fallback = null) => {
  try {
    if (!client.isReady) return fallback;
    return await operation();
  } catch (error) {
    console.error('Redis operation failed:', error);
    return fallback;
  }
};

module.exports = {
  client,
  safeRedisOp,
};