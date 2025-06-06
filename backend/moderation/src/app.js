const express = require('express');
const cors = require('cors');
const config = require('./config');

// Import routes
const moderationRoutes = require('./routes/moderation');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

// Import services
const moderationService = require('./services/moderationService');

// Create Express app
const app = express();

// Middleware
app.use(cors(config.cors));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Routes
app.use('/api', moderationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);

// Legacy health endpoint
app.get('/health', (req, res) => res.redirect('/api/health'));

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

// Initialize moderation service
moderationService.initialize().catch(err => {
  console.error('Failed to initialize moderation service:', err);
});

module.exports = app;