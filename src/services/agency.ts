import { pool } from '../db/pool.js';

export interface AgencyApplication {
  userId: string;
  serviceId: string;
  deliveryMethod?: string;
  externalReferences?: Record<string, string>;
  documents?: string[];
}

// ============================================================================
// 1. CITIZEN FUNCTIONS (Used by the Mobile App)
// ============================================================================

export async function verifyExternalRecord(fin: string, recordType: string, referenceNumber: string) {
  const result = await pool.query(
    `SELECT * FROM external_agency_records
     WHERE record_type = $1 AND reference_number = $2 AND citizen_fin = $3`,
    [recordType, referenceNumber, fin]
  );
  return result.rows[0] || null;
}

export async function submitApplication(data: AgencyApplication) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the service exists and is active
    const serviceCheck = await client.query(
      `SELECT id, bureau_id, service_name FROM bureau_services WHERE id = $1 AND is_active = TRUE`,
      [data.serviceId]
    );

    if (serviceCheck.rows.length === 0) {
      throw new Error('Invalid or inactive service');
    }

    const result = await client.query(
      `INSERT INTO transport_applications
        (user_id, service_id, service_type, delivery_method, external_references, documents, application_status, payment_status, delivery_status)
       VALUES ($1, $2, 'dynamic', $3, $4, $5, 'submitted', 'pending', 'pending')
       RETURNING *`,
      [
        data.userId,
        data.serviceId,
        data.deliveryMethod || 'pickup',
        JSON.stringify(data.externalReferences || {}),
        JSON.stringify(data.documents || [])
      ]
    );

    const application = result.rows[0];

    // Audit Log
    await client.query(
      `INSERT INTO application_audit_logs (application_id, new_status, action_notes)
       VALUES ($1, 'submitted', 'Citizen submitted application with documents')`,
      [application.id]
    );

    await client.query('COMMIT');
    return application;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function processMockPayment(applicationId: string, userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check payment_status specifically
    const appCheck = await client.query(
      'SELECT id, payment_status FROM transport_applications WHERE id = $1 AND user_id = $2',
      [applicationId, userId]
    );

    if (appCheck.rows.length === 0) throw new Error('Application not found');
    if (appCheck.rows[0].payment_status === 'paid') throw new Error('Application is already paid');

    const mockRef = `PAY-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const updated = await client.query(
      `UPDATE transport_applications
       SET payment_status = 'paid', payment_reference = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [mockRef, applicationId]
    );

    // Audit Log for the payment
    await client.query(
      `INSERT INTO application_audit_logs (application_id, old_status, new_status, action_notes)
       VALUES ($1, 'pending_payment', 'paid', $2)`,
      [applicationId, `Payment confirmed. Reference: ${mockRef}`]
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getCitizenApplications(userId: string) {
  const result = await pool.query(
    `SELECT ta.*, bs.service_name, bs.service_description
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE ta.user_id = $1
     ORDER BY ta.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getLicenseInfo(userId: string) {
  const result = await pool.query(
    `SELECT * FROM driver_licenses WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// ============================================================================
// 2. ADMIN FUNCTIONS (Used by Agency Staff to review applications)
// ============================================================================

export interface ApplicationFilters {
  status?: string;
  serviceId?: string;
  bureauId?: string;
}

export async function getAdminApplications(filters: ApplicationFilters) {
  let query = `
    SELECT
      ta.*,
      u.name as citizen_name,
      u.username as citizen_fin,
      bs.service_name,
      bs.service_description,
      bs.base_fee
    FROM transport_applications ta
    JOIN "user" u ON ta.user_id = u.id
    LEFT JOIN bureau_services bs ON ta.service_id = bs.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.status) {
    params.push(filters.status);
    query += ` AND ta.application_status = $${params.length}`;
  }

  if (filters.serviceId) {
    params.push(filters.serviceId);
    query += ` AND ta.service_id = $${params.length}`;
  }

  if (filters.bureauId) {
    params.push(filters.bureauId);
    query += ` AND bs.bureau_id = $${params.length}`;
  }

  query += ` ORDER BY ta.created_at DESC`;
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getPublicBureauServices(bureauId: string) {
  const result = await pool.query(
    `SELECT id, service_name, service_description, base_fee, required_docs
     FROM bureau_services
     WHERE bureau_id = $1 AND is_active = TRUE
     ORDER BY service_name ASC`,
    [bureauId]
  );
  return result.rows;
}

/**
 * Get applications filtered by service type, with optional bureau scope.
 *
 * @param bureauId - If provided, restricts results to services belonging to this bureau
 * @param serviceType - The service type to filter by (e.g., 'renewal', 'replacement')
 * @param status - Optional status filter
 */
export async function getApplicationsByService(bureauId: string | null | undefined, serviceType: string, status?: string) {
  let query = `
    SELECT
      ta.*,
      u.name as citizen_name,
      u.username as citizen_fin
    FROM transport_applications ta
    JOIN "user" u ON ta.user_id = u.id
    WHERE ta.service_type = $1
  `;
  const params: any[] = [serviceType];

  // If bureauId is provided, restrict to that bureau's services
  if (bureauId) {
    params.push(bureauId);
    query += ` AND ta.service_id IN (SELECT id FROM bureau_services WHERE bureau_id = $${params.length})`;
  }

  if (status) {
    params.push(status);
    query += ` AND ta.application_status = $${params.length}`;
  }

  query += ` ORDER BY ta.created_at DESC`;
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Review an application and optionally issue a license.
 *
 * IMPORTANT: License issuance only occurs if:
 * 1. The application_status becomes 'approved', AND
 * 2. The service name contains 'Driver License' (case-insensitive)
 *
 * This makes the logic generic for other agency types (Health, Education, etc.)
 */
export async function reviewApplication(
  applicationId: string,
  adminId: string,
  updates: {
    appStatus?: string,
    deliveryStatus?: string,
    notes?: string,
    tracking?: string
  }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Use FOR UPDATE to lock the row and prevent race conditions
    const appResult = await client.query(
      `SELECT ta.*, bs.service_name
       FROM transport_applications ta
       LEFT JOIN bureau_services bs ON ta.service_id = bs.id
       WHERE ta.id = $1 FOR UPDATE`,
      [applicationId]
    );
    if (appResult.rows.length === 0) throw new Error('Application not found');
    const app = appResult.rows[0];

    // Update with COALESCE so if we don't provide a status, it keeps the old one
    const updated = await client.query(
      `UPDATE transport_applications
       SET application_status = COALESCE($1, application_status),
           delivery_status = COALESCE($2, delivery_status),
           admin_notes = $3,
           delivery_tracking_number = $4,
           assigned_admin_id = $5,
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [updates.appStatus, updates.deliveryStatus, updates.notes || null, updates.tracking || null, adminId, applicationId]
    );

    // Audit Log
    await client.query(
      `INSERT INTO application_audit_logs (application_id, changed_by, old_status, new_status, action_notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [applicationId, adminId, app.application_status, updates.appStatus || app.application_status, updates.notes || 'Admin updated status']
    );

    // CONDITIONAL LICENSE ISSUANCE
    // Only issues a driver's license if:
    // 1. Status is approved, AND
    // 2. Service name contains 'Driver License' (generic check for multi-agency support)
    const serviceName = app.service_name || '';
    const isDriverLicenseService = serviceName.toLowerCase().includes('driver license');

    if (updates.appStatus === 'approved' && isDriverLicenseService) {
      const licenseNo = `DL-${Math.floor(1000000 + Math.random() * 9000000)}`;
      const issueDate = new Date();
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 2);

      await client.query(
        `INSERT INTO driver_licenses (user_id, license_number, categories, issue_date, expiry_date, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (license_number) DO NOTHING`,
        [app.user_id, licenseNo, JSON.stringify(["Automobile (Grade 1)"]), issueDate, expiryDate]
      );
    }

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addApplicationComment(appId: string, authorId: string, role: string, text: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert the new comment
    const commentResult = await client.query(
      `INSERT INTO application_comments (application_id, author_id, author_role, comment_text)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [appId, authorId, role, text]
    );

    // Update the main application's "updated_at" timestamp
    await client.query(
      `UPDATE transport_applications SET updated_at = NOW() WHERE id = $1`,
      [appId]
    );

    await client.query('COMMIT');
    return commentResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// 3. AGENCY MANAGEMENT FUNCTIONS (For Agency Admins)
// ============================================================================

export async function getApplicationComments(appId: string) {
  const result = await pool.query(
    `SELECT
        ac.id,
        ac.application_id,
        ac.author_id,
        ac.author_role,
        ac.comment_text,
        ac.created_at,
        u.name as author_name,
        u.image as author_image
     FROM application_comments ac
     JOIN "user" u ON ac.author_id = u.id
     WHERE ac.application_id = $1
     ORDER BY ac.created_at ASC`,
    [appId]
  );

  return result.rows;
}

export async function getAgencyStats(bureauId?: string) {
  let query = `
    SELECT
      COUNT(*) as total_apps,
      COUNT(*) FILTER (WHERE ta.application_status = 'submitted') as awaiting_payment,
      COUNT(*) FILTER (WHERE ta.payment_status = 'paid' AND ta.application_status != 'approved') as awaiting_review,
      COUNT(*) FILTER (WHERE ta.application_status = 'approved') as total_approved,
      COUNT(DISTINCT ta.user_id) as unique_citizens
    FROM transport_applications ta
    LEFT JOIN bureau_services bs ON ta.service_id = bs.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (bureauId) {
    params.push(bureauId);
    query += ` AND bs.bureau_id = $${params.length}`;
  }

  const result = await pool.query(query, params);

  let revenueQuery = `
    SELECT COUNT(*) * 500 as total_revenue
    FROM transport_applications ta
    LEFT JOIN bureau_services bs ON ta.service_id = bs.id
    WHERE ta.payment_status = 'paid'
  `;
  const revenueParams: any[] = [];

  if (bureauId) {
    revenueParams.push(bureauId);
    revenueQuery += ` AND bs.bureau_id = $${revenueParams.length}`;
  }

  const revenue = await pool.query(revenueQuery, revenueParams);

  return {
    ...result.rows[0],
    revenue: revenue.rows[0].total_revenue || 0
  };
}

export async function createBureauService(bureauId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO bureau_services (bureau_id, service_name, service_description, base_fee, required_docs)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [bureauId, data.name, data.description, data.fee, JSON.stringify(data.docs || [])]
  );
  return result.rows[0];
}

export async function getBureauServices(bureauId: string) {
  const result = await pool.query(
    'SELECT * FROM bureau_services WHERE bureau_id = $1 AND is_active = TRUE',
    [bureauId]
  );
  return result.rows;
}

export async function getBureauStaff(bureauId: string) {
  const result = await pool.query(
    'SELECT id, name, email, role, last_login_at FROM "user" WHERE bureau_id = $1 AND role = $2',
    [bureauId, 'admin']
  );
  return result.rows;
}

export async function cancelApplication(applicationId: string, adminId: string, reason: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current application status for audit log
    const appResult = await client.query(
      'SELECT application_status FROM transport_applications WHERE id = $1',
      [applicationId]
    );

    if (appResult.rows.length === 0) throw new Error('Application not found');
    const oldStatus = appResult.rows[0].application_status;

    // Soft delete: Change application_status to 'cancelled'
    const updated = await client.query(
      `UPDATE transport_applications
       SET application_status = 'cancelled', admin_notes = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, applicationId]
    );

    // Log the cancellation
    await client.query(
      `INSERT INTO application_audit_logs (application_id, changed_by, old_status, new_status, action_notes)
       VALUES ($1, $2, $3, 'cancelled', $4)`,
      [applicationId, adminId, oldStatus, reason]
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// ALIASES FOR BACKWARD COMPATIBILITY
// ============================================================================

/** @deprecated Use getAgencyStats instead */
export const getTransportStats = getAgencyStats;

/** @deprecated Use createBureauService instead */
export const createAgencyService = createBureauService;

/** @deprecated Use getBureauServices instead */
export const getAgencyServices = getBureauServices;

/** @deprecated Use getBureauStaff instead */
export const getAgencyStaff = getBureauStaff;
