const userService = require('../services/userService');
const commentService = require('../services/commentService');

class UserController {
  async getUser(req, res) {
    const { id } = req.params;
    
    try {
      const user = await userService.findById(id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Don't expose sensitive data
      const publicUser = {
        id: user.id,
        name: user.name,
        picture: user.picture,
        is_moderator: user.is_moderator,
        created_at: user.created_at,
      };
      
      res.json({ user: publicUser });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
  
  async getModerators(req, res) {
    try {
      const moderators = await userService.getModerators();
      res.json({ moderators });
    } catch (error) {
      console.error('Error fetching moderators:', error);
      res.status(500).json({ error: 'Failed to fetch moderators' });
    }
  }
  
  async updateModeratorStatus(req, res) {
    const { id } = req.params;
    const { is_moderator } = req.body;
    
    if (typeof is_moderator !== 'boolean') {
      return res.status(400).json({ error: 'is_moderator must be a boolean' });
    }
    
    try {
      const user = await userService.updateModeratorStatus(id, is_moderator);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        message: `User ${is_moderator ? 'promoted to' : 'removed from'} moderator`,
        user: {
          id: user.id,
          name: user.name,
          is_moderator: user.is_moderator,
        },
      });
    } catch (error) {
      console.error('Error updating moderator status:', error);
      res.status(500).json({ error: 'Failed to update moderator status' });
    }
  }
  
  async banUser(req, res) {
    const { id } = req.params;
    const { ban = true } = req.body;
    
    try {
      const user = await userService.updateBanStatus(id, ban);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        message: `User ${ban ? 'banned' : 'unbanned'} successfully`,
        user: {
          id: user.id,
          name: user.name,
          is_banned: user.is_banned,
        },
      });
    } catch (error) {
      console.error('Error banning user:', error);
      res.status(500).json({ error: 'Failed to ban user' });
    }
  }
  
  async searchUsers(req, res) {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    try {
      const users = await userService.searchUsers(q);
      res.json({ users });
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ error: 'Failed to search users' });
    }
  }
  
  async getBannedUsers(req, res) {
    try {
      const users = await userService.getBannedUsers();
      res.json({ users });
    } catch (error) {
      console.error('Error fetching banned users:', error);
      res.status(500).json({ error: 'Failed to fetch banned users' });
    }
  }
  
  async getUserStats(req, res) {
    const { id } = req.params;
    
    try {
      const user = await userService.findById(id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const comments = await commentService.getUserComments(id, 1000);
      
      const stats = {
        total_comments: comments.length,
        total_likes: comments.reduce((sum, c) => sum + c.likes, 0),
        total_dislikes: comments.reduce((sum, c) => sum + c.dislikes, 0),
        member_since: user.created_at,
      };
      
      res.json({ stats });
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({ error: 'Failed to fetch user stats' });
    }
  }
}

module.exports = new UserController();