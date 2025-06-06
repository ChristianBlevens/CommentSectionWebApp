const moderationService = require('../services/moderationService');
const userTrustService = require('../services/userTrustService');

class ModerationController {
  async moderate(req, res) {
    const { content, userId, pageId } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    try {
      const result = await moderationService.moderate(content, userId, pageId);
      res.json(result);
    } catch (error) {
      console.error('Moderation error:', error);
      res.status(500).json({ error: 'Moderation service error' });
    }
  }
  
  async getUserTrust(req, res) {
    const { userId } = req.params;
    
    try {
      const trust = await userTrustService.getUserTrust(userId);
      res.json({
        userId,
        trustScore: trust.trust_score,
        stats: await userTrustService.getUserStats(userId),
      });
    } catch (error) {
      console.error('Error fetching user trust:', error);
      res.status(500).json({ error: 'Failed to fetch user trust' });
    }
  }
  
  async updateUserMetrics(req, res) {
    const { userId } = req.params;
    const metrics = req.body;
    
    try {
      await userTrustService.updateUserMetrics(userId, metrics);
      const newScore = await userTrustService.recalculateTrustScore(userId);
      
      res.json({
        userId,
        trustScore: newScore,
        message: 'User metrics updated successfully',
      });
    } catch (error) {
      console.error('Error updating user metrics:', error);
      res.status(500).json({ error: 'Failed to update user metrics' });
    }
  }
  
  async getBlockedWords(req, res) {
    try {
      const words = await moderationService.getBlockedWords();
      res.json(words);
    } catch (error) {
      console.error('Error fetching blocked words:', error);
      res.status(500).json({ error: 'Failed to fetch blocked words' });
    }
  }
  
  async addBlockedWord(req, res) {
    const { word, severity, category } = req.body;
    
    if (!word) {
      return res.status(400).json({ error: 'Word is required' });
    }
    
    try {
      const result = await moderationService.addBlockedWord(word, severity, category);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error adding blocked word:', error);
      res.status(500).json({ error: 'Failed to add blocked word' });
    }
  }
  
  async removeBlockedWord(req, res) {
    const { id } = req.params;
    
    try {
      const result = await moderationService.removeBlockedWord(id);
      
      if (!result) {
        return res.status(404).json({ error: 'Blocked word not found' });
      }
      
      res.json({ message: 'Blocked word removed successfully', word: result });
    } catch (error) {
      console.error('Error removing blocked word:', error);
      res.status(500).json({ error: 'Failed to remove blocked word' });
    }
  }
  
  async getTopTrustedUsers(req, res) {
    const limit = parseInt(req.query.limit) || 10;
    
    try {
      const users = await userTrustService.getTopTrustedUsers(limit);
      res.json(users);
    } catch (error) {
      console.error('Error fetching top trusted users:', error);
      res.status(500).json({ error: 'Failed to fetch top trusted users' });
    }
  }
  
  async getLowTrustUsers(req, res) {
    const threshold = parseFloat(req.query.threshold) || 0.3;
    const limit = parseInt(req.query.limit) || 20;
    
    try {
      const users = await userTrustService.getLowTrustUsers(threshold, limit);
      res.json(users);
    } catch (error) {
      console.error('Error fetching low trust users:', error);
      res.status(500).json({ error: 'Failed to fetch low trust users' });
    }
  }
}

module.exports = new ModerationController();