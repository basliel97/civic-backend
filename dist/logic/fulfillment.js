import { pool } from '../db/pool.js';
/**
 * 🧠 THE COMPLETE FULFILLMENT ENGINE
 * Maps every Automation Tag to a specific legal database action.
 */
export const FulfillmentRegistry = {
    // 1. RENEWAL
    'driver_license_renewal': async (userId, appId) => {
        await pool.query(`UPDATE driver_licenses
       SET expiry_date = expiry_date + INTERVAL '2 years',
           status = 'active',
           updated_at = NOW()
       WHERE user_id = $1`, [userId]);
        await createNotification(userId, "License Renewed", "Your driver's license has been successfully extended for 2 years.", '/application/', appId);
    },
    // 2. INTERNATIONAL VERIFICATION
    'driver_license_international': async (userId, appId) => {
        const certNo = `INTL-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        await pool.query(`INSERT INTO certificates (user_id, application_id, certificate_type, certificate_number, expiry_date)
       VALUES ($1, $2, 'international_verification', $3, NOW() + INTERVAL '1 year')`, [userId, appId, certNo]);
        await createNotification(userId, "International Permit Ready", "Your international verification certificate has been issued.", '/application/', appId);
    },
    // 3. REPLACEMENT
    'driver_license_replacement': async (userId, appId) => {
        const newNo = `DL-${Math.floor(1000000 + Math.random() * 9000000)}`;
        await pool.query(`UPDATE driver_licenses SET license_number = $1, updated_at = NOW() WHERE user_id = $2`, [newNo, userId]);
        await createNotification(userId, "License Replaced", "Your replacement license is ready. Old number has been voided.", '/application/', appId);
    },
    // 4. FILE TRANSFER
    'driver_license_transfer': async (userId, appId, responses) => {
        const target = responses?.target_region || 'Regional Office';
        await pool.query(`UPDATE driver_licenses SET issuing_office = $1, last_transfer_date = NOW() WHERE user_id = $2`, [target, userId]);
        await createNotification(userId, "Transfer Complete", `Your driver file has been moved to the ${target} bureau.`, '/application/', appId);
    },
    // 5. SPECIALTY TRAINING INFO
    'specialty_training_info': async (userId, appId, responses) => {
        const trainingType = responses?.training_type || 'General Specialty';
        await pool.query(`UPDATE driver_licenses
       SET categories = categories || $1::jsonb,
           updated_at = NOW()
       WHERE user_id = $2`, [JSON.stringify([trainingType]), userId]);
        await createNotification(userId, "Training Approved", `Specialty endorsement (${trainingType}) added to your digital record.`, '/application/', appId);
    },
    // 6. TAXI COMPETENCY CERTIFICATE
    'taxi_competency_cert': async (userId, appId) => {
        await pool.query(`UPDATE driver_licenses
       SET categories = categories || '["Public Transport (Taxi)"]'::jsonb,
           updated_at = NOW()
       WHERE user_id = $1`, [userId]);
        await createNotification(userId, "Taxi Competency Issued", "You are now authorized to operate public taxi services.", '/application/', appId);
    },
    // 8. TEST RESCHEDULING (Note: Tag is test_rescheduling)
    'test_rescheduling': async (userId, appId, responses) => {
        const newDate = responses?.preferred_date || new Date();
        await pool.query(`INSERT INTO test_records (user_id, scheduled_date, status)
       VALUES ($1, $2, 'scheduled')`, [userId, newDate]);
        await createNotification(userId, "New Test Date", `Your theory test has been rescheduled to ${new Date(newDate).toLocaleDateString()}.`, '/application/', appId);
    },
    // 9. LIFTING SUSPENSION
    'lift_suspension': async (userId, appId) => {
        await pool.query(`UPDATE driver_licenses SET status = 'active', updated_at = NOW() WHERE user_id = $1`, [userId]);
        await createNotification(userId, "License Activated", "Suspension lifted. You are now legally cleared to drive.", '/application/', appId);
    },
    // 10. DRIVER INFORMATION REQUEST
    'driver_info_request': async (userId, appId) => {
        const certNo = `INFO-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        await pool.query(`INSERT INTO certificates (user_id, application_id, certificate_type, certificate_number)
       VALUES ($1, $2, 'driver_transcript', $3)`, [userId, appId, certNo]);
        await createNotification(userId, "Transcript Ready", "Your official driving record transcript is available in your documents.", '/application/', appId);
    }
};
/**
 * 🔔 Helper: Create internal notification
 */
async function createNotification(userId, title, message, screen, targetId) {
    await pool.query(`INSERT INTO notifications (user_id, title, message, type, target_screen, target_id) VALUES ($1, $2, $3, 'success', $4, $5)`, [userId, title, message, screen || null, targetId || null]);
}
