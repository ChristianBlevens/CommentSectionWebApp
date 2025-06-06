const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Discord OAuth callback
router.post('/discord/callback', authLimiter, authController.discordCallback);

// Logout
router.post('/logout', authController.logout);

// Get current session
router.get('/session', authenticateUser, authController.getSession);

// Refresh session
router.post('/refresh', authController.refreshSession);

module.exports = router;