import { Pool } from 'pg';
import { config } from '../config/env.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

async function runTransportMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Running Transport Agency migration...');
    await client.query('BEGIN');
    
    // 1. Mock External Agency Records (Simulates Ministry of Health & Federal Police databases)
    await client.query(`
      CREATE TABLE IF NOT EXISTS external_agency_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        record_type VARCHAR(50) NOT NULL, -- 'medical', 'police', 'training'
        reference_number VARCHAR(100) UNIQUE NOT NULL,
        citizen_fin VARCHAR(20) NOT NULL, -- Matches against user's FIN
        result_data JSONB NOT NULL, -- e.g., {"status": "passed", "notes": "Vision clear"}
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ external_agency_records table created');

    // 2. Driver Licenses (The actual issued licenses)
    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_licenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
        license_number VARCHAR(50) UNIQUE NOT NULL,
        categories JSONB NOT NULL, -- e.g., '["Automobile", "Motorcycle", "Dry Cargo"]'
        issue_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        points INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active', -- 'active', 'suspended', 'expired'
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ driver_licenses table created');

    // 3. Transport Applications (The core workflow for the 9 services)
    await client.query(`
      CREATE TABLE IF NOT EXISTS transport_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
        service_type VARCHAR(50) NOT NULL, -- 'renewal', 'replacement', 'international_verification', 'file_transfer', etc.
        status VARCHAR(50) DEFAULT 'pending_payment', -- 'pending_payment', 'paid', 'under_review', 'approved', 'rejected', 'printing', 'ready_for_pickup', 'dispatched', 'completed'
        payment_reference VARCHAR(100) UNIQUE,
        delivery_method VARCHAR(50), -- 'pickup', 'postal'
        delivery_tracking_number VARCHAR(100),
        external_references JSONB DEFAULT '{}', -- e.g., {"medical_ref": "MED-123", "police_ref": "POL-999"}
        admin_notes TEXT,
        assigned_admin_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ transport_applications table created');

    // 4. Application Audit Logs (For grading & security tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS application_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id UUID REFERENCES transport_applications(id) ON DELETE CASCADE,
        changed_by UUID REFERENCES "user"(id) ON DELETE SET NULL, -- Null if system automated
        old_status VARCHAR(50),
        new_status VARCHAR(50) NOT NULL,
        action_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ application_audit_logs table created');

    // --- SEED MOCK DATA FOR TESTING ---
    console.log('🌱 Seeding mock external records for testing...');
    
    // We will use a standard testing FIN: "123456789012"
    // (Ensure you have a test citizen with this FIN in your DB)
    const testFin = '123456789012';

    await client.query(`
      INSERT INTO external_agency_records (record_type, reference_number, citizen_fin, result_data) 
      VALUES 
        ('medical', 'MED-2026-001', $1, '{"status": "passed", "vision_score": "20/20", "doctor": "Dr. Abebe"}'),
        ('medical', 'MED-2026-002', $1, '{"status": "failed", "vision_score": "20/80", "doctor": "Dr. Kebede"}'),
        ('police', 'POL-2026-001', $1, '{"status": "cleared", "criminal_record": false, "notes": "No pending traffic warrants"}')
      ON CONFLICT (reference_number) DO NOTHING
    `, [testFin]);

    await client.query('COMMIT');
    console.log('🎉 Transport Agency migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runTransportMigration().catch(console.error);