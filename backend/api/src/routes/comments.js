const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const reportController = require('../controllers/reportController');
const { authenticateUser, optionalAuth } = require('../middleware/auth');
const { validateRequest, sanitizeContent } = require('../middleware/validation');
const { commentLimiter, reportLimiter } = require('../middleware/rateLimiter');

// Get comments for a page (public)
router.get('/page/:pageId', optionalAuth, commentController.getComments);

// Create a comment (authenticated)
router.post(
  '/',
  authenticateUser,
  commentLimiter,
  validateRequest('comment'),
  sanitizeContent,
  commentController.createComment
);

// Update a comment (authenticated, owner only)
router.put(
  '/:id',
  authenticateUser,
  validateRequest('comment'),
  sanitizeContent,
  commentController.updateComment
);

// Delete a comment (authenticated, owner or moderator)
router.delete('/:id', authenticateUser, commentController.deleteComment);

// Vote on a comment (authenticated)
router.post(
  '/:id/vote',
  authenticateUser,
  validateRequest('vote'),
  commentController.voteComment
);

// Report a comment (authenticated)
router.post(
  '/:id/report',
  authenticateUser,
  reportLimiter,
  validateRequest('report'),
  reportController.createReport
);

// Get user's comments (public)
router.get('/user/:userId', commentController.getUserComments);

module.exports = router;