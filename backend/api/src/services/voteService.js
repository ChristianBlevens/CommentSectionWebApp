const pool = require('../db/connection');
const commentService = require('./commentService');

class VoteService {
  async vote(commentId, userId, voteType) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if vote exists
      const existingVote = await client.query(
        'SELECT * FROM votes WHERE comment_id = $1 AND user_id = $2',
        [commentId, userId]
      );
      
      let result;
      
      if (existingVote.rows.length > 0) {
        const currentVote = existingVote.rows[0];
        
        if (currentVote.vote_type === voteType) {
          // Remove vote if same type
          await client.query(
            'DELETE FROM votes WHERE comment_id = $1 AND user_id = $2',
            [commentId, userId]
          );
          
          // Update comment counts
          const column = voteType === 'like' ? 'likes' : 'dislikes';
          await client.query(
            `UPDATE comments SET ${column} = ${column} - 1 WHERE id = $1`,
            [commentId]
          );
          
          result = { action: 'removed', voteType };
        } else {
          // Change vote type
          await client.query(
            'UPDATE votes SET vote_type = $3, created_at = CURRENT_TIMESTAMP WHERE comment_id = $1 AND user_id = $2',
            [commentId, userId, voteType]
          );
          
          // Update comment counts
          const addColumn = voteType === 'like' ? 'likes' : 'dislikes';
          const removeColumn = voteType === 'like' ? 'dislikes' : 'likes';
          
          await client.query(
            `UPDATE comments SET ${addColumn} = ${addColumn} + 1, ${removeColumn} = ${removeColumn} - 1 WHERE id = $1`,
            [commentId]
          );
          
          result = { action: 'changed', voteType, previousType: currentVote.vote_type };
        }
      } else {
        // Add new vote
        await client.query(
          'INSERT INTO votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [commentId, userId, voteType]
        );
        
        // Update comment counts
        const column = voteType === 'like' ? 'likes' : 'dislikes';
        await client.query(
          `UPDATE comments SET ${column} = ${column} + 1 WHERE id = $1`,
          [commentId]
        );
        
        result = { action: 'added', voteType };
      }
      
      // Get updated comment
      const updatedComment = await client.query(
        'SELECT likes, dislikes, page_id FROM comments WHERE id = $1',
        [commentId]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      if (updatedComment.rows[0]) {
        await commentService.invalidatePageCache(updatedComment.rows[0].page_id);
      }
      
      return {
        ...result,
        likes: updatedComment.rows[0].likes,
        dislikes: updatedComment.rows[0].dislikes,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async getUserVotes(userId, commentIds) {
    if (!commentIds || commentIds.length === 0) return {};
    
    const result = await pool.query(
      'SELECT comment_id, vote_type FROM votes WHERE user_id = $1 AND comment_id = ANY($2)',
      [userId, commentIds]
    );
    
    // Convert to object for easy lookup
    const votes = {};
    result.rows.forEach(row => {
      votes[row.comment_id] = row.vote_type;
    });
    
    return votes;
  }
  
  async getCommentVoters(commentId, voteType = null) {
    const query = voteType
      ? `SELECT u.id, u.name, u.picture, v.vote_type, v.created_at
         FROM votes v
         JOIN users u ON v.user_id = u.id
         WHERE v.comment_id = $1 AND v.vote_type = $2
         ORDER BY v.created_at DESC`
      : `SELECT u.id, u.name, u.picture, v.vote_type, v.created_at
         FROM votes v
         JOIN users u ON v.user_id = u.id
         WHERE v.comment_id = $1
         ORDER BY v.created_at DESC`;
    
    const params = voteType ? [commentId, voteType] : [commentId];
    const result = await pool.query(query, params);
    
    return result.rows;
  }
}

module.exports = new VoteService();