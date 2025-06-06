const fs = require('fs').promises;
const path = require('path');
const pool = require('./connection');
const config = require('../config');

async function runMigration(filePath) {
  const sql = await fs.readFile(filePath, 'utf8');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`Migration completed: ${path.basename(filePath)}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  try {
    // Check if migrations directory exists
    const migrationsDir = path.join(__dirname, '../../../../migrations');
    
    try {
      await fs.access(migrationsDir);
      
      // Run initial schema migration
      const schemaFile = path.join(migrationsDir, '001_initial_schema.sql');
      try {
        await fs.access(schemaFile);
        await runMigration(schemaFile);
      } catch (error) {
        console.log('Schema migration file not found, using legacy initialization');
        await legacyInit();
      }
    } catch (error) {
      console.log('Migrations directory not found, using legacy initialization');
      await legacyInit();
    }
    
    // Set initial moderators
    await setInitialModerators();
    
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

async function legacyInit() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        picture TEXT,
        is_moderator BOOLEAN DEFAULT FALSE,
        is_banned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add columns if they don't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='users' AND column_name='is_moderator') 
        THEN 
          ALTER TABLE users ADD COLUMN is_moderator BOOLEAN DEFAULT FALSE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='users' AND column_name='is_banned') 
        THEN 
          ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);
    
    // Create comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        page_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        content TEXT NOT NULL CHECK (char_length(content) <= 5000),
        likes INTEGER DEFAULT 0 CHECK (likes >= 0),
        dislikes INTEGER DEFAULT 0 CHECK (dislikes >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create votes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        comment_id INTEGER NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        vote_type VARCHAR(10) CHECK (vote_type IN ('like', 'dislike')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(comment_id, user_id)
      )
    `);
    
    // Create reports table with snapshot fields
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        comment_id INTEGER NOT NULL,
        reporter_id VARCHAR(255) NOT NULL,
        page_id VARCHAR(255) NOT NULL,
        reason VARCHAR(500),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        resolved_by VARCHAR(255),
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(comment_id, reporter_id)
      )
    `);
    
    // Add snapshot columns if they don't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='reports' AND column_name='comment_content') 
        THEN 
          ALTER TABLE reports ADD COLUMN comment_content TEXT;
          ALTER TABLE reports ADD COLUMN comment_author_id VARCHAR(255);
          ALTER TABLE reports ADD COLUMN comment_author_name VARCHAR(255);
          ALTER TABLE reports ADD COLUMN comment_created_at TIMESTAMP;
        END IF;
      END $$;
    `);
    
    // Add soft delete columns to comments if they don't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='comments' AND column_name='is_deleted') 
        THEN 
          ALTER TABLE comments ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
          ALTER TABLE comments ADD COLUMN deleted_at TIMESTAMP;
          ALTER TABLE comments ADD COLUMN deleted_by VARCHAR(255);
        END IF;
      END $$;
    `);
    
    // Create report rate limiting table
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_rate_limits (
        user_id VARCHAR(255) PRIMARY KEY,
        report_count INTEGER DEFAULT 0,
        window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_votes_comment_id ON votes(comment_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_page_id ON reports(page_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_is_moderator ON users(is_moderator)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned)');
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setInitialModerators() {
  if (config.initialModerators.length === 0) return;
  
  const client = await pool.connect();
  try {
    for (const modId of config.initialModerators) {
      await client.query(
        'UPDATE users SET is_moderator = true WHERE id = $1',
        [modId]
      );
    }
    console.log(`Set ${config.initialModerators.length} initial moderators`);
  } finally {
    client.release();
  }
}

module.exports = { initializeDatabase };