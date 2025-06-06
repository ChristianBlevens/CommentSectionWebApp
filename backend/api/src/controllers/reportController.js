const reportService = require('../services/reportService');

class ReportController {
  async createReport(req, res) {
    const { id: commentId } = req.params;
    const { reason } = req.body;
    
    try {
      const result = await reportService.createReport({
        commentId,
        reporterId: req.user.id,
        reason,
      });
      
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      
      res.status(201).json({
        message: 'Report submitted successfully',
        report: result,
      });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ error: 'Failed to submit report' });
    }
  }
  
  async getReports(req, res) {
    const { pageId, status } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    try {
      const reports = await reportService.getReports({
        pageId,
        status,
        limit,
        offset,
      });
      
      const stats = await reportService.getReportStats();
      
      res.json({
        reports,
        stats,
        pagination: {
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  }
  
  async resolveReport(req, res) {
    const { id } = req.params;
    const { action, notes } = req.body;
    
    if (!['deleted', 'banned', 'dismissed', 'warned'].includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Must be one of: deleted, banned, dismissed, warned' 
      });
    }
    
    try {
      const result = await reportService.resolveReport(
        id,
        req.user.id,
        action,
        notes
      );
      
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({
        message: 'Report resolved successfully',
        report: result,
      });
    } catch (error) {
      console.error('Error resolving report:', error);
      res.status(500).json({ error: 'Failed to resolve report' });
    }
  }
  
  async dismissReport(req, res) {
    const { id } = req.params;
    
    try {
      const result = await reportService.dismissReport(id, req.user.id);
      
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({
        message: 'Report dismissed successfully',
        report: result,
      });
    } catch (error) {
      console.error('Error dismissing report:', error);
      res.status(500).json({ error: 'Failed to dismiss report' });
    }
  }
  
  async getPageReports(req, res) {
    const { pageId } = req.params;
    
    try {
      const reports = await reportService.getReportsByPage(pageId);
      
      res.json({
        reports,
        pageId,
      });
    } catch (error) {
      console.error('Error fetching page reports:', error);
      res.status(500).json({ error: 'Failed to fetch page reports' });
    }
  }
}

module.exports = new ReportController();