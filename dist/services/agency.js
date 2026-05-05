import { pool } from '../db/pool.js';
// ============================================================================
// 1. CITIZEN FUNCTIONS (Used by the Mobile App)
// ============================================================================
export async function verifyExternalRecord(fin, recordType, referenceNumber) {
    const result = await pool.query(`SELECT * FROM external_agency_records
     WHERE record_type = $1 AND reference_number = $2 AND citizen_fin = $3`, [recordType, referenceNumber, fin]);
    return result.rows[0] || null;
}
export async function submitApplication(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Verify the service exists and is active
        const serviceCheck = await client.query(`SELECT id, bureau_id, service_name FROM bureau_services WHERE id = $1 AND is_active = TRUE`, [data.serviceId]);
        if (serviceCheck.rows.length === 0) {
            throw new Error('Invalid or inactive service');
        }
        const result = await client.query(`INSERT INTO transport_applications
        (user_id, service_id, service_type, delivery_method, external_references, documents, application_status, payment_status, delivery_status)
       VALUES ($1, $2, 'dynamic', $3, $4, $5, 'submitted', 'pending', 'pending')
       RETURNING *`, [
            data.userId,
            data.serviceId,
            data.deliveryMethod || 'pickup',
            JSON.stringify(data.externalReferences || {}),
            JSON.stringify(data.documents || [])
        ]);
        const application = result.rows[0];
        // Audit Log
        await client.query(`INSERT INTO application_audit_logs (application_id, new_status, action_notes)
       VALUES ($1, 'submitted', 'Citizen submitted application with documents')`, [application.id]);
        await client.query('COMMIT');
        return application;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function processMockPayment(applicationId, userId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Check payment_status specifically
        const appCheck = await client.query('SELECT id, payment_status FROM transport_applications WHERE id = $1 AND user_id = $2', [applicationId, userId]);
        if (appCheck.rows.length === 0)
            throw new Error('Application not found');
        if (appCheck.rows[0].payment_status === 'paid')
            throw new Error('Application is already paid');
        const mockRef = `PAY-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const updated = await client.query(`UPDATE transport_applications
       SET payment_status = 'paid', payment_reference = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`, [mockRef, applicationId]);
        // Audit Log for the payment
        await client.query(`INSERT INTO application_audit_logs (application_id, old_status, new_status, action_notes)
       VALUES ($1, 'pending_payment', 'paid', $2)`, [applicationId, `Payment confirmed. Reference: ${mockRef}`]);
        await client.query('COMMIT');
        return updated.rows[0];
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function deleteApplicationByCitizen(appId, userId) {
    const result = await pool.query(`DELETE FROM transport_applications 
     WHERE id = $1 AND user_id = $2 AND application_status = 'cancelled'
     RETURNING id`, [appId, userId]);
    if (result.rows.length === 0) {
        throw new Error('You can only delete applications that are already cancelled.');
    }
    return true;
}
export async function getCitizenApplications(userId) {
    const result = await pool.query(`SELECT 
        ta.*, 
        bs.service_name -- 🆕 Fetch the real name from the joined table
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE ta.user_id = $1 
     ORDER BY ta.created_at DESC`, [userId]);
    return result.rows;
}
export async function getLicenseInfo(userId) {
    const result = await pool.query(`SELECT * FROM driver_licenses WHERE user_id = $1 AND status = 'active' LIMIT 1`, [userId]);
    return result.rows[0] || null;
}
export async function getAdminApplications(filters) {
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
    const params = [];
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
export async function getAdminApplicationById(applicationId, bureauId) {
    const result = await pool.query(`SELECT
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
     LIMIT 1`, [applicationId, bureauId]);
    return result.rows[0] || null;
}
export async function getPublicBureauServices(bureauId) {
    const result = await pool.query(`SELECT id, service_name, service_description, base_fee, required_docs
     FROM bureau_services
     WHERE bureau_id = $1 AND is_active = TRUE
     ORDER BY service_name ASC`, [bureauId]);
    return result.rows;
}
export async function getApplicationsGroupedByService(bureauId) {
    const services = await pool.query(`SELECT id, service_name, service_description, base_fee
     FROM bureau_services
     WHERE bureau_id = $1 AND is_active = TRUE
     ORDER BY service_name ASC`, [bureauId]);
    const result = [];
    for (const service of services.rows) {
        const apps = await pool.query(`SELECT ta.id, ta.user_id, ta.service_id, ta.application_status, ta.payment_status,
              ta.delivery_status, ta.created_at, u.name as citizen_name, u.username as citizen_fin
       FROM transport_applications ta
       JOIN "user" u ON ta.user_id = u.id
       WHERE ta.service_id = $1 AND ta.application_status IN ('submitted', 'paid', 'approved', 'rejected')
       ORDER BY ta.created_at DESC`, [service.id]);
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
export async function getApplicationsByService(bureauId, serviceType, status) {
    let query = `
    SELECT
      ta.*,
      u.name as citizen_name,
      u.username as citizen_fin
    FROM transport_applications ta
    JOIN "user" u ON ta.user_id = u.id
    WHERE ta.service_type = $1
  `;
    const params = [serviceType];
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
export async function reviewApplication(applicationId, adminId, updates) {
    const client = await pool.connect(); // This now gets a client from the SHARED pool
    try {
        await client.query('BEGIN');
        // 1. Explicitly name the columns to avoid having two "id" fields in the result
        const appResult = await client.query(`SELECT ta.id AS app_id, ta.user_id, ta.application_status, bs.service_name
       FROM transport_applications ta
       LEFT JOIN bureau_services bs ON ta.service_id = bs.id
       WHERE ta.id = $1 FOR UPDATE`, [applicationId]);
        if (appResult.rows.length === 0)
            throw new Error('Application not found');
        const app = appResult.rows[0];
        // 2. Use the full table name in the WHERE clause of the UPDATE
        const updated = await client.query(`UPDATE transport_applications
       SET application_status = COALESCE($1, application_status),
           delivery_status = COALESCE($2, delivery_status),
           admin_notes = $3,
           delivery_tracking_number = $4,
           assigned_admin_id = $5,
           updated_at = NOW()
       WHERE transport_applications.id = $6 
       RETURNING *`, [updates.appStatus, updates.deliveryStatus, updates.notes || null, updates.tracking || null, adminId, applicationId]);
        // 3. Log using the explicit ID
        await client.query(`INSERT INTO application_audit_logs (application_id, changed_by, old_status, new_status, action_notes)
       VALUES ($1, $2, $3, $4, $5)`, [applicationId, adminId, app.application_status, updates.appStatus || app.application_status, updates.notes || 'Admin updated status']);
        // 4. License Issuance (Generic Check)
        const serviceName = app.service_name || '';
        if (updates.appStatus === 'approved' && serviceName.toLowerCase().includes('driver license')) {
            const licenseNo = `DL-${Math.floor(1000000 + Math.random() * 9000000)}`;
            await client.query(`INSERT INTO driver_licenses (user_id, license_number, categories, issue_date, expiry_date, status)
         VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '2 years', 'active')
         ON CONFLICT DO NOTHING`, [app.user_id, licenseNo, JSON.stringify(["Grade 1"])]);
        }
        await client.query('COMMIT');
        return updated.rows[0];
    }
    catch (error) {
        await client.query('ROLLBACK'); // CRITICAL: This releases the lock so the next request doesn't timeout
        throw error;
    }
    finally {
        client.release(); // CRITICAL: This puts the connection back in the pool
    }
}
export async function addApplicationComment(appId, authorId, role, text) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Insert the new comment
        const commentResult = await client.query(`INSERT INTO application_comments (application_id, author_id, author_role, comment_text)
       VALUES ($1, $2, $3, $4) RETURNING *`, [appId, authorId, role, text]);
        // Update the main application's "updated_at" timestamp
        await client.query(`UPDATE transport_applications SET updated_at = NOW() WHERE id = $1`, [appId]);
        await client.query('COMMIT');
        return commentResult.rows[0];
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
// ============================================================================
// 3. AGENCY MANAGEMENT FUNCTIONS (For Agency Admins)
// ============================================================================
export async function getApplicationComments(appId) {
    const result = await pool.query(`SELECT
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
     ORDER BY ac.created_at ASC`, [appId]);
    return result.rows;
}
export async function getAgencyStats(bureauId) {
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
    const params = [];
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
    const revenueParams = [];
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
export async function getAgencyDetailedStats(bureauId) {
    // Applications by status
    const applicationsByStatusResult = await pool.query(`SELECT ta.application_status, COUNT(*) as count
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1
     GROUP BY ta.application_status`, [bureauId]);
    const applicationsByStatus = Object.fromEntries(applicationsByStatusResult.rows.map(row => [row.application_status, parseInt(row.count)]));
    // Applications by service
    const applicationsByServiceResult = await pool.query(`SELECT bs.service_name, COUNT(*) as count
     FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1
     GROUP BY bs.service_name`, [bureauId]);
    const applicationsByService = Object.fromEntries(applicationsByServiceResult.rows.map(row => [row.service_name, parseInt(row.count)]));
    // Revenue by service
    const revenueByServiceResult = await pool.query(`SELECT bs.service_name, COUNT(*) * 500 as revenue
     FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1 AND ta.payment_status = 'paid'
     GROUP BY bs.service_name`, [bureauId]);
    const revenueByService = Object.fromEntries(revenueByServiceResult.rows.map(row => [row.service_name, parseInt(row.revenue)]));
    // Applications over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const applicationsOverTimeResult = await pool.query(`SELECT DATE(ta.created_at) as date, COUNT(*) as count
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1 AND ta.created_at >= $2
     GROUP BY DATE(ta.created_at)
     ORDER BY DATE(ta.created_at)`, [bureauId, thirtyDaysAgo.toISOString()]);
    const applicationsOverTime = applicationsOverTimeResult.rows.map(row => ({
        date: row.date,
        count: parseInt(row.count)
    }));
    // Processing times (average days from submission to approval)
    const processingTimesResult = await pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (ta.updated_at - ta.created_at))/86400) as avg_processing_days
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1 AND ta.application_status = 'approved'`, [bureauId]);
    const avgProcessingDays = processingTimesResult.rows[0]?.avg_processing_days || 0;
    // Citizen demographics (for this bureau's applications)
    const citizensByGenderResult = await pool.query(`SELECT u.gender, COUNT(DISTINCT ta.user_id) as count
     FROM transport_applications ta
     LEFT JOIN bureau_services bs ON ta.service_id = bs.id
     JOIN "user" u ON ta.user_id = u.id
     WHERE bs.bureau_id = $1 AND u.gender IS NOT NULL
     GROUP BY u.gender`, [bureauId]);
    const citizensByGender = Object.fromEntries(citizensByGenderResult.rows.map(row => [row.gender, parseInt(row.count)]));
    // Top services by application count
    const topServicesResult = await pool.query(`SELECT bs.service_name, COUNT(*) as applications
     FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE bs.bureau_id = $1
     GROUP BY bs.service_name
     ORDER BY applications DESC
     LIMIT 5`, [bureauId]);
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
export async function createBureauService(bureauId, data) {
    const result = await pool.query(`INSERT INTO bureau_services (bureau_id, service_name, service_description, base_fee, required_docs)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, [bureauId, data.name, data.description, data.fee, JSON.stringify(data.docs || [])]);
    return result.rows[0];
}
export async function getBureauServices(bureauId) {
    const result = await pool.query('SELECT * FROM bureau_services WHERE bureau_id = $1 AND is_active = TRUE', [bureauId]);
    return result.rows;
}
export async function getBureauStaff(bureauId) {
    const result = await pool.query('SELECT id, name, email, role, last_login_at FROM "user" WHERE bureau_id = $1 AND role = $2 AND deleted_at IS NULL', [bureauId, 'admin']);
    return result.rows;
}
// ============================================================================
// SERVICE MANAGEMENT (Update/Delete)
// ============================================================================
export async function updateBureauService(id, bureauId, data) {
    const updates = [];
    const values = [];
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
    const result = await pool.query(`UPDATE bureau_services SET ${updates.join(', ')} WHERE id = $${paramCount} AND bureau_id = $${paramCount + 1} RETURNING *`, values);
    if (result.rows.length === 0) {
        throw new Error('Service not found in your bureau');
    }
    return result.rows[0];
}
export async function deleteBureauService(id, bureauId) {
    const result = await pool.query(`UPDATE bureau_services 
     SET is_active = FALSE, updated_at = NOW() 
     WHERE id = $1 AND bureau_id = $2 
     RETURNING *`, [id, bureauId]);
    if (result.rows.length === 0) {
        throw new Error('Service not found in your bureau');
    }
    return result.rows[0];
}
// ============================================================================
// APPLICATION MANAGEMENT (Extended)
// ============================================================================
export async function updateApplication(id, bureauId, updates, adminId) {
    // Verify application belongs to bureau
    const check = await pool.query(`SELECT ta.* FROM transport_applications ta
     JOIN bureau_services bs ON ta.service_id = bs.id
     WHERE ta.id = $1 AND bs.bureau_id = $2`, [id, bureauId]);
    if (check.rows.length === 0) {
        throw new Error('Application not found in your bureau');
    }
    const app = check.rows[0];
    // Build dynamic update for allowed fields only
    const allowedFields = ['admin_notes', 'delivery_tracking_number', 'delivery_method', 'assigned_admin_id', 'application_status'];
    const setClauses = [];
    const values = [];
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
    const result = await pool.query(`UPDATE transport_applications SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`, values);
    // Audit log if status changed
    if (updates.application_status && updates.application_status !== app.application_status) {
        await pool.query(`INSERT INTO application_audit_logs (application_id, changed_by, old_status, new_status, action_notes)
       VALUES ($1, $2, $3, $4, $5)`, [id, adminId, app.application_status, updates.application_status, 'Status updated via admin PATCH']);
    }
    return result.rows[0];
}
export async function bulkUpdateApplicationStatus(applicationIds, bureauId, status, adminId, notes) {
    if (applicationIds.length === 0)
        throw new Error('No application IDs provided');
    const result = await pool.query(`UPDATE transport_applications ta
     SET application_status = $1, updated_at = NOW()
     FROM bureau_services bs
     WHERE ta.service_id = bs.id
       AND bs.bureau_id = $2
       AND ta.id = ANY($3)
     RETURNING ta.id, ta.application_status`, [status, bureauId, applicationIds]);
    if (result.rows.length === 0) {
        throw new Error('No applications found or you do not have permission');
    }
    // Bulk audit log
    for (const app of result.rows) {
        await pool.query(`INSERT INTO application_audit_logs (application_id, changed_by, new_status, action_notes)
       VALUES ($1, $2, $3, $4)`, [app.id, adminId, status, notes || 'Bulk status update']);
    }
    return result.rows;
}
// ============================================================================
// COMMENT MANAGEMENT (Update/Delete for admins)
// ============================================================================
export async function updateComment(commentId, adminId, text) {
    const result = await pool.query(`UPDATE application_comments 
     SET comment_text = $1, updated_at = NOW() 
     WHERE id = $2 AND author_id = $3 
     RETURNING *`, [text, commentId, adminId]);
    if (result.rows.length === 0) {
        throw new Error('Comment not found or you do not have permission to edit it');
    }
    return result.rows[0];
}
export async function deleteComment(commentId, adminId) {
    const result = await pool.query(`DELETE FROM application_comments 
     WHERE id = $1 AND author_id = $2 
     RETURNING *`, [commentId, adminId]);
    if (result.rows.length === 0) {
        throw new Error('Comment not found or you do not have permission to delete it');
    }
    return result.rows[0];
}
// ============================================================================
// ADMIN AUDIT LOGGING
// ============================================================================
export async function logAdminAction(adminId, bureauId, action, entityType, entityId, oldValues, newValues, metadata) {
    await pool.query(`INSERT INTO admin_audit_logs 
     (admin_id, bureau_id, action, entity_type, entity_id, old_values, new_values, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        adminId,
        bureauId ?? null,
        action,
        entityType,
        entityId ?? null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        metadata ? JSON.stringify(metadata) : null
    ]);
}
export async function getAdminAuditLogs(bureauId, limit = 50, offset = 0) {
    const result = await pool.query(`SELECT 
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
     LIMIT $2 OFFSET $3`, [bureauId, limit, offset]);
    return result.rows;
}
export async function getApplicationAuditLogs(bureauId, limit = 50, offset = 0) {
    const result = await pool.query(`SELECT 
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
       LIMIT $2 OFFSET $3`, [bureauId, limit, offset]);
    return result.rows;
}
export async function getCombinedAuditLogs(bureauId, limit = 50, offset = 0) {
    const [appLogs, adminLogs] = await Promise.all([
        getApplicationAuditLogs(bureauId, limit, offset),
        getAdminAuditLogs(bureauId, limit, offset)
    ]);
    const combined = [...appLogs, ...adminLogs];
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return combined.slice(0, limit);
}
/**
 * Get announcements for a specific bureau (agency admin)
 */
export async function getBureauAnnouncements(bureauId, limit = 50, offset = 0) {
    const result = await pool.query(`SELECT
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
    LIMIT $2 OFFSET $3`, [bureauId, limit, offset]);
    return result.rows;
}
/**
 * Get global announcements (super admin)
 */
export async function getGlobalAnnouncements(limit = 50, offset = 0) {
    const result = await pool.query(`SELECT
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
    LIMIT $1 OFFSET $2`, [limit, offset]);
    return result.rows;
}
/**
 * Create a bureau announcement
 */
export async function createBureauAnnouncement(bureauId, adminId, data) {
    const result = await pool.query(`INSERT INTO announcements (title, content, image_url, bureau_id, created_by, target_role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING *`, [data.title, data.content, data.image_url || null, bureauId, adminId, data.target_role || 'citizen']);
    return result.rows[0];
}
/**
 * Create a global announcement
 */
export async function createGlobalAnnouncement(adminId, data) {
    const result = await pool.query(`INSERT INTO announcements (title, content, image_url, bureau_id, created_by, target_role, is_active)
     VALUES ($1, $2, $3, NULL, $4, $5, TRUE)
     RETURNING *`, [data.title, data.content, data.image_url || null, adminId, data.target_role || 'citizen']);
    return result.rows[0];
}
/**
 * Update an announcement
 */
export async function updateAnnouncement(id, bureauId, adminId, data) {
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
    const updates = [];
    const values = [];
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
    const result = await pool.query(`UPDATE announcements SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`, values);
    return result.rows[0];
}
/**
 * Delete/deactivate an announcement
 */
export async function deleteAnnouncement(id, bureauId, adminId) {
    // Check ownership
    const checkQuery = bureauId
        ? 'SELECT * FROM announcements WHERE id = $1 AND bureau_id = $2'
        : 'SELECT * FROM announcements WHERE id = $1 AND bureau_id IS NULL';
    const check = await pool.query(checkQuery, bureauId ? [id, bureauId] : [id]);
    if (check.rows.length === 0) {
        throw new Error('Announcement not found or you do not have permission to delete it');
    }
    // Soft delete by setting is_active to false
    const result = await pool.query(`UPDATE announcements SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
    return result.rows[0];
}
/**
 * Get active announcements for citizens (public endpoint)
 * Returns global announcements + bureau-specific announcements if bureauId is provided
 */
export async function getActiveAnnouncements(bureauId, limit = 10) {
    let query = `
    SELECT
      id,
      title,
      content,
      image_url,
      bureau_id,
      target_role,
      created_at
    FROM announcements
    WHERE is_active = TRUE
  `;
    const params = [];
    if (bureauId) {
        // Include both global and bureau-specific announcements
        params.push(bureauId);
        query += ` AND (bureau_id IS NULL OR bureau_id = $${params.length})`;
    }
    else {
        // Only global announcements
        query += ` AND bureau_id IS NULL`;
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const result = await pool.query(query, params);
    return result.rows;
}
export async function getSystemAnnouncements() {
    return await getActiveAnnouncements(undefined, 5);
}
/**
 * 🔔 USER NOTIFICATIONS (Activity)
 * Fetches the audit logs for the specific user's applications.
 * This tells them when an officer has updated their status.
 */
export async function getUserActivityLogs(userId) {
    const result = await pool.query(`SELECT 
        log.id, 
        log.new_status, 
        log.action_notes as title, 
        log.created_at,
        ta.service_type
     FROM application_audit_logs log
     JOIN transport_applications ta ON log.application_id = ta.id
     WHERE ta.user_id = $1
     ORDER BY log.created_at DESC 
     LIMIT 10`, [userId]);
    return result.rows;
}
/**
 * CITIZEN ACTION: Update Application Details
 * Allows changing delivery method or documents while payment is still pending.
 */
export async function updateApplicationByCitizen(appId, userId, data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Security Check: Must belong to user and payment MUST be pending
        const check = await client.query(`SELECT id FROM transport_applications 
       WHERE id = $1 AND user_id = $2 AND payment_status = 'pending'`, [appId, userId]);
        if (check.rows.length === 0) {
            throw new Error('Application not found or already paid/processed');
        }
        // 2. Update the record (Using COALESCE to keep existing data if a field is missing)
        const result = await client.query(`UPDATE transport_applications 
       SET delivery_method = COALESCE($1, delivery_method), 
           documents = COALESCE($2, documents),
           updated_at = NOW() 
       WHERE id = $3 RETURNING *`, [data.deliveryMethod, data.documents ? JSON.stringify(data.documents) : null, appId]);
        await client.query('COMMIT');
        return result.rows[0];
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * CITIZEN ACTION: Withdraw/Cancel Application
 * Soft deletes the application so it stays in history but stops being active.
 */
export async function cancelApplicationByCitizen(appId, userId) {
    const check = await pool.query(`SELECT application_status FROM transport_applications WHERE id = $1 AND user_id = $2`, [appId, userId]);
    const status = check.rows[0]?.application_status;
    if (status === 'approved' || status === 'rejected') {
        throw new Error('Cannot cancel: Government has already finalized this request.');
    }
    return await pool.query(`UPDATE transport_applications SET application_status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`, [appId]);
}
export async function cancelApplication(applicationId, adminId, reason) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Get current application status for audit log
        const appResult = await client.query('SELECT application_status FROM transport_applications WHERE id = $1', [applicationId]);
        if (appResult.rows.length === 0)
            throw new Error('Application not found');
        const oldStatus = appResult.rows[0].application_status;
        // Soft delete: Change application_status to 'cancelled'
        const updated = await client.query(`UPDATE transport_applications
       SET application_status = 'cancelled', admin_notes = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`, [reason, applicationId]);
        // Log the cancellation
        await client.query(`INSERT INTO application_audit_logs (application_id, changed_by, old_status, new_status, action_notes)
       VALUES ($1, $2, $3, 'cancelled', $4)`, [applicationId, adminId, oldStatus, reason]);
        await client.query('COMMIT');
        return updated.rows[0];
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
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
