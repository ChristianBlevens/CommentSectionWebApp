const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderationController');
const { requireAdminKey } = require('../middleware/auth');

// All admin routes require admin key
router.use(requireAdminKey);

// Blocked words management
router.post('/blocked-words', moderationController.addBlockedWord);
router.delete('/blocked-words/:id', moderationController.removeBlockedWord);

// User trust management
router.get('/users/trusted', moderationController.getTopTrustedUsers);
router.get('/users/suspicious', moderationController.getLowTrustUsers);

module.exports = router;