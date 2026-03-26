import { Pool } from 'pg';
import { config } from '../config/env.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const pool = new Pool({
    connectionString: config.databaseUrl,
});
async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🔄 Running civic engagement migration...');
        await client.query('BEGIN');
        // Work Types
        await client.query(`
      CREATE TABLE IF NOT EXISTS work_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        category VARCHAR(50) DEFAULT 'general',
        is_custom BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
        console.log('✅ work_types table created');
        // Bureaus
        await client.query(`
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
      )
    `);
        console.log('✅ bureaus table created');
        // Forums
        await client.query(`
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
      )
    `);
        console.log('✅ forums table created');
        // Posts
        await client.query(`
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
      )
    `);
        console.log('✅ posts table created');
        // Replies
        await client.query(`
      CREATE TABLE IF NOT EXISTS replies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
        user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
        console.log('✅ replies table created');
        // Polls
        await client.query(`
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
      )
    `);
        console.log('✅ polls table created');
        // Poll Votes
        await client.query(`
      CREATE TABLE IF NOT EXISTS poll_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
        user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
        option_index INTEGER NOT NULL,
        voted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(poll_id, user_id)
      )
    `);
        console.log('✅ poll_votes table created');
        // Reports
        await client.query(`
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
      )
    `);
        console.log('✅ reports table created');
        // Suggestions
        await client.query(`
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
      )
    `);
        console.log('✅ suggestions table created');
        // Banned Words
        await client.query(`
      CREATE TABLE IF NOT EXISTS banned_words (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        word VARCHAR(100) NOT NULL UNIQUE,
        severity VARCHAR(20) DEFAULT 'medium',
        language VARCHAR(20) DEFAULT 'both',
        created_by UUID REFERENCES "user"(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
        console.log('✅ banned_words table created');
        // Forum Moderators
        await client.query(`
      CREATE TABLE IF NOT EXISTS forum_mods (
        forum_id UUID REFERENCES forums(id) ON DELETE CASCADE,
        user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'moderator',
        assigned_by UUID REFERENCES "user"(id),
        assigned_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (forum_id, user_id)
      )
    `);
        console.log('✅ forum_mods table created');
        // Citizen profile extensions
        await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS region VARCHAR(50)`);
        await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sub_city VARCHAR(100)`);
        await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS kebele VARCHAR(50)`);
        await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS work_type VARCHAR(100)`);
        await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)`);
        console.log('✅ Citizen profile columns added');
        // Seed Work Types
        await client.query(`
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
      ON CONFLICT (name) DO NOTHING
    `);
        console.log('✅ Work types seeded');
        // Seed Bureaus
        await client.query(`
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
      ON CONFLICT (name) DO NOTHING
    `);
        console.log('✅ Bureaus seeded');
        // Seed Forums
        const forumExists = await client.query(`SELECT COUNT(*) FROM forums WHERE name = 'General Discussion'`);
        if (parseInt(forumExists.rows[0].count) === 0) {
            await client.query(`
        INSERT INTO forums (name, description, icon, category, is_system, is_restricted) VALUES
          ('General Discussion', 'General community discussions and conversations', '💬', 'general', TRUE, FALSE),
          ('Road Safety', 'Discussions about road safety, traffic, and transport issues', '🚗', 'transport', TRUE, FALSE),
          ('Health Center Feedback', 'Feedback and discussions about health services', '🏥', 'health', TRUE, FALSE),
          ('Education', 'Discussions about schools, universities, and education', '📚', 'education', TRUE, FALSE),
          ('Local Community', 'Local community issues and neighborhood discussions', '🏘️', 'local', TRUE, FALSE),
          ('Government Services', 'Feedback about government services and offices', '🏛️', 'government', TRUE, FALSE)
      `);
            console.log('✅ Forums seeded');
        }
        else {
            console.log('✅ Forums already exist, skipping seed');
        }
        await client.query('COMMIT');
        console.log('🎉 Civic Engagement migration completed successfully!');
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    }
    finally {
        client.release();
        await pool.end();
    }
}
runMigration().catch(console.error);
