-- Migration: 001_initial_schema
-- Description: Initial database schema for comment system with improved structure
-- Date: 2025-01-06

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    picture TEXT,
    is_moderator BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create comments table with improved page_id indexing
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    page_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    parent_id INTEGER,
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    likes INTEGER DEFAULT 0 CHECK (likes >= 0),
    dislikes INTEGER DEFAULT 0 CHECK (dislikes >= 0),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create votes table with composite unique constraint
CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('like', 'dislike')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(comment_id, user_id)
);

-- Create reports table with comment content preservation
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL,
    reporter_id VARCHAR(255) NOT NULL,
    page_id VARCHAR(255) NOT NULL,
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    -- Store comment snapshot for persistence
    comment_content TEXT NOT NULL,
    comment_author_id VARCHAR(255) NOT NULL,
    comment_author_name VARCHAR(255) NOT NULL,
    comment_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Resolution details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_action VARCHAR(50) CHECK (resolution_action IN ('deleted', 'banned', 'dismissed', 'warned')),
    resolution_notes TEXT,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE SET NULL, -- Don't cascade delete
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(comment_id, reporter_id)
);

-- Create report rate limiting table
CREATE TABLE IF NOT EXISTS report_rate_limits (
    user_id VARCHAR(255) PRIMARY KEY,
    report_count INTEGER DEFAULT 0 CHECK (report_count >= 0),
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create optimized indexes
-- Primary page access pattern
CREATE INDEX idx_comments_page_id_created_at ON comments(page_id, created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_comments_parent_id ON comments(parent_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Votes indexing
CREATE INDEX idx_votes_comment_id ON votes(comment_id);
CREATE INDEX idx_votes_user_id ON votes(user_id);

-- Reports indexing with page_id optimization
CREATE INDEX idx_reports_page_id_status ON reports(page_id, status, created_at DESC);
CREATE INDEX idx_reports_status_created_at ON reports(status, created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX idx_reports_comment_author_id ON reports(comment_author_id);

-- User indexing
CREATE INDEX idx_users_is_moderator ON users(is_moderator) WHERE is_moderator = TRUE;
CREATE INDEX idx_users_is_banned ON users(is_banned) WHERE is_banned = TRUE;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();