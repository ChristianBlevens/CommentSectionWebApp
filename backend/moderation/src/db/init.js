const fs = require('fs').promises;
const path = require('path');
const pool = require('./connection');

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
      
      // Run moderation schema migration
      const schemaFile = path.join(migrationsDir, '002_moderation_schema.sql');
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
    
    // Create moderation logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS moderation_logs (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        approved BOOLEAN NOT NULL,
        reason VARCHAR(255),
        confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
        flagged_words TEXT[],
        user_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create blocked words table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_words (
        id SERIAL PRIMARY KEY,
        word VARCHAR(255) UNIQUE NOT NULL,
        severity VARCHAR(50) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create trusted users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trusted_users (
        id VARCHAR(255) PRIMARY KEY,
        trust_score FLOAT DEFAULT 0.5 CHECK (trust_score >= 0 AND trust_score <= 1),
        total_comments INTEGER DEFAULT 0 CHECK (total_comments >= 0),
        flagged_comments INTEGER DEFAULT 0 CHECK (flagged_comments >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_moderation_logs_user_id ON moderation_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_blocked_words_word ON blocked_words(word);
    `);
    
    // Insert default blocked words
    const defaultBlockedWords = [
      { word: 'spam', severity: 'low' },
      { word: 'scam', severity: 'medium' },
      { word: 'hate', severity: 'high' },
      { word: 'violence', severity: 'high' },
      { word: 'abuse', severity: 'high' },
      { word: 'harassment', severity: 'high' },
      { word: 'threat', severity: 'high' },
      { word: 'racist', severity: 'high' },
      { word: 'sexist', severity: 'high' },
      { word: 'homophobic', severity: 'high' }
    ];
    
    for (const { word, severity } of defaultBlockedWords) {
      await client.query(
        `INSERT INTO blocked_words (word, severity) 
         VALUES ($1, $2) 
         ON CONFLICT (word) DO NOTHING`,
        [word.toLowerCase(), severity]
      );
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initializeDatabase };