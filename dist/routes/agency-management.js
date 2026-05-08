import { Hono } from 'hono';
import { auth } from '../auth/index.js';
import { pool } from '../db/pool.js';
import { globalSuperAdminAuth, adminAuth, superAdminAuth } from '../middleware/auth.js';
import { logAdminAction } from '../services/agency.js';
const agencyManagement = new Hono();
agencyManagement.use('/*', adminAuth());
/**
 * ==========================================
 * GLOBAL SUPER ADMIN ACTIONS (Civic Admin)
 * ==========================================
 */
// 1. CREATE Agency Head
agencyManagement.post('/create-agency-head', adminAuth(), globalSuperAdminAuth(), async (c) => {
    try {
        const adminId = c.get('user_id');
        const { email, password, name, bureauId } = await c.req.json();
        if (!email || !password || !name || !bureauId) {
            return c.json({ success: false, error: 'Email, password, name, and bureauId are required' }, 400);
        }
        const bureauCheck = await pool.query('SELECT name FROM bureaus WHERE id = $1', [bureauId]);
        if (bureauCheck.rows.length === 0)
            return c.json({ success: false, error: 'Bureau not found' }, 404);
        const userResult = await auth.api.signUpEmail({ body: { email, password, name } });
        if (!userResult || !userResult.user)
            throw new Error("Failed to create user");
        await pool.query(`UPDATE "user" SET role = 'super_admin', bureau_id = $1, status = 'active' WHERE id = $2`, [bureauId, userResult.user.id]);
        // Log admin action
        await logAdminAction(adminId, null, 'CREATE_AGENCY_HEAD', 'user', userResult.user.id, null, { email, name, role: 'super_admin', bureau_id: bureauId }, { created_by: adminId });
        return c.json({ success: true, message: `Agency Head created for ${bureauCheck.rows[0].name}` }, 201);
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * ==========================================
 * AGENCY SUPER ADMIN ACTIONS (Agency Head)
 * ==========================================
 * These routes require the user to be a 'super_admin'
 * and they automatically lock actions to their specific bureau.
 */
// 1. CREATE Staff (Admin)
agencyManagement.post('/staff', adminAuth(), superAdminAuth(), async (c) => {
    try {
        const adminId = c.get('user_id');
        const creatorBureauId = c.get('bureauId');
        if (!creatorBureauId)
            return c.json({ success: false, error: 'You do not belong to an agency' }, 403);
        const { email, password, name } = await c.req.json();
        if (!email || !password || !name)
            return c.json({ success: false, error: 'Missing fields' }, 400);
        const userResult = await auth.api.signUpEmail({ body: { email, password, name } });
        if (!userResult || !userResult.user)
            throw new Error("Failed to create user");
        await pool.query(`UPDATE "user" SET role = 'admin', bureau_id = $1, status = 'active' WHERE id = $2`, [creatorBureauId, userResult.user.id]);
        // Log admin action
        await logAdminAction(adminId, creatorBureauId, 'create_staff', 'user', userResult.user.id, null, { email, name, role: 'admin', bureau_id: creatorBureauId }, { created_by: adminId });
        return c.json({ success: true, message: `Staff account created` }, 201);
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 2. READ All Staff
agencyManagement.get('/staff', superAdminAuth(), async (c) => {
    try {
        const bureauId = c.get('bureauId');
        if (!bureauId)
            return c.json({ success: false, error: 'You do not belong to an agency' }, 403);
        // Fetch all admins and super_admins for THIS bureau only
        const result = await pool.query(`SELECT id, name, email, role, status, created_at, last_login_at 
       FROM "user" 
       WHERE bureau_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`, [bureauId]);
        return c.json({ success: true, data: result.rows });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 3. UPDATE Staff Details (Name or Role promotion)
agencyManagement.put('/staff/:id', superAdminAuth(), async (c) => {
    try {
        const adminId = c.get('user_id');
        const bureauId = c.get('bureauId');
        const { id } = c.req.param();
        const { name, role } = await c.req.json();
        // Get old values for audit
        const oldUser = await pool.query(`SELECT id, name, role FROM "user" WHERE id = $1 AND bureau_id = $2 AND deleted_at IS NULL`, [id, bureauId]);
        if (oldUser.rows.length === 0) {
            return c.json({ success: false, error: 'Staff member not found in your agency' }, 404);
        }
        // Security check: Only update if the target user belongs to the SAME bureau
        const result = await pool.query(`UPDATE "user" 
       SET name = COALESCE($1, name), role = COALESCE($2, role), updated_at = NOW() 
       WHERE id = $3 AND bureau_id = $4 AND deleted_at IS NULL
       RETURNING id, name, email, role, status`, [name, role, id, bureauId]);
        if (result.rows.length === 0) {
            return c.json({ success: false, error: 'Staff member not found in your agency' }, 404);
        }
        // Log admin action
        await logAdminAction(adminId, bureauId, 'update_staff', 'user', id, oldUser.rows[0], result.rows[0], { fields_updated: Object.keys({ name, role }).filter(k => k !== undefined) });
        return c.json({ success: true, message: 'Staff updated successfully', data: result.rows[0] });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 4. UPDATE Staff Status (Suspend / Activate)
agencyManagement.patch('/staff/:id/status', superAdminAuth(), async (c) => {
    try {
        const adminId = c.get('user_id');
        const bureauId = c.get('bureauId');
        const loggedInUserId = c.get('user_id');
        const { id } = c.req.param();
        const { status } = await c.req.json(); // 'active' or 'inactive'
        if (id === loggedInUserId) {
            return c.json({ success: false, error: 'You cannot suspend your own account' }, 400);
        }
        // Get old status for audit
        const oldUser = await pool.query(`SELECT id, status FROM "user" WHERE id = $1 AND bureau_id = $2 AND deleted_at IS NULL`, [id, bureauId]);
        if (oldUser.rows.length === 0)
            return c.json({ success: false, error: 'Staff member not found' }, 404);
        const result = await pool.query(`UPDATE "user" 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 AND bureau_id = $3 AND deleted_at IS NULL
       RETURNING id, name, status`, [status, id, bureauId]);
        if (result.rows.length === 0)
            return c.json({ success: false, error: 'Staff member not found' }, 404);
        // Log admin action
        await logAdminAction(adminId, bureauId, 'update_staff_status', 'user', id, oldUser.rows[0], result.rows[0], { field: 'status', old_value: oldUser.rows[0].status, new_value: status });
        return c.json({ success: true, message: `Staff member marked as ${status}`, data: result.rows[0] });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 5. DELETE Staff (Soft Delete - if they resign or are fired)
agencyManagement.delete('/staff/:id', superAdminAuth(), async (c) => {
    try {
        const adminId = c.get('user_id');
        const bureauId = c.get('bureauId');
        const loggedInUserId = c.get('user_id');
        const { id } = c.req.param();
        // Prevent self-deletion
        if (id === loggedInUserId) {
            return c.json({ success: false, error: 'You cannot delete your own account' }, 400);
        }
        // Get old staff record for audit before deletion
        const oldUser = await pool.query(`SELECT id, name, email, role FROM "user" WHERE id = $1 AND bureau_id = $2 AND deleted_at IS NULL`, [id, bureauId]);
        if (oldUser.rows.length === 0)
            return c.json({ success: false, error: 'Staff member not found' }, 404);
        // Soft delete: set deleted_at to NOW()
        const result = await pool.query(`UPDATE "user" 
       SET deleted_at = NOW(), status = 'deleted', deleted_by = $1, updated_at = NOW()
       WHERE id = $2 AND bureau_id = $3 AND deleted_at IS NULL
       RETURNING id, name`, [adminId, id, bureauId]);
        if (result.rows.length === 0)
            return c.json({ success: false, error: 'Staff member not found' }, 404);
        // Log admin action
        await logAdminAction(adminId, bureauId, 'delete_staff', 'user', id, oldUser.rows[0], { id, name: oldUser.rows[0].name, email: oldUser.rows[0].email, role: oldUser.rows[0].role, status: 'deleted' }, { deleted_by: adminId });
        return c.json({ success: true, message: 'Staff member removed successfully' });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * ==========================================
 * GLOBAL SUPER ADMIN: BUREAU ADMIN MANAGEMENT
 * ==========================================
 */
// 1. GET All Bureaus with their SuperAdmins
agencyManagement.get('/bureaus/admins', adminAuth(), globalSuperAdminAuth(), async (c) => {
    try {
        // Fetch all active bureaus
        const bureausResult = await pool.query(`SELECT id, name, description, contact_email, phone, address, status 
       FROM bureaus 
       WHERE status = 'active' 
       ORDER BY name ASC`);
        const bureaus = bureausResult.rows;
        // For each bureau, fetch superadmins
        const result = [];
        for (const bureau of bureaus) {
            const superadminsResult = await pool.query(`SELECT id, name, email, role, status, created_at, last_login_at 
         FROM "user" 
         WHERE bureau_id = $1 AND role = 'super_admin' AND deleted_at IS NULL
         ORDER BY created_at`, [bureau.id]);
            result.push({
                bureau: bureau,
                superadmins: superadminsResult.rows
            });
        }
        return c.json({ success: true, data: result });
    }
    catch (error) {
        console.error('[Global Admin] Get bureaus superadmins error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 2. GET SuperAdmin for a specific Bureau
agencyManagement.get('/bureaus/:bureauId/admins', adminAuth(), globalSuperAdminAuth(), async (c) => {
    try {
        const { bureauId } = c.req.param();
        // Check if bureau exists
        const bureauCheck = await pool.query('SELECT id, name FROM bureaus WHERE id = $1 AND status = $2', [bureauId, 'active']);
        if (bureauCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Bureau not found' }, 404);
        }
        const bureau = bureauCheck.rows[0];
        // Fetch superadmins for this bureau
        const superadminsResult = await pool.query(`SELECT id, name, email, role, status, created_at, last_login_at 
       FROM "user" 
       WHERE bureau_id = $1 AND role = 'super_admin' AND deleted_at IS NULL
       ORDER BY created_at`, [bureauId]);
        return c.json({
            success: true,
            data: {
                bureau: bureau,
                superadmins: superadminsResult.rows
            }
        });
    }
    catch (error) {
        console.error('[Global Admin] Get bureau superadmins error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * ==========================================
 * GLOBAL SUPER ADMIN: MANAGE BUREAU SUPERADMINS
 * ==========================================
 */
// 3. UPDATE a Bureau SuperAdmin
agencyManagement.put('/bureaus/:bureauId/superadmins/:id', adminAuth(), globalSuperAdminAuth(), async (c) => {
    try {
<<<<<<< HEAD
        const adminId = c.get('user_id');
=======
>>>>>>> ac036362bb0ba0a772985656690ef3b8da0d99b0
        const { bureauId, id } = c.req.param();
        const { name, status } = await c.req.json();
        // Validate bureau exists
        const bureauCheck = await pool.query('SELECT id FROM bureaus WHERE id = $1 AND status = $2', [bureauId, 'active']);
        if (bureauCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Bureau not found' }, 404);
        }
        // Ensure target user exists, is a super_admin, and belongs to this bureau
<<<<<<< HEAD
        const userCheck = await pool.query('SELECT id, name, status as old_status FROM "user" WHERE id = $1 AND bureau_id = $2 AND role = $3 AND deleted_at IS NULL', [id, bureauId, 'super_admin']);
        if (userCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Superadmin not found in this bureau' }, 404);
        }
        const oldUser = userCheck.rows[0];
=======
        const userCheck = await pool.query('SELECT id FROM "user" WHERE id = $1 AND bureau_id = $2 AND role = $3 AND deleted_at IS NULL', [id, bureauId, 'super_admin']);
        if (userCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Superadmin not found in this bureau' }, 404);
        }
>>>>>>> ac036362bb0ba0a772985656690ef3b8da0d99b0
        // Update only provided fields
        const result = await pool.query(`UPDATE "user" 
       SET name = COALESCE($1, name), 
           status = COALESCE($2, status), 
           updated_at = NOW() 
       WHERE id = $3 AND bureau_id = $4 AND role = 'super_admin' AND deleted_at IS NULL
       RETURNING id, name, email, role, status, created_at, last_login_at`, [name || null, status || null, id, bureauId]);
        if (result.rows.length === 0) {
            return c.json({ success: false, error: 'Failed to update superadmin' }, 500);
        }
<<<<<<< HEAD
        // Log admin action
        await logAdminAction(adminId, bureauId, 'update_superadmin', 'user', id, oldUser, result.rows[0], { fields_updated: [name ? 'name' : null, status ? 'status' : null].filter(Boolean) });
=======
>>>>>>> ac036362bb0ba0a772985656690ef3b8da0d99b0
        return c.json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        console.error('[Global Admin] Update bureau superadmin error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 4. DELETE a Bureau SuperAdmin (soft delete)
agencyManagement.delete('/bureaus/:bureauId/superadmins/:id', adminAuth(), globalSuperAdminAuth(), async (c) => {
    try {
<<<<<<< HEAD
        const adminId = c.get('user_id');
        const { bureauId, id } = c.req.param();
=======
        const { bureauId, id } = c.req.param();
        const adminId = c.get('user_id');
>>>>>>> ac036362bb0ba0a772985656690ef3b8da0d99b0
        // Validate bureau exists
        const bureauCheck = await pool.query('SELECT id FROM bureaus WHERE id = $1 AND status = $2', [bureauId, 'active']);
        if (bureauCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Bureau not found' }, 404);
        }
        // Ensure target user exists, is a super_admin, and belongs to this bureau
<<<<<<< HEAD
        const userCheck = await pool.query('SELECT id, name, email FROM "user" WHERE id = $1 AND bureau_id = $2 AND role = $3 AND deleted_at IS NULL', [id, bureauId, 'super_admin']);
        if (userCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Superadmin not found in this bureau' }, 404);
        }
        const oldUser = userCheck.rows[0];
=======
        const userCheck = await pool.query('SELECT id FROM "user" WHERE id = $1 AND bureau_id = $2 AND role = $3 AND deleted_at IS NULL', [id, bureauId, 'super_admin']);
        if (userCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Superadmin not found in this bureau' }, 404);
        }
>>>>>>> ac036362bb0ba0a772985656690ef3b8da0d99b0
        // Prevent self-deletion
        if (id === adminId) {
            return c.json({ success: false, error: 'You cannot delete your own account' }, 400);
        }
        // Soft delete
        const result = await pool.query(`UPDATE "user" 
       SET deleted_at = NOW(), status = 'deleted', deleted_by = $1, updated_at = NOW()
       WHERE id = $2 AND bureau_id = $3 AND role = 'super_admin' AND deleted_at IS NULL
       RETURNING id, name, email`, [adminId, id, bureauId]);
        if (result.rows.length === 0) {
            return c.json({ success: false, error: 'Superadmin not found' }, 404);
        }
<<<<<<< HEAD
        // Log admin action
        await logAdminAction(adminId, bureauId, 'delete_superadmin', 'user', id, oldUser, { ...oldUser, status: 'deleted', deleted_by: adminId }, { reason: 'superadmin_removed' });
=======
>>>>>>> ac036362bb0ba0a772985656690ef3b8da0d99b0
        return c.json({ success: true, message: 'Superadmin deleted successfully', data: result.rows[0] });
    }
    catch (error) {
        console.error('[Global Admin] Delete bureau superadmin error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
export default agencyManagement;
