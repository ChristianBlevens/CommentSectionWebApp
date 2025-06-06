const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateUser, requireModerator } = require('../middleware/auth');

// All report routes require moderator access

// Get all reports
router.get('/', authenticateUser, requireModerator, reportController.getReports);

// Get reports for a specific page
router.get('/page/:pageId', authenticateUser, requireModerator, reportController.getPageReports);

// Resolve a report
router.put('/:id/resolve', authenticateUser, requireModerator, reportController.resolveReport);

// Dismiss a report
router.put('/:id/dismiss', authenticateUser, requireModerator, reportController.dismissReport);

module.exports = router;