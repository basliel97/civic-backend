import { Hono } from 'hono';
import { adminAuth, agencyAdminAuth, type AuthContext } from '../middleware/auth.js';
import {
  getAgencyStats,
  getAgencyDetailedStats,
  getBureauServices,
  createBureauService,
  getBureauStaff,
  getAdminApplications,
  getAdminApplicationById,
  getApplicationsByService,
  getApplicationsGroupedByService,
  reviewApplication,
  cancelApplication,
  addApplicationComment,
  getApplicationComments,
  updateBureauService,
  deleteBureauService,
  updateApplication,
  bulkUpdateApplicationStatus,
  updateComment,
  deleteComment,
  getBureauAnnouncements,
  createBureauAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getCombinedAuditLogs,
  logAdminAction,
  bulkImportLicenses,
  onboardLicense
} from '../services/agency.js';
import { 
  getSuggestions,     // Existing function for listing
  getSuggestionById,  // Existing function for details
  respondToSuggestion // The function you just showed me
} from '../services/suggestion.js';

import bcrypt from "bcrypt";

import { pool } from '../db/pool.js';

const agencyAdmin = new Hono<{ Variables: AuthContext }>();

/**
 * 🔒 SECURITY: Dynamic Agency Guard
 * Uses agencyAdminAuth() - allows Global Super Admins or any Agency Staff
 */
agencyAdmin.use('/*', adminAuth());
agencyAdmin.use('/*', agencyAdminAuth());

/**
 * 📊 DASHBOARD STATISTICS
 */
agencyAdmin.get('/stats', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const stats = await getAgencyStats(bureauId ?? undefined);
    return c.json({ success: true, data: stats });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * � DETAILED ANALYTICS
 * Detailed breakdowns and insights for agency admins
 */
agencyAdmin.get('/stats/detailed', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    
    const stats = await getAgencyDetailedStats(bureauId);
    return c.json({ success: true, data: stats });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * �🛠️ SERVICE MANAGEMENT
 */
agencyAdmin.get('/services', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const services = await getBureauServices(bureauId!);
    return c.json({ success: true, data: services });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

agencyAdmin.post('/services', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const adminId = c.get('user_id');
    const body = await c.req.json();
    const service = await createBureauService(bureauId!, body);
    await logAdminAction(adminId, bureauId, 'create_service', 'bureau_service', service.id, null, service);
    return c.json({ success: true, data: service });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update Service
agencyAdmin.put('/services/:id', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const adminId = c.get('user_id');
    const { id } = c.req.param();
    const body = await c.req.json();

    // Fetch old service for audit
    const oldService = await pool.query('SELECT * FROM bureau_services WHERE id = $1 AND bureau_id = $2', [id, bureauId]);
    if (oldService.rows.length === 0) {
      return c.json({ success: false, error: 'Service not found in your bureau' }, 404);
    }

    const updated = await updateBureauService(id, bureauId, body);

    // Audit log
    await logAdminAction(adminId, bureauId, 'update_service', 'bureau_service', id, oldService.rows[0], updated);

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete Service (Soft Delete)
agencyAdmin.delete('/services/:id', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const adminId = c.get('user_id');
    const { id } = c.req.param();

    const oldService = await pool.query('SELECT * FROM bureau_services WHERE id = $1 AND bureau_id = $2', [id, bureauId]);
    if (oldService.rows.length === 0) {
      return c.json({ success: false, error: 'Service not found in your bureau' }, 404);
    }

    const deleted = await deleteBureauService(id, bureauId);

    await logAdminAction(adminId, bureauId, 'delete_service', 'bureau_service', id, oldService.rows[0], { is_active: false });

    return c.json({ success: true, message: 'Service deactivated successfully', data: deleted });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 👥 STAFF MANAGEMENT
 */
agencyAdmin.get('/staff', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const staff = await getBureauStaff(bureauId!);
    return c.json({ success: true, data: staff });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 📋 APPLICATIONS MANAGEMENT
 */

// List All Applications (with optional filters)
agencyAdmin.get('/applications', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const status = c.req.query('status');
    const serviceId = c.req.query('serviceId');

    const data = await getAdminApplications({
      status,
      serviceId,
      bureauId: bureauId ?? undefined
    });

    return c.json({ success: true, count: data.length, data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get All Applications Grouped by Service
agencyAdmin.get('/applications-by-service', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);

    const data = await getApplicationsGroupedByService(bureauId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get a single application for review, including attached documents
agencyAdmin.get('/applications/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);

    const application = await getAdminApplicationById(id, bureauId);
    if (!application) {
      return c.json({ success: false, error: 'Application not found' }, 404);
    }

    return c.json({ success: true, data: application });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Bulk update application status
agencyAdmin.post('/applications/bulk-status', async (c) => {
  try {
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const { applicationIds, status, notes } = await c.req.json();

    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return c.json({ success: false, error: 'applicationIds array is required' }, 400);
    }
    if (!status) {
      return c.json({ success: false, error: 'status is required' }, 400);
    }

    // Update all applications that belong to this bureau
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
      return c.json({ success: false, error: 'No applications found or you do not have permission' }, 404);
    }

    // Bulk audit log per application
    for (const app of result.rows) {
      await pool.query(
        `INSERT INTO application_audit_logs (application_id, changed_by, new_status, action_notes)
         VALUES ($1, $2, $3, $4)`,
        [app.id, adminId, status, notes || 'Bulk status update']
      );
    }

    // Log bulk action in admin_audit_logs
    await logAdminAction(adminId, bureauId, 'bulk_update_application_status', 'transport_applications', 'multiple',
      null,
      { count: result.rows.length, status },
      { applicationIds, notes }
    );

    return c.json({ success: true, message: `${result.rows.length} applications updated`, data: result.rows });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update Application (non-status fields) and/or status separately
agencyAdmin.patch('/applications/:id', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const adminId = c.get('user_id');
    const { id } = c.req.param();
    const updates = await c.req.json();

    // 1. FIXED: Added "ta." to all columns to remove ambiguity
    const oldApp = await pool.query(
      `SELECT ta.id, ta.application_status, ta.admin_notes, ta.delivery_tracking_number, ta.delivery_method, ta.assigned_admin_id 
       FROM transport_applications ta
       JOIN bureau_services bs ON ta.service_id = bs.id
       WHERE ta.id = $1 AND bs.bureau_id = $2`,
      [id, bureauId]
    );
    
    if (oldApp.rows.length === 0) {
      return c.json({ success: false, error: 'Application not found in your bureau' }, 404);
    }

    const updated = await updateApplication(id, bureauId, updates, adminId);

    // Log admin action for any update
    await logAdminAction(adminId, bureauId, 'update_application', 'transport_applications', id,
      oldApp.rows[0],
      updated,
      { fields: Object.keys(updates) }
    );

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Cancel/Delete Application (soft delete by setting status to 'cancelled')
agencyAdmin.delete('/applications/:id', async (c) => {
  try {
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const { id } = c.req.param();
    const { reason } = await c.req.json();

    // Get old status for audit before cancellation
    const oldApp = await pool.query('SELECT application_status FROM transport_applications WHERE id = $1', [id]);
    const oldStatus = oldApp.rows[0]?.application_status;

    const result = await cancelApplication(id, adminId, reason);

    // Log admin action
    await logAdminAction(adminId, bureauId, 'cancel_application', 'transport_applications', id,
      { application_status: oldStatus },
      { application_status: 'cancelled' },
      { reason }
    );

    return c.json({ success: true, message: 'Application cancelled', data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 📝 APPLICATION REVIEW
 */

// Review Application (Approve/Reject with conditional license issuance)
agencyAdmin.post('/review/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const updates = await c.req.json();

    // Get old status for audit
    const oldApp = await pool.query('SELECT application_status FROM transport_applications WHERE id = $1', [id]);
    const oldStatus = oldApp.rows[0]?.application_status;

    const result = await reviewApplication(id, adminId, updates);

    // Log admin action for review
    await logAdminAction(adminId, bureauId, 'review_application', 'transport_applications', id,
      { application_status: oldStatus },
      { application_status: updates.appStatus || oldStatus, notes: updates.notes },
      { license_issued: !!result.license_id, delivery_status: result.delivery_status }
    );

    return c.json({ success: true, message: 'Review updated', data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 💬 COMMUNICATION SYSTEM (ADMIN SIDE)
 */

// Add Comment
agencyAdmin.post('/:id/comments', async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const { text } = await c.req.json();

    if (!text) {
      return c.json({ success: false, error: 'Text is required' }, 400);
    }

    const comment = await addApplicationComment(id, adminId, 'admin', text);

    // Log admin action
    await logAdminAction(adminId, bureauId, 'create_comment', 'application_comments', comment.id,
      null,
      { text: text.substring(0, 100), application_id: id },
      { author_role: 'admin' }
    );

    return c.json({ success: true, data: comment });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// View Comments (existing)
agencyAdmin.get('/:id/comments', async (c) => {
  try {
    const { id } = c.req.param();
    const comments = await getApplicationComments(id);

    return c.json({ success: true, data: comments });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update Own Comment
agencyAdmin.put('/comments/:commentId', async (c) => {
  try {
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const { commentId } = c.req.param();
    const { text } = await c.req.json();

    if (!text) {
      return c.json({ success: false, error: 'Text is required' }, 400);
    }

    // Get old text for audit
    const old = await pool.query('SELECT comment_text FROM application_comments WHERE id = $1 AND author_id = $2', [commentId, adminId]);
    if (old.rows.length === 0) {
      return c.json({ success: false, error: 'Comment not found or you do not have permission to edit it' }, 404);
    }

    const comment = await updateComment(commentId, adminId, text);

    await logAdminAction(adminId, bureauId, 'update_comment', 'application_comments', commentId,
      { comment_text: old.rows[0].comment_text },
      { comment_text: text });

    return c.json({ success: true, data: comment });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete Own Comment
agencyAdmin.delete('/comments/:commentId', async (c) => {
  try {
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const { commentId } = c.req.param();

    // Get old for audit
    const old = await pool.query('SELECT * FROM application_comments WHERE id = $1 AND author_id = $2', [commentId, adminId]);
    if (old.rows.length === 0) {
      return c.json({ success: false, error: 'Comment not found or you do not have permission to delete it' }, 404);
    }

    const result = await deleteComment(commentId, adminId);

    await logAdminAction(adminId, bureauId, 'delete_comment', 'application_comments', commentId, old.rows[0], null);

    return c.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 📊 AUDIT LOGS (Admin Actions)
 */
agencyAdmin.get('/audit-logs', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    // Get application audit logs for this bureau
    const appLogs = await pool.query(
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

    // Get admin action logs for this bureau (staff created, services updated, etc.)
    const adminLogs = await pool.query(
      `SELECT 
         admin_audit_logs.id,
         admin_audit_logs.admin_id as changed_by,
         admin_audit_logs.action,
         admin_audit_logs.entity_type,
         admin_audit_logs.entity_id,
         admin_audit_logs.old_values,
         admin_audit_logs.new_values,
         admin_audit_logs.metadata,
         admin_audit_logs.created_at,
         u.name as admin_name,
         u.email as admin_email,
         'admin_action' as log_type
       FROM admin_audit_logs
       JOIN "user" u ON admin_audit_logs.admin_id = u.id
       WHERE admin_audit_logs.bureau_id = $1
       ORDER BY admin_audit_logs.created_at DESC
       LIMIT $2 OFFSET $3`,
      [bureauId, limit, offset]
    );

    // Combine and sort by date
    const combined = [...appLogs.rows, ...adminLogs.rows].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return c.json({ success: true, count: combined.length, data: combined.slice(0, limit) });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 📢 ANNOUNCEMENT MANAGEMENT
 */

// Get Bureau Announcements
agencyAdmin.get('/announcements', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const announcements = await getBureauAnnouncements(bureauId, limit, offset);
    return c.json({ success: true, data: announcements });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create Bureau Announcement
agencyAdmin.post('/announcements', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const adminId = c.get('user_id');
    const data = await c.req.json();

    if (!data.title || !data.content) {
      return c.json({ success: false, error: 'Title and content are required' }, 400);
    }

    const announcement = await createBureauAnnouncement(bureauId, adminId, data);

    // Log admin action
    await logAdminAction(adminId, bureauId, 'create_announcement', 'announcements', announcement.id,
      null,
      { title: data.title, content: data.content.substring(0, 100) },
      { target_role: data.target_role || 'citizen' }
    );

    return c.json({ success: true, data: announcement });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update Bureau Announcement
agencyAdmin.put('/announcements/:id', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const adminId = c.get('user_id');
    const { id } = c.req.param();
    const data = await c.req.json();

    const updated = await updateAnnouncement(id, bureauId, adminId, data);

    // Log admin action
    await logAdminAction(adminId, bureauId, 'update_announcement', 'announcements', id,
      null,
      { title: data.title, content: data.content?.substring(0, 100) },
      { fields: Object.keys(data) }
    );

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete Bureau Announcement
agencyAdmin.delete('/announcements/:id', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    if (!bureauId) return c.json({ success: false, error: 'Bureau ID required' }, 400);
    const adminId = c.get('user_id');
    const { id } = c.req.param();

    const deleted = await deleteAnnouncement(id, bureauId, adminId);

    // Log admin action
    await logAdminAction(adminId, bureauId, 'delete_announcement', 'announcements', id,
      { is_active: true },
      { is_active: false }
    );

    return c.json({ success: true, message: 'Announcement deactivated', data: deleted });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 👤 PROFILE MANAGEMENT
 */

// 1. Get Own Profile
agencyAdmin.get('/profile', async (c) => {
  try {
    const adminId = c.get('user_id');

    // We join with the bureaus table so the admin sees their agency name too
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.image, u.phone_number,
              u.bureau_id AS "bureauId", b.name AS "bureauName"
       FROM "user" u
       LEFT JOIN bureaus b ON u.bureau_id = b.id
       WHERE u.id = $1`,
      [adminId]
    );

    if (result.rows.length === 0) {
      return c.json({ success: false, error: "Profile not found" }, 404);
    }

    return c.json({ 
      success: true, 
      data: result.rows[0] 
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. Update Own Profile (Name/Image/Phone)
agencyAdmin.put('/profile', async (c) => {
  try {
    const adminId = c.get('user_id');
    const { name, image, phone_number } = await c.req.json();

    const result = await pool.query(
      `UPDATE "user"
       SET name = COALESCE($1, name),
           image = COALESCE($2, image),
           phone_number = COALESCE($3, phone_number),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, email, phone_number, image`,
      [name, image, phone_number, adminId]
    );

    return c.json({
      success: true,
      message: "Profile updated successfully",
      data: result.rows[0]
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 3. Change Own Password
agencyAdmin.post('/change-password', async (c) => {
  try {
    const adminId = c.get('user_id');
    const { currentPassword, newPassword } = await c.req.json();

    if (!currentPassword || !newPassword) {
      return c.json({ success: false, error: "Both passwords are required" }, 400);
    }

    // A. Verify current password matches the 'account' table
    const accountResult = await pool.query(
      'SELECT password FROM "account" WHERE "user_id" = $1 AND "provider_id" = $2',
      [adminId, 'credential']
    );

    if (accountResult.rows.length === 0) {
      return c.json({ success: false, error: "Auth account not found" }, 404);
    }

    const isValid = await bcrypt.compare(currentPassword, accountResult.rows[0].password);
    if (!isValid) {
      return c.json({ success: false, error: "Incorrect current password" }, 401);
    }

    // B. Hash and update
    const hashedPass = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE "account" SET password = $1, updated_at = NOW() WHERE "user_id" = $2',
      [hashedPass, adminId]
    );

    return c.json({ 
      success: true, 
      message: "Password changed successfully" 
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/admin/agency/licenses/onboard
 * Manual entry for a single license
 */
agencyAdmin.post('/licenses/onboard', async (c) => {
  try {
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    const body = await c.req.json();

    const result = await onboardLicense(adminId, bureauId!, body);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

/**
 * POST /api/admin/agency/licenses/import
 * Bulk import from Excel (sent as JSON array from frontend)
 */
agencyAdmin.post('/licenses/import', async (c) => {
  try {
    const adminId = c.get('user_id');
    const bureauId = c.get('bureauId');
    const { records } = await c.req.json(); // Expects { records: [...] }

    if (!Array.isArray(records)) {
      return c.json({ success: false, error: "Invalid data format. Expected an array of records." }, 400);
    }

    const report = await bulkImportLicenses(adminId, bureauId!, records);
    return c.json({ success: true, data: report });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

agencyAdmin.get('/suggestions', async (c) => {
  try {
    const bureauId = c.get('bureauId'); // Get the ID of the Admin's Bureau from token
    const status = c.req.query('status'); // Optional filter (submitted/resolved)
    
    if (!bureauId) return c.json({ success: false, error: "Bureau ID not found" }, 403);

    // Use your existing 'getSuggestions' function
    const result = await getSuggestions(bureauId, status);
    
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// B. Get Suggestion Details
// URL: GET /api/admin/agency/suggestions/:id
agencyAdmin.get('/suggestions/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const bureauId = c.get('bureauId');

    const suggestion = await getSuggestionById(id);

    if (!suggestion) return c.json({ success: false, error: "Not found" }, 404);

    // 🛡️ Security: Ensure this admin is allowed to see this suggestion
    if (suggestion.bureau_id !== bureauId) {
      return c.json({ success: false, error: "Access Denied: Different Bureau" }, 403);
    }

    return c.json({ success: true, data: suggestion });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// C. Respond to a Suggestion
// URL: POST /api/admin/agency/suggestions/:id/respond
agencyAdmin.post('/suggestions/:id/respond', async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id'); // Who is replying
    const { response } = await c.req.json();

    if (!response) {
      return c.json({ success: false, error: "Response text is required" }, 400);
    }

    // Use the function you already have!
    const updated = await respondToSuggestion(id, adminId, response);
    
    return c.json({ 
      success: true, 
      message: "Reply sent to citizen", 
      data: updated 
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

agencyAdmin.get('/notifications', async (c) => {
  try {
    const adminId = c.get('user_id');
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC LIMIT 50`, 
      [adminId]
    );
    
    // Also calculate the unread count for the dashboard badge
    const unreadCount = result.rows.filter(n => !n.is_read).length;

    return c.json({ 
      success: true, 
      unreadCount,
      data: result.rows 
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. Mark a notification as read
agencyAdmin.post('/notifications/:id/read', async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');

    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', 
      [id, adminId]
    );
    
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default agencyAdmin;
