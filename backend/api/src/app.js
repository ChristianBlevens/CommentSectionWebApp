const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const commentRoutes = require('./routes/comments');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');
const healthRoutes = require('./routes/health');

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors(config.cors));

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global rate limiting
app.use(generalLimiter);

// Health check routes (no /api prefix)
app.use('/health', healthRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);

// Legacy routes for backward compatibility
app.get('/api/health', (req, res) => res.redirect('/health'));
app.get('/api/config', (req, res) => res.redirect('/health/config'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(config.server.env === 'development' && { details: err.message }),
  });
});

module.exports = app;