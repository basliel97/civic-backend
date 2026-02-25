-- Civic Engagement Module Database Schema
-- Run this migration to create all required tables

-- ============================================
-- WORK TYPES (Dropdown options)
-- ============================================
CREATE TABLE IF NOT EXISTS work_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) DEFAULT 'general',
    is_custom BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- GOVERNMENT BUREAUS
-- ============================================
CREATE TABLE IF NOT EXISTS bureaus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    contact_email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- FORUMS (Discussion Categories)
-- ============================================
CREATE TABLE IF NOT EXISTS forums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    category VARCHAR(50) DEFAULT 'general',
    is_system BOOLEAN DEFAULT FALSE,
    is_restricted BOOLEAN DEFAULT FALSE,
    allowed_roles JSONB DEFAULT '[]',
    allowed_regions JSONB DEFAULT '[]',
    allowed_work_types JSONB DEFAULT '[]',
    created_by UUID REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_forums_category ON forums(category);
CREATE INDEX IF NOT EXISTS idx_forums_status ON forums(status);

-- ============================================
-- POSTS (Discussion Threads)
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forum_id UUID REFERENCES forums(id) ON DELETE CASCADE,
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_forum ON posts(forum_id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- ============================================
-- REPLIES (Responses to Posts)
-- ============================================
CREATE TABLE IF NOT EXISTS replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id);
CREATE INDEX IF NOT EXISTS idx_replies_user ON replies(user_id);

-- ============================================
-- POLLS
-- ============================================
CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    options JSONB NOT NULL,
    target_criteria JSONB DEFAULT '{}',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    allow_view_results_before_vote BOOLEAN DEFAULT FALSE,
    allow_view_results_after_vote BOOLEAN DEFAULT TRUE,
    show_results_live BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS polls_dates ON polls(start_date, end_date);

-- ============================================
-- POLL VOTES (One User, One Vote enforcement)
-- ============================================
CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL,
    voted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes(user_id);

-- ============================================
-- REPORTS (Content Abuse Reports)
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    item_title VARCHAR(255),
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    resolved_by UUID REFERENCES "user"(id),
    resolution TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_item ON reports(item_id, item_type);

-- ============================================
-- SUGGESTIONS (Private Feedback Box)
-- ============================================
CREATE TABLE IF NOT EXISTS suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    bureau_id UUID REFERENCES bureaus(id),
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'submitted',
    response TEXT,
    responded_by UUID REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT NOW(),
    responded_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suggestions_user ON suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_bureau ON suggestions(bureau_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);

-- ============================================
-- BANNED WORDS (Profanity Filter)
-- ============================================
CREATE TABLE IF NOT EXISTS banned_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word VARCHAR(100) NOT NULL UNIQUE,
    severity VARCHAR(20) DEFAULT 'medium',
    language VARCHAR(20) DEFAULT 'both',
    created_by UUID REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banned_words_word ON banned_words(word);

-- ============================================
-- FORUM MODERATORS
-- ============================================
CREATE TABLE IF NOT EXISTS forum_mods (
    forum_id UUID REFERENCES forums(id) ON DELETE CASCADE,
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'moderator',
    assigned_by UUID REFERENCES "user"(id),
    assigned_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (forum_id, user_id)
);

-- ============================================
-- CITIZEN PROFILE EXTENSIONS
-- ============================================
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS region VARCHAR(50);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sub_city VARCHAR(100);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS kebele VARCHAR(50);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS work_type VARCHAR(100);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_user_region ON "user"(region);
CREATE INDEX IF NOT EXISTS idx_user_work_type ON "user"(work_type);

-- ============================================
-- SEED DATA: Work Types
-- ============================================
INSERT INTO work_types (name, category) VALUES
    ('Government Employee', 'public'),
    ('Healthcare Worker', 'health'),
    ('Education Worker', 'education'),
    ('Private Sector', 'private'),
    ('Business Owner / Self-Employed', 'business'),
    ('Student', 'education'),
    ('Unemployed', 'other'),
    ('Retired', 'other'),
    ('Farmer', 'agriculture'),
    ('Driver / Transport Worker', 'transport'),
    ('Trade / Merchant', 'business'),
    ('Technology / IT', 'private'),
    ('Other', 'other')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- SEED DATA: Bureaus (Sample Government Departments)
-- ============================================
INSERT INTO bureaus (name, description, contact_email) VALUES
    ('Addis Ababa City Administration', 'Capital city municipal services', 'info@addisababa.gov.et'),
    ('Ministry of Health', 'National health services and feedback', 'feedback@moh.gov.et'),
    ('Ministry of Education', 'Education sector feedback', 'info@moe.gov.et'),
    ('Ministry of Transport', 'Transport and road safety', 'info@mot.gov.et'),
    ('Ethiopian Revenue and Customs Authority', 'Tax and customs services', 'info@erca.gov.et'),
    ('National Bank of Ethiopia', 'Banking and financial services', 'info@nbe.gov.et'),
    ('Addis Ababa Traffic Management', 'Traffic and road safety', 'feedback@aatmc.gov.et'),
    ('Addis Ababa Water and Sewerage Authority', 'Water services', 'info@aawsc.gov.et'),
    ('Addis Ababa Electric Utility', 'Electricity services', 'info@aaeu.gov.et'),
    ('Ministry of Peace', 'Community safety and peace', 'info@mop.gov.et')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- SEED DATA: Default System Forums
-- ============================================
INSERT INTO forums (name, description, icon, category, is_system, is_restricted, created_by) VALUES
    ('General Discussion', 'General community discussions and conversations', '💬', 'general', TRUE, FALSE, NULL),
    ('Road Safety', 'Discussions about road safety, traffic, and transport issues', '🚗', 'transport', TRUE, FALSE, NULL),
    ('Health Center Feedback', 'Feedback and discussions about health services', '🏥', 'health', TRUE, FALSE, NULL),
    ('Education', 'Discussions about schools, universities, and education', '📚', 'education', TRUE, FALSE, NULL),
    ('Local Community', 'Local community issues and neighborhood discussions', '🏘️', 'local', TRUE, FALSE, NULL),
    ('Government Services', 'Feedback about government services and offices', '🏛️', 'government', TRUE, FALSE, NULL)
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: Banned Words (Sample)
-- ============================================
INSERT INTO banned_words (word, severity, language) VALUES
    ('fuck', 'high', 'en'),
    ('shit', 'medium', 'en'),
    ('damn', 'low', 'en'),
    ('bitch', 'high', 'en'),
    ('asshole', 'medium', 'en'),
    ('bastard', 'high', 'en'),
    ('crap', 'low', 'en'),
    ('dick', 'medium', 'en'),
    ('piss', 'medium', 'en'),
    ('whore', 'high', 'en'),
    ('ጾታ', 'high', 'am'),
    ('ፈሪስታ', 'high', 'am'),
    ('ነፍስ ገዳይ', 'high', 'am')
ON CONFLICT (word) DO NOTHING;

-- ============================================
-- SEED DATA: Ethiopian Regions
-- ============================================
-- Regions will be stored in the citizen profile from Fayda API
-- Common Ethiopian regions for reference:
-- Addis Ababa, Afar, Amhara, Benishangul-Gumuz, Dire Dawa, Gambela, Harari, Oromia, SNNPR, Somali, Tigray

SELECT 'Civic Engagement Module tables created successfully' AS status;
