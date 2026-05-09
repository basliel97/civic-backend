import type { PoolClient } from "pg";


/**
 * 🧠 THE COMPLETE FULFILLMENT ENGINE
 * Now accepts 'client' to run within the existing transaction.
 */
export const FulfillmentRegistry: Record<string, (client: PoolClient, userId: string, appId: string, responses: any) => Promise<void>> = {

  'driver_license_renewal': async (client, userId, appId) => {
    await client.query(
      `UPDATE driver_licenses SET expiry_date = expiry_date + INTERVAL '2 years', status = 'active', updated_at = NOW() WHERE user_id = $1`, [userId]
    );
    await createNotification(client, userId, "License Renewed", "Your driver's license has been successfully extended for 2 years.", '/application/', appId);
  },

  'driver_license_international': async (client, userId, appId) => {
    const certNo = `INTL-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    await client.query(
      `INSERT INTO certificates (user_id, application_id, certificate_type, certificate_number, expiry_date) VALUES ($1, $2, 'international_verification', $3, NOW() + INTERVAL '1 year')`,[userId, appId, certNo]
    );
    await createNotification(client, userId, "International Permit Ready", "Your international verification certificate has been issued.", '/application/', appId);
  },

  'driver_license_replacement': async (client, userId, appId) => {
    const newNo = `DL-${Math.floor(1000000 + Math.random() * 9000000)}`;
    await client.query(
      `UPDATE driver_licenses SET license_number = $1, updated_at = NOW() WHERE user_id = $2`,
      [newNo, userId]
    );
    await createNotification(client, userId, "License Replaced", "Your replacement license is ready.", '/application/', appId);
  },

  'driver_license_transfer': async (client, userId, appId, responses) => {
    const target = responses?.target_region || 'Regional Office';
    await client.query(
      `UPDATE driver_licenses SET issuing_office = $1, last_transfer_date = NOW() WHERE user_id = $2`,
      [target, userId]
    );
    await createNotification(client, userId, "Transfer Complete", `Your file moved to ${target}.`, '/application/', appId);
  },

  'specialty_training_info': async (client, userId, appId, responses) => {
    const trainingType = responses?.training_type || 'General Specialty';
    await client.query(
      `UPDATE driver_licenses SET categories = categories || $1::jsonb, updated_at = NOW() WHERE user_id = $2`, 
      [JSON.stringify([trainingType]), userId]
    );
    await createNotification(client, userId, "Training Approved", `Endorsement (${trainingType}) added.`, '/application/', appId);
  },

  'taxi_competency_cert': async (client, userId, appId) => {
    await client.query(
      `UPDATE driver_licenses SET categories = categories || '["Public Transport (Taxi)"]'::jsonb, updated_at = NOW() WHERE user_id = $1`, [userId]
    );
    await createNotification(client, userId, "Taxi Competency Issued", "You are now authorized for public taxi services.", '/application/', appId);
  },

  'test_rescheduling': async (client, userId, appId, responses) => {
    const newDate = responses?.preferred_date || new Date();
    await client.query(
      `INSERT INTO test_records (user_id, scheduled_date, status) VALUES ($1, $2, 'scheduled')`, [userId, newDate]
    );
    await createNotification(client, userId, "New Test Date", `Theory test rescheduled to ${new Date(newDate).toLocaleDateString()}.`, '/application/', appId);
  },

  'lift_suspension': async (client, userId, appId) => {
    await client.query(
      `UPDATE driver_licenses SET status = 'active', updated_at = NOW() WHERE user_id = $1`, [userId]
    );
    await createNotification(client, userId, "License Activated", "Suspension lifted.", '/application/', appId);
  },

  'driver_info_request': async (client, userId, appId) => {
    const certNo = `INFO-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    await client.query(
      `INSERT INTO certificates (user_id, application_id, certificate_type, certificate_number) VALUES ($1, $2, 'driver_transcript', $3)`, [userId, appId, certNo]
    );
    await createNotification(client, userId, "Transcript Ready", "Your transcript is available.", '/application/', appId);
  }
};

async function createNotification(client: PoolClient, userId: string, title: string, message: string, screen?: string, targetId?: string) {
  await client.query(
    `INSERT INTO notifications (user_id, title, message, type, target_screen, target_id) VALUES ($1, $2, $3, 'success', $4, $5)`,[userId, title, message, screen || null, targetId || null]
  );
}