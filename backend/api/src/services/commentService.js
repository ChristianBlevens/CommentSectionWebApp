const pool = require('../db/connection');
const { safeRedisOp, client: redisClient } = require('../db/redis');

class CommentService {
  async getCommentsByPage(pageId, includeDeleted = false) {
    const deletedFilter = includeDeleted ? '' : 'AND c.is_deleted = FALSE';
    
    const query = `
      SELECT 
        c.id, c.page_id, c.user_id, c.parent_id, c.content,
        c.likes, c.dislikes, c.is_deleted, c.created_at, c.updated_at,
        u.name as user_name, u.picture as user_picture,
        u.is_moderator, u.is_banned
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.page_id = $1 ${deletedFilter}
      ORDER BY c.created_at DESC
    `;
    
    // Try cache first
    const cacheKey = `comments:${pageId}:${includeDeleted}`;
    const cached = await safeRedisOp(() => redisClient.get(cacheKey));
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    const result = await pool.query(query, [pageId]);
    
    // Cache for 30 seconds
    await safeRedisOp(() => 
      redisClient.setEx(cacheKey, 30, JSON.stringify(result.rows))
    );
    
    return result.rows;
  }
  
  async getCommentById(id) {
    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.picture as user_picture
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0];
  }
  
  async createComment(commentData) {
    const { pageId, userId, content, parentId } = commentData;
    
    const result = await pool.query(
      `INSERT INTO comments (page_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [pageId, userId, content, parentId || null]
    );
    
    // Invalidate cache
    await this.invalidatePageCache(pageId);
    
    return result.rows[0];
  }
  
  async updateComment(id, content, userId) {
    const result = await pool.query(
      `UPDATE comments 
       SET content = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $3 AND is_deleted = FALSE
       RETURNING *`,
      [id, content, userId]
    );
    
    if (result.rows[0]) {
      await this.invalidatePageCache(result.rows[0].page_id);
    }
    
    return result.rows[0];
  }
  
  async deleteComment(id, deletedBy, isModerator = false) {
    // Soft delete to preserve for reports
    const query = isModerator
      ? `UPDATE comments 
         SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, deleted_by = $2
         WHERE id = $1 AND is_deleted = FALSE
         RETURNING *`
      : `UPDATE comments 
         SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, deleted_by = $2
         WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
         RETURNING *`;
    
    const result = await pool.query(query, [id, deletedBy]);
    
    if (result.rows[0]) {
      await this.invalidatePageCache(result.rows[0].page_id);
    }
    
    return result.rows[0];
  }
  
  async getUserComments(userId, limit = 50) {
    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.picture as user_picture
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.user_id = $1 AND c.is_deleted = FALSE
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }
  
  async getCommentStats(pageId) {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_comments,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(created_at) as last_comment_at
       FROM comments
       WHERE page_id = $1 AND is_deleted = FALSE`,
      [pageId]
    );
    return result.rows[0];
  }
  
  async invalidatePageCache(pageId) {
    const patterns = [
      `comments:${pageId}:true`,
      `comments:${pageId}:false`,
    ];
    
    for (const pattern of patterns) {
      await safeRedisOp(() => redisClient.del(pattern));
    }
  }
}

module.exports = new CommentService();