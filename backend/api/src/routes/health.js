const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// Health check (public)
router.get('/', healthController.checkHealth);

// Get public configuration (public)
router.get('/config', healthController.getConfig);

// Get system stats (moderator only)
router.get('/stats', healthController.getStats);

module.exports = router;