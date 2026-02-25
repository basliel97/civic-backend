import { Pool } from 'pg';
import { config } from '../config/env.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

async function createTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Creating civic engagement tables...');
    
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
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'active'
      )
    `);
    
    // Posts
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        forum_id UUID,
        user_id UUID,
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
    
    // Replies
    await client.query(`
      CREATE TABLE IF NOT EXISTS replies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID,
        user_id UUID,
        content TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
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
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Poll Votes
    await client.query(`
      CREATE TABLE IF NOT EXISTS poll_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id UUID,
        user_id UUID,
        option_index INTEGER NOT NULL,
        voted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(poll_id, user_id)
      )
    `);
    
    // Reports
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL,
        item_type VARCHAR(20) NOT NULL,
        item_title VARCHAR(255),
        user_id UUID,
        reason VARCHAR(50) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        resolved_by UUID,
        resolution TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP
      )
    `);
    
    // Suggestions
    await client.query(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        bureau_id UUID,
        subject VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'submitted',
        response TEXT,
        responded_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        responded_at TIMESTAMP
      )
    `);
    
    // Banned Words
    await client.query(`
      CREATE TABLE IF NOT EXISTS banned_words (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        word VARCHAR(100) NOT NULL UNIQUE,
        severity VARCHAR(20) DEFAULT 'medium',
        language VARCHAR(20) DEFAULT 'both',
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Forum Moderators
    await client.query(`
      CREATE TABLE IF NOT EXISTS forum_mods (
        forum_id UUID,
        user_id UUID,
        role VARCHAR(20) DEFAULT 'moderator',
        assigned_by UUID,
        assigned_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (forum_id, user_id)
      )
    `);
    
    // Citizen profile extensions
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS region VARCHAR(50)`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sub_city VARCHAR(100)`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS kebele VARCHAR(50)`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS work_type VARCHAR(100)`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)`);
    
    // Add foreign keys
    await client.query(`ALTER TABLE posts ADD CONSTRAINT fk_posts_forum FOREIGN KEY (forum_id) REFERENCES forums(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE posts ADD CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE replies ADD CONSTRAINT fk_replies_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE replies ADD CONSTRAINT fk_replies_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE polls ADD CONSTRAINT fk_polls_user FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE poll_votes ADD CONSTRAINT fk_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE poll_votes ADD CONSTRAINT fk_poll_votes_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE suggestions ADD CONSTRAINT fk_suggestions_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE suggestions ADD CONSTRAINT fk_suggestions_bureau FOREIGN KEY (bureau_id) REFERENCES bureaus(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE forums ADD CONSTRAINT fk_forums_user FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL`);
    
    await client.query('COMMIT');
    console.log('✅ All tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Table creation failed:', (error as Error).message);
    throw error;
  } finally {
    client.release();
  }
}

async function seedData() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Seeding civic engagement data...');
    
    // Seed Work Types
    const workTypes = [
      'Government Employee', 'Healthcare Worker', 'Education Worker', 
      'Private Sector', 'Business Owner / Self-Employed', 'Student', 
      'Unemployed', 'Retired', 'Farmer', 'Driver / Transport Worker', 
      'Trade / Merchant', 'Technology / IT', 'Other'
    ];
    
    for (const name of workTypes) {
      await client.query(
        `INSERT INTO work_types (name, category) VALUES ($1, 'general') ON CONFLICT (name) DO NOTHING`,
        [name]
      );
    }
    console.log('✅ Work types seeded');
    
    // Seed Bureaus
    const bureaus = [
      { name: 'Addis Ababa City Administration', desc: 'Capital city municipal services', email: 'info@addisababa.gov.et' },
      { name: 'Ministry of Health', desc: 'National health services and feedback', email: 'feedback@moh.gov.et' },
      { name: 'Ministry of Education', desc: 'Education sector feedback', email: 'info@moe.gov.et' },
      { name: 'Ministry of Transport', desc: 'Transport and road safety', email: 'info@mot.gov.et' },
      { name: 'Ethiopian Revenue and Customs Authority', desc: 'Tax and customs services', email: 'info@erca.gov.et' },
      { name: 'National Bank of Ethiopia', desc: 'Banking and financial services', email: 'info@nbe.gov.et' },
      { name: 'Addis Ababa Traffic Management', desc: 'Traffic and road safety', email: 'feedback@aatmc.gov.et' },
      { name: 'Addis Ababa Water and Sewerage Authority', desc: 'Water services', email: 'info@aawsc.gov.et' },
      { name: 'Addis Ababa Electric Utility', desc: 'Electricity services', email: 'info@aaeu.gov.et' },
      { name: 'Ministry of Peace', desc: 'Community safety and peace', email: 'info@mop.gov.et' }
    ];
    
    for (const b of bureaus) {
      await client.query(
        `INSERT INTO bureaus (name, description, contact_email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [b.name, b.desc, b.email]
      );
    }
    console.log('✅ Bureaus seeded');
    
    // Seed Forums
    const forums = [
      { name: 'General Discussion', desc: 'General community discussions and conversations', icon: '💬', cat: 'general' },
      { name: 'Road Safety', desc: 'Discussions about road safety, traffic, and transport issues', icon: '🚗', cat: 'transport' },
      { name: 'Health Center Feedback', desc: 'Feedback and discussions about health services', icon: '🏥', cat: 'health' },
      { name: 'Education', desc: 'Discussions about schools, universities, and education', icon: '📚', cat: 'education' },
      { name: 'Local Community', desc: 'Local community issues and neighborhood discussions', icon: '🏘️', cat: 'local' },
      { name: 'Government Services', desc: 'Feedback about government services and offices', icon: '🏛️', cat: 'government' }
    ];
    
    for (const f of forums) {
      await client.query(
        `INSERT INTO forums (name, description, icon, category, is_system, is_restricted) VALUES ($1, $2, $3, $4, TRUE, FALSE) ON CONFLICT DO NOTHING`,
        [f.name, f.desc, f.icon, f.cat]
      );
    }
    console.log('✅ Forums seeded');
    
    // Seed Banned Words
    const bannedWords = [
      { word: 'fuck', severity: 'high', lang: 'en' },
      { word: 'shit', severity: 'medium', lang: 'en' },
      { word: 'damn', severity: 'low', lang: 'en' },
      { word: 'bitch', severity: 'high', lang: 'en' },
      { word: 'asshole', severity: 'medium', lang: 'en' },
      { word: 'bastard', severity: 'high', lang: 'en' },
      { word: 'crap', severity: 'low', lang: 'en' },
      { word: 'dick', severity: 'medium', lang: 'en' },
      { word: 'piss', severity: 'medium', lang: 'en' },
      { word: 'whore', severity: 'high', lang: 'en' }
    ];
    
    for (const w of bannedWords) {
      await client.query(
        `INSERT INTO banned_words (word, severity, language) VALUES ($1, $2, $3) ON CONFLICT (word) DO NOTHING`,
        [w.word, w.severity, w.lang]
      );
    }
    console.log('✅ Banned words seeded');
    
    console.log('🎉 All seed data completed successfully!');
    
  } catch (error) {
    console.error('❌ Seed failed:', (error as Error).message);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  await createTables();
  await seedData();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
