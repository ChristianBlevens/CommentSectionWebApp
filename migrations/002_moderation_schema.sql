-- Migration: 002_moderation_schema
-- Description: Moderation database schema with improved structure
-- Date: 2025-01-06

-- Create moderation logs table with enhanced tracking
CREATE TABLE IF NOT EXISTS moderation_logs (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    page_id VARCHAR(255),
    user_id VARCHAR(255),
    approved BOOLEAN NOT NULL,
    reason VARCHAR(255),
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    flagged_words TEXT[],
    spam_score FLOAT CHECK (spam_score >= 0 AND spam_score <= 1),
    toxicity_score FLOAT CHECK (toxicity_score >= 0 AND toxicity_score <= 1),
    caps_ratio FLOAT CHECK (caps_ratio >= 0 AND caps_ratio <= 1),
    link_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create blocked words table with pattern matching
CREATE TABLE IF NOT EXISTS blocked_words (
    id SERIAL PRIMARY KEY,
    word VARCHAR(255) NOT NULL,
    pattern VARCHAR(255), -- Regex pattern for advanced matching
    severity VARCHAR(50) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('general', 'spam', 'toxic', 'adult', 'violence')),
    is_regex BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(word, pattern)
);

-- Create trusted users table with detailed metrics
CREATE TABLE IF NOT EXISTS trusted_users (
    id VARCHAR(255) PRIMARY KEY,
    trust_score FLOAT DEFAULT 0.5 CHECK (trust_score >= 0 AND trust_score <= 1),
    total_comments INTEGER DEFAULT 0 CHECK (total_comments >= 0),
    approved_comments INTEGER DEFAULT 0 CHECK (approved_comments >= 0),
    flagged_comments INTEGER DEFAULT 0 CHECK (flagged_comments >= 0),
    reported_comments INTEGER DEFAULT 0 CHECK (reported_comments >= 0),
    helpful_reports INTEGER DEFAULT 0 CHECK (helpful_reports >= 0),
    false_reports INTEGER DEFAULT 0 CHECK (false_reports >= 0),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create moderation rules table for configurable moderation
CREATE TABLE IF NOT EXISTS moderation_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('spam', 'toxicity', 'format', 'content')),
    enabled BOOLEAN DEFAULT TRUE,
    threshold FLOAT CHECK (threshold >= 0 AND threshold <= 1),
    action VARCHAR(50) NOT NULL CHECK (action IN ('block', 'flag', 'review', 'warn')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create page-specific moderation settings
CREATE TABLE IF NOT EXISTS page_moderation_settings (
    page_id VARCHAR(255) PRIMARY KEY,
    strict_mode BOOLEAN DEFAULT FALSE,
    auto_approve_trusted BOOLEAN DEFAULT TRUE,
    min_trust_score FLOAT DEFAULT 0.3 CHECK (min_trust_score >= 0 AND min_trust_score <= 1),
    custom_blocked_words TEXT[],
    max_links_allowed INTEGER DEFAULT 3,
    require_moderation BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_moderation_logs_user_id ON moderation_logs(user_id);
CREATE INDEX idx_moderation_logs_created_at ON moderation_logs(created_at DESC);
CREATE INDEX idx_moderation_logs_page_id ON moderation_logs(page_id);
CREATE INDEX idx_moderation_logs_approved ON moderation_logs(approved);

CREATE INDEX idx_blocked_words_word_active ON blocked_words(word) WHERE is_active = TRUE;
CREATE INDEX idx_blocked_words_severity ON blocked_words(severity) WHERE is_active = TRUE;
CREATE INDEX idx_blocked_words_category ON blocked_words(category) WHERE is_active = TRUE;

CREATE INDEX idx_trusted_users_trust_score ON trusted_users(trust_score);
CREATE INDEX idx_trusted_users_last_activity ON trusted_users(last_activity DESC);

-- Insert default moderation rules
INSERT INTO moderation_rules (rule_name, rule_type, threshold, action, description) VALUES
    ('high_spam_score', 'spam', 0.7, 'block', 'Block content with high spam probability'),
    ('extreme_toxicity', 'toxicity', 0.8, 'block', 'Block highly toxic content'),
    ('moderate_toxicity', 'toxicity', 0.5, 'flag', 'Flag moderately toxic content for review'),
    ('excessive_caps', 'format', 0.8, 'warn', 'Warn about excessive capital letters'),
    ('too_many_links', 'content', 5, 'flag', 'Flag content with too many links')
ON CONFLICT (rule_name) DO NOTHING;

-- Insert default blocked words
INSERT INTO blocked_words (word, severity, category) VALUES
    ('spam', 'low', 'spam'),
    ('scam', 'medium', 'spam'),
    ('hate', 'high', 'toxic'),
    ('violence', 'high', 'violence'),
    ('abuse', 'high', 'toxic'),
    ('harassment', 'high', 'toxic'),
    ('threat', 'critical', 'violence'),
    ('racist', 'critical', 'toxic'),
    ('sexist', 'critical', 'toxic'),
    ('homophobic', 'critical', 'toxic'),
    ('buy now', 'low', 'spam'),
    ('click here', 'low', 'spam'),
    ('free money', 'medium', 'spam')
ON CONFLICT (word, pattern) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_blocked_words_updated_at BEFORE UPDATE ON blocked_words
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trusted_users_updated_at BEFORE UPDATE ON trusted_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_moderation_rules_updated_at BEFORE UPDATE ON moderation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_page_moderation_settings_updated_at BEFORE UPDATE ON page_moderation_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();