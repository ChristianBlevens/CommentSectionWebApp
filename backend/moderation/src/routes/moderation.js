const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderationController');

// Moderate content (public API for backend service)
router.post('/moderate', moderationController.moderate);

// User trust endpoints
router.get('/users/:userId/trust', moderationController.getUserTrust);
router.post('/users/:userId/metrics', moderationController.updateUserMetrics);

// Blocked words endpoints (public read, admin write)
router.get('/blocked-words', moderationController.getBlockedWords);

module.exports = router;