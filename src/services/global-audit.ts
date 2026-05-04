import { pool } from '../db/pool.js';

// ============================================================================
// GLOBAL AUDIT FUNCTIONS (For Super Admins)
// ============================================================================

export interface GlobalAuditFilters {
  bureauId?: string;
  adminId?: string;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get all admin audit logs across all bureaus (super admin access)
 */
export async function getGlobalAdminAuditLogs(filters: GlobalAuditFilters = {}) {
  let query = `
    SELECT
      aal.id,
      aal.admin_id,
      aal.bureau_id,
      aal.action,
      aal.entity_type,
      aal.entity_id,
      aal.old_values,
      aal.new_values,
      aal.metadata,
      aal.created_at,
      u.name as admin_name,
      u.email as admin_email,
      b.name as bureau_name
    FROM admin_audit_logs aal
    JOIN "user" u ON aal.admin_id = u.id
    LEFT JOIN bureaus b ON aal.bureau_id = b.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.bureauId) {
    params.push(filters.bureauId);
    query += ` AND aal.bureau_id = $${paramCount++}`;
  }

  if (filters.adminId) {
    params.push(filters.adminId);
    query += ` AND aal.admin_id = $${paramCount++}`;
  }

  if (filters.action) {
    params.push(filters.action);
    query += ` AND aal.action = $${paramCount++}`;
  }

  if (filters.entityType) {
    params.push(filters.entityType);
    query += ` AND aal.entity_type = $${paramCount++}`;
  }

  if (filters.startDate) {
    params.push(filters.startDate);
    query += ` AND aal.created_at >= $${paramCount++}`;
  }

  if (filters.endDate) {
    params.push(filters.endDate);
    query += ` AND aal.created_at <= $${paramCount++}`;
  }

  query += ` ORDER BY aal.created_at DESC`;

  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  params.push(limit, offset);
  query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get all application audit logs across all bureaus (super admin access)
 */
export async function getGlobalApplicationAuditLogs(filters: GlobalAuditFilters = {}) {
  let query = `
    SELECT
      aal.id,
      aal.application_id,
      aal.changed_by,
      aal.old_status,
      aal.new_status,
      aal.action_notes,
      aal.created_at,
      u.name as admin_name,
      u.email as admin_email,
      b.name as bureau_name,
      ta.service_type,
      ta.application_status as current_status,
      bs.service_name
    FROM application_audit_logs aal
    JOIN transport_applications ta ON aal.application_id = ta.id
    JOIN bureau_services bs ON ta.service_id = bs.id
    JOIN bureaus b ON bs.bureau_id = b.id
    JOIN "user" u ON aal.changed_by = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.bureauId) {
    params.push(filters.bureauId);
    query += ` AND bs.bureau_id = $${paramCount++}`;
  }

  if (filters.adminId) {
    params.push(filters.adminId);
    query += ` AND aal.changed_by = $${paramCount++}`;
  }

  if (filters.startDate) {
    params.push(filters.startDate);
    query += ` AND aal.created_at >= $${paramCount++}`;
  }

  if (filters.endDate) {
    params.push(filters.endDate);
    query += ` AND aal.created_at <= $${paramCount++}`;
  }

  query += ` ORDER BY aal.created_at DESC`;

  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  params.push(limit, offset);
  query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get combined audit logs (both admin and application) for comprehensive view
 */
export async function getGlobalCombinedAuditLogs(filters: GlobalAuditFilters = {}) {
  // Get admin audit logs
  const adminLogs = await getGlobalAdminAuditLogs(filters);

  // Get application audit logs
  const appLogs = await getGlobalApplicationAuditLogs(filters);

  // Combine and sort by created_at
  const combinedLogs = [
    ...adminLogs.map(log => ({ ...log, log_type: 'admin_action' })),
    ...appLogs.map(log => ({ ...log, log_type: 'application_change' }))
  ];

  // Sort by created_at descending
  combinedLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Apply pagination
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  return combinedLogs.slice(offset, offset + limit);
}

/**
 * Get audit statistics for dashboard overview
 */
export async function getGlobalAuditStats() {
  // Admin audit stats
  const adminStats = await pool.query(`
    SELECT
      COUNT(*) as total_admin_actions,
      COUNT(DISTINCT admin_id) as unique_admins,
      COUNT(DISTINCT bureau_id) as bureaus_with_activity,
      MAX(created_at) as latest_admin_action
    FROM admin_audit_logs
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `);

  // Application audit stats
  const appStats = await pool.query(`
    SELECT
      COUNT(*) as total_application_changes,
      COUNT(DISTINCT changed_by) as unique_admins_making_changes,
      COUNT(DISTINCT application_id) as applications_modified,
      MAX(created_at) as latest_application_change
    FROM application_audit_logs
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `);

  // Recent activity by bureau
  const bureauActivity = await pool.query(`
    SELECT
      b.name as bureau_name,
      b.id as bureau_id,
      COUNT(DISTINCT aal.admin_id) as active_admins,
      COUNT(aal.id) as admin_actions,
      COUNT(DISTINCT aal2.application_id) as applications_changed
    FROM bureaus b
    LEFT JOIN admin_audit_logs aal ON b.id = aal.bureau_id AND aal.created_at >= NOW() - INTERVAL '30 days'
    LEFT JOIN application_audit_logs aal2 ON aal2.application_id IN (
      SELECT ta.id FROM transport_applications ta
      JOIN bureau_services bs ON ta.service_id = bs.id
      WHERE bs.bureau_id = b.id
    ) AND aal2.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY b.id, b.name
    ORDER BY admin_actions DESC
  `);

  return {
    admin_audit: adminStats.rows[0],
    application_audit: appStats.rows[0],
    bureau_activity: bureauActivity.rows,
    period: 'last_30_days'
  };
}

/**
 * Get audit logs by entity type for detailed analysis
 */
export async function getAuditLogsByEntityType(entityType: string, filters: GlobalAuditFilters = {}) {
  let query = `
    SELECT
      aal.id,
      aal.admin_id,
      aal.bureau_id,
      aal.action,
      aal.entity_type,
      aal.entity_id,
      aal.old_values,
      aal.new_values,
      aal.metadata,
      aal.created_at,
      u.name as admin_name,
      u.email as admin_email,
      b.name as bureau_name
    FROM admin_audit_logs aal
    JOIN "user" u ON aal.admin_id = u.id
    LEFT JOIN bureaus b ON aal.bureau_id = b.id
    WHERE aal.entity_type = $1
  `;
  const params: any[] = [entityType];
  let paramCount = 2;

  if (filters.bureauId) {
    params.push(filters.bureauId);
    query += ` AND aal.bureau_id = $${paramCount++}`;
  }

  if (filters.adminId) {
    params.push(filters.adminId);
    query += ` AND aal.admin_id = $${paramCount++}`;
  }

  if (filters.startDate) {
    params.push(filters.startDate);
    query += ` AND aal.created_at >= $${paramCount++}`;
  }

  if (filters.endDate) {
    params.push(filters.endDate);
    query += ` AND aal.created_at <= $${paramCount++}`;
  }

  query += ` ORDER BY aal.created_at DESC`;

  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  params.push(limit, offset);
  query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get security-related audit logs (login attempts, permission changes, etc.)
 */
export async function getSecurityAuditLogs(filters: GlobalAuditFilters = {}) {
  // Security-related actions
  const securityActions = ['login', 'logout', 'password_change', 'permission_grant', 'permission_revoke', 'user_suspend', 'user_activate'];

  let query = `
    SELECT
      aal.id,
      aal.admin_id,
      aal.bureau_id,
      aal.action,
      aal.entity_type,
      aal.entity_id,
      aal.old_values,
      aal.new_values,
      aal.metadata,
      aal.created_at,
      u.name as admin_name,
      u.email as admin_email,
      b.name as bureau_name
    FROM admin_audit_logs aal
    JOIN "user" u ON aal.admin_id = u.id
    LEFT JOIN bureaus b ON aal.bureau_id = b.id
    WHERE aal.action = ANY($1)
  `;
  const params: any[] = [securityActions];
  let paramCount = 2;

  if (filters.bureauId) {
    params.push(filters.bureauId);
    query += ` AND aal.bureau_id = $${paramCount++}`;
  }

  if (filters.startDate) {
    params.push(filters.startDate);
    query += ` AND aal.created_at >= $${paramCount++}`;
  }

  if (filters.endDate) {
    params.push(filters.endDate);
    query += ` AND aal.created_at <= $${paramCount++}`;
  }

  query += ` ORDER BY aal.created_at DESC`;

  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  params.push(limit, offset);
  query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;

  const result = await pool.query(query, params);
  return result.rows;
}