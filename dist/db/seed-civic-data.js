import { Pool } from 'pg';
import { config } from '../config/env.js';
const pool = new Pool({
    connectionString: config.databaseUrl,
});
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
            await client.query(`INSERT INTO work_types (name, category) VALUES ($1, 'general') ON CONFLICT (name) DO NOTHING`, [name]);
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
            await client.query(`INSERT INTO bureaus (name, description, contact_email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [b.name, b.desc, b.email]);
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
            await client.query(`INSERT INTO forums (name, description, icon, category, is_system, is_restricted) VALUES ($1, $2, $3, $4, TRUE, FALSE) ON CONFLICT DO NOTHING`, [f.name, f.desc, f.icon, f.cat]);
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
            await client.query(`INSERT INTO banned_words (word, severity, language) VALUES ($1, $2, $3) ON CONFLICT (word) DO NOTHING`, [w.word, w.severity, w.lang]);
        }
        console.log('✅ Banned words seeded');
        console.log('🎉 Seed data completed successfully!');
    }
    catch (error) {
        console.error('❌ Seed failed:', error);
    }
    finally {
        client.release();
        await pool.end();
    }
}
seedData().catch(console.error);
