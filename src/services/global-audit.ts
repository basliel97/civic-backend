import { pool } from '../db/pool.js';

/**
 * 🛠️ SYSTEM-LEVEL ADMIN ACTIONS
 * Fetches only logs that are NOT tied to any bureau.
 * (e.g., Creating a new Agency, Global Settings, Banning words, etc.)
 */
export async function getGlobalSystemAuditLogs(limit = 100, offset = 0) {
  const result = await pool.query(
    `SELECT
      aal.id,
      aal.admin_id,
      aal.action,
      aal.entity_type,
      aal.entity_id,
      aal.old_values,
      aal.new_values,
      aal.metadata,
      aal.created_at,
      u.name as admin_name,
      u.email as admin_email
    FROM admin_audit_logs aal
    JOIN "user" u ON aal.admin_id = u.id
    WHERE aal.bureau_id IS NULL -- 👈 ONLY System-level actions
    ORDER BY aal.created_at DESC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

/**
 * 📊 GLOBAL SYSTEM STATS (Bureau-Free)
 * High-level system health metrics.
 */
export async function getGlobalAuditStats() {
  // 1. Total Citizens (Citizens are global, not bureau-specific)
  const citizens = await pool.query("SELECT COUNT(*) FROM \"user\" WHERE role = 'citizen' AND status != 'deleted'");
  
  // 2. Total Registered Agencies
  const bureaus = await pool.query("SELECT COUNT(*) FROM bureaus WHERE status != 'deleted'");
  
  // 3. System Actions in last 30 days (Non-bureau)
  const systemActions = await pool.query(
    "SELECT COUNT(*) FROM admin_audit_logs WHERE bureau_id IS NULL AND created_at >= NOW() - INTERVAL '30 days'"
  );

  return {
    total_citizens: parseInt(citizens.rows[0].count),
    total_active_agencies: parseInt(bureaus.rows[0].count),
    system_management_actions_30d: parseInt(systemActions.rows[0].count),
    server_timestamp: new Date().toISOString()
  };
}

/**
 * 🔐 SECURITY AUDITS (Global Level)
 * Login/Logout/Password changes for Global Super Admins.
 */
export async function getGlobalSecurityLogs() {
  const securityActions = ['login', 'logout', 'password_change'];
  const result = await pool.query(
    `SELECT aal.*, u.name as admin_name
     FROM admin_audit_logs aal
     JOIN "user" u ON aal.admin_id = u.id
     WHERE aal.bureau_id IS NULL 
     AND aal.action = ANY($1)
     ORDER BY aal.created_at DESC LIMIT 50`,
    [securityActions]
  );
  return result.rows;
}