const commentService = require('../services/commentService');
const voteService = require('../services/voteService');
const moderationClient = require('../services/moderationClient');

class CommentController {
  async getComments(req, res) {
    const { pageId } = req.params;
    
    try {
      const comments = await commentService.getCommentsByPage(pageId);
      
      // If user is authenticated, get their votes
      let userVotes = {};
      if (req.user) {
        const commentIds = comments.map(c => c.id);
        userVotes = await voteService.getUserVotes(req.user.id, commentIds);
      }
      
      res.json({
        comments,
        userVotes,
        stats: await commentService.getCommentStats(pageId),
      });
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }
  
  async createComment(req, res) {
    const { content, pageId, parentId } = req.body;
    
    try {
      // Check content with moderation service
      const moderation = await moderationClient.checkContent(
        content,
        req.user.id,
        pageId
      );
      
      if (!moderation.approved) {
        return res.status(400).json({
          error: 'Comment rejected',
          reason: moderation.reason,
          suggestions: moderation.suggestions,
        });
      }
      
      // Create comment
      const comment = await commentService.createComment({
        pageId,
        userId: req.user.id,
        content,
        parentId,
      });
      
      // Update user metrics
      await moderationClient.updateUserMetrics(req.user.id, {
        totalComments: 1,
        approvedComments: 1,
      });
      
      // Fetch complete comment with user info
      const completeComment = await commentService.getCommentById(comment.id);
      
      res.status(201).json({
        comment: completeComment,
        moderation: {
          warnings: moderation.suggestions,
        },
      });
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  }
  
  async updateComment(req, res) {
    const { id } = req.params;
    const { content } = req.body;
    
    try {
      // Check content with moderation service
      const moderation = await moderationClient.checkContent(
        content,
        req.user.id
      );
      
      if (!moderation.approved) {
        return res.status(400).json({
          error: 'Comment rejected',
          reason: moderation.reason,
        });
      }
      
      const comment = await commentService.updateComment(
        id,
        content,
        req.user.id
      );
      
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found or unauthorized' });
      }
      
      res.json({ comment });
    } catch (error) {
      console.error('Error updating comment:', error);
      res.status(500).json({ error: 'Failed to update comment' });
    }
  }
  
  async deleteComment(req, res) {
    const { id } = req.params;
    
    try {
      const comment = await commentService.deleteComment(
        id,
        req.user.id,
        req.user.is_moderator
      );
      
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found or unauthorized' });
      }
      
      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }
  
  async voteComment(req, res) {
    const { id } = req.params;
    const { type } = req.body;
    
    try {
      const result = await voteService.vote(id, req.user.id, type);
      res.json(result);
    } catch (error) {
      console.error('Error voting on comment:', error);
      res.status(500).json({ error: 'Failed to vote on comment' });
    }
  }
  
  async getUserComments(req, res) {
    const { userId } = req.params;
    
    try {
      const comments = await commentService.getUserComments(userId);
      res.json({ comments });
    } catch (error) {
      console.error('Error fetching user comments:', error);
      res.status(500).json({ error: 'Failed to fetch user comments' });
    }
  }
}

module.exports = new CommentController();