import { pool } from '../db/pool.js';
import { FulfillmentRegistry } from '../logic/fulfillment.js';

export interface AgencyApplication {
  userId: string;
  serviceId: string;
  deliveryMethod?: string;
  externalReferences?: Record<string, string>;
  documents?: string[];
  formResponses?: any;
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

    // 1. Verify the service exists and is active
    const serviceCheck = await client.query(
      `SELECT id, bureau_id, service_name FROM bureau_services WHERE id = $1 AND is_active = TRUE`,
      [data.serviceId]
    );

    if (serviceCheck.rows.length === 0) {
      throw new Error('Invalid or inactive service');
    }

    // 2. Insert application with all 6 dynamic fields
    // Ensure 'form_responses' column exists in your 'transport_applications' table
    const result = await client.query(
      `INSERT INTO transport_applications
        (user_id, service_id, service_type, delivery_method, external_references, documents, form_responses, application_status, payment_status, delivery_status)
       VALUES ($1, $2, 'dynamic', $3, $4, $5, $6, 'submitted', 'pending', 'pending')
       RETURNING *`,[
        data.userId,
        data.serviceId,
        data.deliveryMethod || 'pickup',
        JSON.stringify(data.externalReferences || {}),
        JSON.stringify(data.documents || []),
        JSON.stringify(data.formResponses || {})
      ]
    );

    const application = result.rows[0];

    // 3. Audit Log
    await client.query(
      `INSERT INTO application_audit_logs (application_id, new_status, action_notes)
       VALUES ($1, 'submitted', 'Citizen submitted application with documents and form data')`,
      [application.id]
    );

    // 4. Notify Staff
    await notifyBureauStaff(serviceCheck.rows[0].bureau_id, { 
      title: 'New Application', 
      message: `New request for ${serviceCheck.rows[0].service_name} submitted.`, 
      type: 'info', 
      screen: '/application/', 
      targetId: application.id 
    });

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

    // Fetch bureau_id for notification
    const appResult = await client.query(
      `SELECT bs.bureau_id FROM transport_applications ta
       JOIN bureau_services bs ON ta.service_id = bs.id
       WHERE ta.id = $1`,
      [applicationId]
    );
    await notifyBureauStaff(appResult.rows[0].bureau_id, { title: 'Payment Confirmed', message: 'Citizen has completed payment for App #' + applicationId.slice(0,8), type: 'success', screen: '/application/', targetId: applicationId });

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteApplicationByCitizen(appId: string, userId: string) {
  const result = await pool.query(
    `DELETE FROM transport_applications 
     WHERE id = $1 AND user_id = $2 AND application_status = 'cancelled'
     RETURNING id`,
    [appId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('You can only delete applications that are already cancelled.');
  }
  return true;
}



export async function getCitizenApplications(userId: string) {
  const result = await pool.query(
    `SELECT 
        ta.*, 
        bs.service_name -- 🆕 Fetch the real name from the joined table
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

export async function getAdminApplicationById(applicationId: string, bureauId: string) {
  const result = await pool.query(
    `SELECT
       ta.*, 
       u.name AS citizen_name,
       u.username AS citizen_fin,
       bs.service_name,
       bs.service_description
     FROM transport_applications ta
     JOIN "user" u ON ta.user_id = u.id
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE ta.id = $1
       AND bs.bureau_id = $2
     LIMIT 1`,
    [applicationId, bureauId]
  );

  return result.rows[0] || null;
}

export async function getPublicBureauServices(bureauId: string) {
  const result = await pool.query(
    `SELECT id, service_name, service_description, base_fee, required_docs, form_schema,    -- 🆕 ADD THIS
        automation_tag
     FROM bureau_services
     WHERE bureau_id = $1 AND is_active = TRUE
     ORDER BY service_name ASC`,
    [bureauId]
  );
  return result.rows;
}

export async function getApplicationsGroupedByService(bureauId: string) {
  const services = await pool.query(
    `SELECT id, service_name, service_description, base_fee
     FROM bureau_services
     WHERE bureau_id = $1 AND is_active = TRUE
     ORDER BY service_name ASC`,
    [bureauId]
  );

  const result = [];
  for (const service of services.rows) {
    const apps = await pool.query(
      `SELECT ta.id, ta.user_id, ta.service_id, ta.application_status, ta.payment_status,
              ta.delivery_status, ta.created_at, u.name as citizen_name, u.username as citizen_fin
       FROM transport_applications ta
       JOIN "user" u ON ta.user_id = u.id
       WHERE ta.service_id = $1 AND ta.application_status IN ('submitted', 'paid', 'approved', 'rejected')
       ORDER BY ta.created_at DESC`,
      [service.id]
    );
    result.push({
      service_id: service.id,
      service_name: service.service_name,
      service_description: service.service_description,
      base_fee: service.base_fee,
      applications: apps.rows
    });
  }
  return result;
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

    // 1. FIXED: Added "OF ta" to the FOR UPDATE clause
    // This locks the Application but allows the JOIN to function correctly
    const appResult = await client.query(
      `SELECT 
        ta.id, 
        ta.user_id, 
        ta.application_status, 
        ta.form_responses, 
        bs.automation_tag
       FROM transport_applications ta
       INNER JOIN bureau_services bs ON ta.service_id = bs.id 
       WHERE ta.id = $1 FOR UPDATE OF ta`, 
      [applicationId]
    );
    
    if (appResult.rows.length === 0) throw new Error('Application not found');
    const app = appResult.rows[0];

    // 2. Update the Application Record
    const updated = await client.query(
      `UPDATE transport_applications
       SET application_status = COALESCE($1, application_status),
           delivery_status = COALESCE($2, delivery_status),
           admin_notes = $3,
           delivery_tracking_number = $4,
           assigned_admin_id = $5,
           updated_at = NOW()
       WHERE id = $6 RETURNING *`, 
      [
        updates.appStatus, 
        updates.deliveryStatus, 
        updates.notes || null, 
        updates.tracking || null, 
        adminId, 
        applicationId
      ]
    );

    // 3. Log the change to the Audit Log
    await client.query(
      `INSERT INTO application_audit_logs (application_id, changed_by, old_status, new_status, action_notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        applicationId, 
        adminId, 
        app.application_status, 
        updates.appStatus || app.application_status, 
        updates.notes || 'Admin updated status'
      ]
    );

    // 4. AUTOMATED FULFILLMENT
    // Check if the new status is 'approved' (Case-insensitive for safety)
    if (updates.appStatus?.toLowerCase() === 'approved') {
      const tag = app.automation_tag;
      const responses = app.form_responses;

      if (tag && FulfillmentRegistry[tag]) {
        console.log(`[Fulfillment] 🚀 Executing automated logic for tag: ${tag}`);
        await FulfillmentRegistry[tag](app.user_id, applicationId, responses);
      } else {
        console.log(`[Fulfillment] ℹ️ No automated logic defined for tag: ${tag}`);
      }

      await notifyUser(app.user_id, { title: 'Application Approved', message: 'Your request has been approved and finalized.', type: 'success', screen: '/application/', targetId: applicationId });
    } else if (updates.appStatus?.toLowerCase() === 'rejected') {
      await notifyUser(app.user_id, { title: 'Application Rejected', message: 'Your request was not approved. Please check the officer notes.', type: 'danger', screen: '/application/', targetId: applicationId });
    }

    await client.query('COMMIT');
    return updated.rows[0];

  } catch (error) {
    await client.query('ROLLBACK'); 
    console.error('[reviewApplication Error]:', error);
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

    // Fetch app details for notification
    const appDetails = await client.query(
      `SELECT ta.user_id, bs.bureau_id FROM transport_applications ta
       JOIN bureau_services bs ON ta.service_id = bs.id
       WHERE ta.id = $1`,
      [appId]
    );
    const app = appDetails.rows[0];

    if (role === 'admin') {
      await notifyUser(app.user_id, { title: 'New Message', message: 'An officer sent a message regarding your application.', type: 'info', screen: '/application/chat/', targetId: appId });
    } else if (role === 'citizen') {
      await notifyBureauStaff(app.bureau_id, { title: 'Citizen Message', message: 'The applicant sent a new message.', type: 'info', screen: '/application/chat/', targetId: appId });
    }

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

export async function getAgencyDetailedStats(bureauId: string) {
  // Applications by status
  const applicationsByStatusResult = await pool.query(
    `SELECT ta.application_status, COUNT(*) as count
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1
     GROUP BY ta.application_status`,
    [bureauId]
  );
  const applicationsByStatus = Object.fromEntries(
    applicationsByStatusResult.rows.map(row => [row.application_status, parseInt(row.count)])
  );

  // Applications by service
  const applicationsByServiceResult = await pool.query(
    `SELECT bs.service_name, COUNT(*) as count
     FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1
     GROUP BY bs.service_name`,
    [bureauId]
  );
  const applicationsByService = Object.fromEntries(
    applicationsByServiceResult.rows.map(row => [row.service_name, parseInt(row.count)])
  );

  // Revenue by service
  const revenueByServiceResult = await pool.query(
    `SELECT bs.service_name, COUNT(*) * 500 as revenue
     FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1 AND ta.payment_status = 'paid'
     GROUP BY bs.service_name`,
    [bureauId]
  );
  const revenueByService = Object.fromEntries(
    revenueByServiceResult.rows.map(row => [row.service_name, parseInt(row.revenue)])
  );

  // Applications over time (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const applicationsOverTimeResult = await pool.query(
    `SELECT DATE(ta.created_at) as date, COUNT(*) as count
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1 AND ta.created_at >= $2
     GROUP BY DATE(ta.created_at)
     ORDER BY DATE(ta.created_at)`,
    [bureauId, thirtyDaysAgo.toISOString()]
  );
  const applicationsOverTime = applicationsOverTimeResult.rows.map(row => ({
    date: row.date,
    count: parseInt(row.count)
  }));

  // Processing times (average days from submission to approval)
  const processingTimesResult = await pool.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (ta.updated_at - ta.created_at))/86400) as avg_processing_days
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1 AND ta.application_status = 'approved'`,
    [bureauId]
  );
  const avgProcessingDays = processingTimesResult.rows[0]?.avg_processing_days || 0;

  // Citizen demographics (for this bureau's applications)
  const citizensByGenderResult = await pool.query(
    `SELECT u.gender, COUNT(DISTINCT ta.user_id) as count
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     JOIN "user" u ON ta.user_id = u.id
     WHERE bs.bureau_id = $1 AND u.gender IS NOT NULL
     GROUP BY u.gender`,
    [bureauId]
  );
  const citizensByGender = Object.fromEntries(
    citizensByGenderResult.rows.map(row => [row.gender, parseInt(row.count)])
  );

  // Top services by application count
  const topServicesResult = await pool.query(
    `SELECT bs.service_name, COUNT(*) as applications
     FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1
     GROUP BY bs.service_name
     ORDER BY applications DESC
     LIMIT 5`,
    [bureauId]
  );
  const topServices = topServicesResult.rows.map(row => ({
    service: row.service_name,
    applications: parseInt(row.applications)
  }));

  return {
    applicationsByStatus,
    applicationsByService,
    revenueByService,
    applicationsOverTime,
    avgProcessingDays: Math.round(avgProcessingDays * 100) / 100, // Round to 2 decimal places
    citizensByGender,
    topServices
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
    'SELECT id, name, email, role, last_login_at FROM "user" WHERE bureau_id = $1 AND role = $2 AND deleted_at IS NULL',
    [bureauId, 'admin']
  );
  return result.rows;
}

// ============================================================================
// SERVICE MANAGEMENT (Update/Delete)
// ============================================================================

export async function updateBureauService(id: string, bureauId: string, data: {
  name?: string;
  description?: string;
  fee?: number;
  docs?: string[];
  isActive?: boolean;
}) {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name !== undefined) {
    updates.push(`service_name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push(`service_description = $${paramCount++}`);
    values.push(data.description);
  }
  if (data.fee !== undefined) {
    updates.push(`base_fee = $${paramCount++}`);
    values.push(data.fee);
  }
  if (data.docs !== undefined) {
    updates.push(`required_docs = $${paramCount++}`);
    values.push(JSON.stringify(data.docs));
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.isActive);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = NOW()`);
  values.push(id, bureauId);

  const result = await pool.query(
    `UPDATE bureau_services SET ${updates.join(', ')} WHERE id = $${paramCount} AND bureau_id = $${paramCount + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Service not found in your bureau');
  }

  return result.rows[0];
}

export async function deleteBureauService(id: string, bureauId: string) {
  const result = await pool.query(
    `UPDATE bureau_services 
     SET is_active = FALSE, updated_at = NOW() 
     WHERE id = $1 AND bureau_id = $2 
     RETURNING *`,
    [id, bureauId]
  );

  if (result.rows.length === 0) {
    throw new Error('Service not found in your bureau');
  }

  return result.rows[0];
}

// ============================================================================
// APPLICATION MANAGEMENT (Extended)
// ============================================================================

export async function updateApplication(id: string, bureauId: string, updates: {
  admin_notes?: string;
  delivery_tracking_number?: string;
  delivery_method?: string;
  assigned_admin_id?: string;
  application_status?: string;
}, adminId: string) {
  // Verify application belongs to bureau
  const check = await pool.query(
    `SELECT ta.* FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE ta.id = $1 AND bs.bureau_id = $2`,
    [id, bureauId]
  );
  if (check.rows.length === 0) {
    throw new Error('Application not found in your bureau');
  }
  const app = check.rows[0];

  // Build dynamic update for allowed fields only
  const allowedFields = ['admin_notes', 'delivery_tracking_number', 'delivery_method', 'assigned_admin_id', 'application_status'];
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIdx++}`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE transport_applications SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );

  // Audit log if status changed
  if (updates.application_status && updates.application_status !== app.application_status) {
    await pool.query(
      `INSERT INTO application_audit_logs (application_id, changed_by, old_status, new_status, action_notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, adminId, app.application_status, updates.application_status, 'Status updated via admin PATCH']
    );
  }

  return result.rows[0];
}

export async function bulkUpdateApplicationStatus(applicationIds: string[], bureauId: string, status: string, adminId: string, notes?: string) {
  if (applicationIds.length === 0) throw new Error('No application IDs provided');

  const result = await pool.query(
    `UPDATE transport_applications ta
     SET application_status = $1, updated_at = NOW()
     FROM bureau_services bs
     WHERE ta.service_id = bs.id
       AND bs.bureau_id = $2
       AND ta.id = ANY($3)
     RETURNING ta.id, ta.application_status`,
    [status, bureauId, applicationIds]
  );

  if (result.rows.length === 0) {
    throw new Error('No applications found or you do not have permission');
  }

  // Bulk audit log
  for (const app of result.rows) {
    await pool.query(
      `INSERT INTO application_audit_logs (application_id, changed_by, new_status, action_notes)
       VALUES ($1, $2, $3, $4)`,
      [app.id, adminId, status, notes || 'Bulk status update']
    );
  }

  return result.rows;
}

// ============================================================================
// COMMENT MANAGEMENT (Update/Delete for admins)
// ============================================================================

export async function updateComment(commentId: string, adminId: string, text: string) {
  const result = await pool.query(
    `UPDATE application_comments 
     SET comment_text = $1, updated_at = NOW() 
     WHERE id = $2 AND author_id = $3 
     RETURNING *`,
    [text, commentId, adminId]
  );

  if (result.rows.length === 0) {
    throw new Error('Comment not found or you do not have permission to edit it');
  }

  return result.rows[0];
}

export async function deleteComment(commentId: string, adminId: string) {
  const result = await pool.query(
    `DELETE FROM application_comments 
     WHERE id = $1 AND author_id = $2 
     RETURNING *`,
    [commentId, adminId]
  );

  if (result.rows.length === 0) {
    throw new Error('Comment not found or you do not have permission to delete it');
  }

  return result.rows[0];
}

// ============================================================================
// ADMIN AUDIT LOGGING
// ============================================================================

export async function logAdminAction(
  adminId: string,
  bureauId: string | null | undefined,
  action: string,
  entityType: string,
  entityId: string | null | undefined,
  oldValues?: any,
  newValues?: any,
  metadata?: any
) {
  await pool.query(
    `INSERT INTO admin_audit_logs 
     (admin_id, bureau_id, action, entity_type, entity_id, old_values, new_values, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      adminId,
      bureauId ?? null,
      action,
      entityType,
      entityId ?? null,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
}

export async function getAdminAuditLogs(bureauId: string, limit: number = 50, offset: number = 0) {
  const result = await pool.query(
    `SELECT 
       id,
       admin_id,
       bureau_id,
       action,
       entity_type,
       entity_id,
       old_values,
       new_values,
       metadata,
       created_at
     FROM admin_audit_logs
     WHERE bureau_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [bureauId, limit, offset]
  );
  return result.rows;
}

export async function getApplicationAuditLogs(bureauId: string, limit: number = 50, offset: number = 0) {
  const result = await pool.query(
    `SELECT 
         al.id,
         al.application_id,
         al.changed_by,
         al.old_status,
         al.new_status,
         al.action_notes,
         al.created_at,
         u.name as admin_name,
         u.email as admin_email,
         'application' as log_type
       FROM application_audit_logs al
       JOIN transport_applications ta ON al.application_id = ta.id
       JOIN bureau_services bs ON ta.service_id = bs.id
       JOIN "user" u ON al.changed_by = u.id
       WHERE bs.bureau_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
    [bureauId, limit, offset]
  );
  return result.rows;
}

export async function getCombinedAuditLogs(bureauId: string, limit: number = 50, offset: number = 0) {
  const [appLogs, adminLogs] = await Promise.all([
    getApplicationAuditLogs(bureauId, limit, offset),
    getAdminAuditLogs(bureauId, limit, offset)
  ]);

  const combined = [...appLogs, ...adminLogs];
  combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return combined.slice(0, limit);
}

// ============================================================================
// ANNOUNCEMENT MANAGEMENT FUNCTIONS
// ============================================================================

export interface AnnouncementData {
  title: string;
  content: string;
  image_url?: string;
  target_role?: string;
}

/**
 * Get announcements for a specific bureau (agency admin)
 */
export async function getBureauAnnouncements(bureauId: string, limit: number = 50, offset: number = 0) {
  const result = await pool.query(
    `SELECT
      id,
      title,
      content,
      image_url,
      bureau_id,
      is_active,
      created_by,
      target_role,
      created_at,
      updated_at
    FROM announcements
    WHERE bureau_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3`,
    [bureauId, limit, offset]
  );
  return result.rows;
}

/**
 * Get global announcements (super admin)
 */
export async function getGlobalAnnouncements(limit: number = 50, offset: number = 0) {
  const result = await pool.query(
    `SELECT
      id,
      title,
      content,
      image_url,
      bureau_id,
      is_active,
      created_by,
      target_role,
      created_at,
      updated_at
    FROM announcements
    WHERE bureau_id IS NULL
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

/**
 * Create a bureau announcement
 */
export async function createBureauAnnouncement(bureauId: string, adminId: string, data: AnnouncementData) {
  const result = await pool.query(
    `INSERT INTO announcements (title, content, image_url, bureau_id, created_by, target_role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING *`,
    [data.title, data.content, data.image_url || null, bureauId, adminId, data.target_role || 'citizen']
  );
  return result.rows[0];
}

/**
 * Create a global announcement
 */
export async function createGlobalAnnouncement(adminId: string, data: AnnouncementData) {
  const result = await pool.query(
    `INSERT INTO announcements (title, content, image_url, bureau_id, created_by, target_role, is_active)
     VALUES ($1, $2, $3, NULL, $4, $5, TRUE)
     RETURNING *`,
    [data.title, data.content, data.image_url || null, adminId, data.target_role || 'citizen']
  );
  return result.rows[0];
}

/**
 * Update an announcement
 */
export async function updateAnnouncement(id: string, bureauId: string | null, adminId: string, data: Partial<AnnouncementData>) {
  // First check if announcement exists and belongs to the bureau (or is global)
  const checkQuery = bureauId
    ? 'SELECT * FROM announcements WHERE id = $1 AND bureau_id = $2'
    : 'SELECT * FROM announcements WHERE id = $1 AND bureau_id IS NULL';

  const check = await pool.query(checkQuery, bureauId ? [id, bureauId] : [id]);
  if (check.rows.length === 0) {
    throw new Error('Announcement not found or you do not have permission to edit it');
  }

  const oldAnnouncement = check.rows[0];

  // Build dynamic update
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.title !== undefined) {
    updates.push(`title = $${paramCount++}`);
    values.push(data.title);
  }
  if (data.content !== undefined) {
    updates.push(`content = $${paramCount++}`);
    values.push(data.content);
  }
  if (data.image_url !== undefined) {
    updates.push(`image_url = $${paramCount++}`);
    values.push(data.image_url);
  }
  if (data.target_role !== undefined) {
    updates.push(`target_role = $${paramCount++}`);
    values.push(data.target_role);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Delete/deactivate an announcement
 */
export async function deleteAnnouncement(id: string, bureauId: string | null, adminId: string) {
  // Check ownership
  const checkQuery = bureauId
    ? 'SELECT * FROM announcements WHERE id = $1 AND bureau_id = $2'
    : 'SELECT * FROM announcements WHERE id = $1 AND bureau_id IS NULL';

  const check = await pool.query(checkQuery, bureauId ? [id, bureauId] : [id]);
  if (check.rows.length === 0) {
    throw new Error('Announcement not found or you do not have permission to delete it');
  }

  // Soft delete by setting is_active to false
  const result = await pool.query(
    `UPDATE announcements SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );

  return result.rows[0];
}

/**
 * Get active announcements for citizens (public endpoint)
 * Returns global announcements + bureau-specific announcements if bureauId is provided
 */
export async function getActiveAnnouncements(filters: { bureauId?: string, type?: 'all' | 'global' | 'bureau' }, limit: number = 20) {
  let query = `
    SELECT
      a.id,
      a.title,
      a.content,
      a.image_url,
      a.bureau_id,
      a.created_at,
      b.name as bureau_name -- 🆕 JOIN to get the Agency Name for the UI
    FROM announcements a
    LEFT JOIN bureaus b ON a.bureau_id = b.id
    WHERE a.is_active = TRUE
  `;
  const params: any[] = [];

  // 🆕 Professional Logic:
  if (filters.type === 'global') {
    query += ` AND a.bureau_id IS NULL`;
  } else if (filters.type === 'bureau' && filters.bureauId) {
    params.push(filters.bureauId);
    query += ` AND a.bureau_id = $${params.length}`;
  } else if (filters.type === 'all') {
    // Don't add extra filters, just get everything active
  } else if (filters.bureauId) {
    // Keep your original "Mixed" logic if just an ID is passed
    params.push(filters.bureauId);
    query += ` AND (a.bureau_id IS NULL OR a.bureau_id = $${params.length})`;
  }

  query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}


export async function getSystemAnnouncements() {
  return await getActiveAnnouncements({ type: 'all' }, 5);
}

/**
 * 🔔 USER NOTIFICATIONS (Activity)
 * Fetches the audit logs for the specific user's applications.
 * This tells them when an officer has updated their status.
 */
export async function getUserActivityLogs(userId: string) {
  const result = await pool.query(
    `SELECT 
        id, 
        title, 
        message, 
        type, 
        is_read AS "isRead", 
        target_screen AS "targetScreen", 
        target_id AS "targetId", 
        created_at
     FROM notifications 
     WHERE user_id = $1
     ORDER BY created_at DESC 
     LIMIT 20`,
    [userId]
  );
  return result.rows;
}


/**
 * CITIZEN ACTION: Update Application Details
 * Allows changing delivery method or documents while payment is still pending.
 */
export async function updateApplicationByCitizen(
  appId: string, 
  userId: string, 
  data: { deliveryMethod?: string, documents?: string[] }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Security Check: Must belong to user and payment MUST be pending
    const check = await client.query(
      `SELECT id FROM transport_applications 
       WHERE id = $1 AND user_id = $2 AND payment_status = 'pending'`,
      [appId, userId]
    );

    if (check.rows.length === 0) {
      throw new Error('Application not found or already paid/processed');
    }

    // 2. Update the record (Using COALESCE to keep existing data if a field is missing)
    const result = await client.query(
      `UPDATE transport_applications 
       SET delivery_method = COALESCE($1, delivery_method), 
           documents = COALESCE($2, documents),
           updated_at = NOW() 
       WHERE id = $3 RETURNING *`,
      [data.deliveryMethod, data.documents ? JSON.stringify(data.documents) : null, appId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 🪪 ONBOARD SINGLE LICENSE
 * Used for manual entry from the Admin Dashboard
 */
export async function onboardLicense(adminId: string, bureauId: string, data: any) {
  const { citizenFin, licenseNumber, categories, expiryDate, issueDate } = data;

  // 1. Verify the Citizen exists in our system via their FIN
  const userCheck = await pool.query('SELECT id, name FROM "user" WHERE username = $1', [citizenFin]);
  if (userCheck.rows.length === 0) {
    throw new Error(`Citizen with FIN ${citizenFin} is not registered in the Digital Portal yet.`);
  }
  const userId = userCheck.rows[0].id;

  // 2. Insert the License
  const result = await pool.query(
    `INSERT INTO driver_licenses (user_id, license_number, categories, issue_date, expiry_date, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING *`,
    [userId, licenseNumber, JSON.stringify(categories), issueDate || 'NOW()', expiryDate]
  );

  // 3. Log the action
  await logAdminAction(adminId, bureauId, 'ONBOARD_LICENSE', 'driver_license', result.rows[0].id, null, data);

  return { license: result.rows[0], citizenName: userCheck.rows[0].name };
}

/**
 * 📊 BULK IMPORT LICENSES
 * Simulates an Excel/CSV upload
 */
export async function bulkImportLicenses(adminId: string, bureauId: string, records: any[]) {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const record of records) {
    try {
      await onboardLicense(adminId, bureauId, record);
      results.success++;
    } catch (err: any) {
      results.failed++;
      results.errors.push(`Row ${results.success + results.failed}: ${err.message}`);
    }
  }

  // Log the bulk operation
  await logAdminAction(adminId, bureauId, 'BULK_IMPORT_LICENSES', 'driver_license', 'multiple', null, { 
    total: records.length, 
    success: results.success 
  });

  return results;
}

/**
 * CITIZEN ACTION: Withdraw/Cancel Application
 * Soft deletes the application so it stays in history but stops being active.
 */
export async function cancelApplicationByCitizen(appId: string, userId: string) {
  const check = await pool.query(
    `SELECT application_status FROM transport_applications WHERE id = $1 AND user_id = $2`,
    [appId, userId]
  );

  const status = check.rows[0]?.application_status;
  if (status === 'approved' || status === 'rejected') {
    throw new Error('Cannot cancel: Government has already finalized this request.');
  }

  return await pool.query(
    `UPDATE transport_applications SET application_status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [appId]
  );
}

/**
 * ⚖️ LEGAL ELIGIBILITY ENGINE
 * This function determines if a citizen is allowed to apply for a specific service.
 */
export async function checkServiceEligibility(userId: string, serviceId: string) {
  // 1. Get the service details
  const serviceRes = await pool.query(
    'SELECT service_name, automation_tag FROM bureau_services WHERE id = $1',
    [serviceId]
  );
  if (serviceRes.rows.length === 0) throw new Error("Service not found");
  const service = serviceRes.rows[0];
  const tag = service.automation_tag;

  // 2. Get the citizen's current license record
  const licenseRes = await pool.query(
    'SELECT * FROM driver_licenses WHERE user_id = $1',
    [userId]
  );
  const license = licenseRes.rows[0];

  // 3. DEFINE THE RULES
  const today = new Date();

  switch (tag) {
    case 'driver_license_renewal':
      if (!license) return { eligible: false, reason: 'no_license', message: 'No license record found. This service is for existing drivers only.' };
      
      const expiry = new Date(license.expiry_date);
      const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Rule: Can only renew if expired or expiring in less than 30 days
      if (daysUntilExpiry > 30) {
        return { 
          eligible: false, 
          reason: 'not_expired', 
          message: `Your license is still valid. Renewal opens 30 days before expiry (Date: ${license.expiry_date}).` 
        };
      }
      return { eligible: true };

    case 'driver_license_replacement':
    case 'driver_license_international':
      if (!license) return { eligible: false, reason: 'no_license', message: 'Active license required for this service.' };
      if (license.status !== 'active') return { eligible: false, reason: 'suspended', message: 'This service is unavailable while your license is suspended or revoked.' };
      
      const isExpired = new Date(license.expiry_date) < today;
      if (isExpired) return { eligible: false, reason: 'expired', message: 'Your license is expired. Please use the Renewal service first.' };
      
      return { eligible: true };

    case 'lift_suspension':
      if (!license || license.status !== 'suspended') {
        return { eligible: false, reason: 'not_suspended', message: 'Our records show your license is not currently suspended.' };
      }
      return { eligible: true };

    case 'driver_info_request':
      // Everyone who has a license can request their info
      if (!license) return { eligible: false, reason: 'no_license', message: 'No driver record found.' };
      return { eligible: true };

    default:
      // For services with no specific preconditions (like training info)
      return { eligible: true ,
         formSchema: serviceRes.rows[0].form_schema
      };
      
  }
}

export async function notifyUser(userId: string, data: { title: string, message: string, type?: string, screen?: string, targetId?: string }) {
  return await pool.query(
    `INSERT INTO notifications (user_id, title, message, type, target_screen, target_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, data.title, data.message, data.type || 'info', data.screen, data.targetId]
  );
}

// 2. Notify all Staff in a specific Bureau
export async function notifyBureauStaff(bureauId: string, data: { title: string, message: string, type?: string, screen?: string, targetId?: string }) {
  // Find all admins/super_admins for this bureau
  const staff = await pool.query(
    'SELECT id FROM "user" WHERE bureau_id = $1 AND role IN (\'admin\', \'super_admin\')',
    [bureauId]
  );
  
  // Create a notification for every staff member found
  const promises = staff.rows.map(member => notifyUser(member.id, data));
  return Promise.all(promises);
}



export async function notifyGlobalAdmins(data: { title: string, message: string, type?: string, screen?: string, targetId?: string }) {
  // Find only Super Admins who manage the whole platform
  const globalAdmins = await pool.query(
    'SELECT id FROM "user" WHERE role = \'super_admin\' AND bureau_id IS NULL'
  );
  
  const promises = globalAdmins.rows.map(admin => notifyUser(admin.id, data));
  return Promise.all(promises);
}

export async function notifyTargetedCitizens(criteria: any, data: { title: string, message: string, screen: string, targetId: string }) {
  const { regions, work_types } = criteria;
  
  let query = 'SELECT id FROM "user" WHERE role = \'citizen\' AND status = \'active\'';
  const params = [];

  // Filter by region if specified
  if (regions && regions.length > 0) {
    query += ` AND region = ANY($1)`;
    params.push(regions);
  }

  const citizens = await pool.query(query, params);
  
  const promises = citizens.rows.map(c => notifyUser(c.id, data));
  return Promise.all(promises);
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
