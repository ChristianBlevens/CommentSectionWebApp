const pool = require('../db/connection');

class UserService {
  async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }
  
  async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }
  
  async create(userData) {
    const { id, email, name, picture } = userData;
    const result = await pool.query(
      `INSERT INTO users (id, email, name, picture) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (id) DO UPDATE 
       SET name = EXCLUDED.name, 
           picture = EXCLUDED.picture,
           updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, email, name, picture]
    );
    return result.rows[0];
  }
  
  async updateModeratorStatus(userId, isModerator) {
    const result = await pool.query(
      `UPDATE users SET is_moderator = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 RETURNING *`,
      [userId, isModerator]
    );
    return result.rows[0];
  }
  
  async updateBanStatus(userId, isBanned) {
    const result = await pool.query(
      `UPDATE users SET is_banned = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 RETURNING *`,
      [userId, isBanned]
    );
    return result.rows[0];
  }
  
  async getModerators() {
    const result = await pool.query(
      'SELECT id, name, email, picture, created_at FROM users WHERE is_moderator = true ORDER BY created_at'
    );
    return result.rows;
  }
  
  async getBannedUsers() {
    const result = await pool.query(
      'SELECT id, name, email, picture, created_at FROM users WHERE is_banned = true ORDER BY created_at DESC'
    );
    return result.rows;
  }
  
  async searchUsers(query, limit = 10) {
    const result = await pool.query(
      `SELECT id, name, email, picture, is_moderator, is_banned 
       FROM users 
       WHERE name ILIKE $1 OR email ILIKE $1 
       ORDER BY name 
       LIMIT $2`,
      [`%${query}%`, limit]
    );
    return result.rows;
  }
}

module.exports = new UserService();