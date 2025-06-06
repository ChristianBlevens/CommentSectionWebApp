const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateUser, requireModerator } = require('../middleware/auth');

// Get user info (public)
router.get('/:id', userController.getUser);

// Get user stats (public)
router.get('/:id/stats', userController.getUserStats);

// Search users (authenticated)
router.get('/search', authenticateUser, userController.searchUsers);

// Moderator routes
router.get('/moderators', authenticateUser, requireModerator, userController.getModerators);
router.put('/:id/moderator', authenticateUser, requireModerator, userController.updateModeratorStatus);
router.post('/:id/ban', authenticateUser, requireModerator, userController.banUser);
router.get('/banned', authenticateUser, requireModerator, userController.getBannedUsers);

module.exports = router;