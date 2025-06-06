const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const { requireAdminKey } = require('../middleware/auth');

// Health check (public)
router.get('/', healthController.checkHealth);

// Stats (admin only)
router.get('/stats', requireAdminKey, healthController.getStats);

module.exports = router;