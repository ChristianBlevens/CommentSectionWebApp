#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

// Database configurations
const databases = {
  comments: {
    database: process.env.DB_NAME || 'comments_db',
    migrations: ['001_initial_schema.sql'],
  },
  moderation: {
    database: process.env.MODERATION_DB_NAME || 'moderation_db',
    migrations: ['002_moderation_schema.sql'],
  },
};

async function runMigration(pool, filePath) {
  console.log(`Running migration: ${path.basename(filePath)}`);
  
  const sql = await fs.readFile(filePath, 'utf8');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Check if migration has been run
    const result = await client.query(
      'SELECT * FROM migrations WHERE filename = $1',
      [path.basename(filePath)]
    );
    
    if (result.rows.length > 0) {
      console.log(`Migration ${path.basename(filePath)} already executed, skipping...`);
      await client.query('COMMIT');
      return;
    }
    
    // Run the migration
    await client.query(sql);
    
    // Record the migration
    await client.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      [path.basename(filePath)]
    );
    
    await client.query('COMMIT');
    console.log(`Migration ${path.basename(filePath)} completed successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  const baseConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
  };
  
  for (const [name, config] of Object.entries(databases)) {
    console.log(`\nMigrating ${name} database...`);
    
    const pool = new Pool({
      ...baseConfig,
      database: config.database,
    });
    
    try {
      // Test connection
      await pool.query('SELECT NOW()');
      console.log(`Connected to ${config.database}`);
      
      // Run migrations
      for (const migration of config.migrations) {
        const migrationPath = path.join(__dirname, migration);
        await runMigration(pool, migrationPath);
      }
    } catch (error) {
      console.error(`Error migrating ${name} database:`, error);
      process.exit(1);
    } finally {
      await pool.end();
    }
  }
  
  console.log('\nAll migrations completed successfully!');
}

// Run migrations if called directly
if (require.main === module) {
  migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrate };