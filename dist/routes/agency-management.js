import { Hono } from 'hono';
import { auth } from '../auth/index.js';
import { pool } from '../db/pool.js';
import { globalSuperAdminAuth, adminAuth, superAdminAuth } from '../middleware/auth.js';
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
        const bureauId = c.get('bureauId');
        const { id } = c.req.param();
        const { name, role } = await c.req.json();
        // Security check: Only update if the target user belongs to the SAME bureau
        const result = await pool.query(`UPDATE "user" 
       SET name = COALESCE($1, name), role = COALESCE($2, role), updated_at = NOW() 
       WHERE id = $3 AND bureau_id = $4 AND deleted_at IS NULL
       RETURNING id, name, email, role, status`, [name, role, id, bureauId]);
        if (result.rows.length === 0) {
            return c.json({ success: false, error: 'Staff member not found in your agency' }, 404);
        }
        return c.json({ success: true, message: 'Staff updated successfully', data: result.rows[0] });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 4. UPDATE Staff Status (Suspend / Activate)
agencyManagement.patch('/staff/:id/status', superAdminAuth(), async (c) => {
    try {
        const bureauId = c.get('bureauId');
        const loggedInUserId = c.get('user_id');
        const { id } = c.req.param();
        const { status } = await c.req.json(); // 'active' or 'inactive'
        if (id === loggedInUserId) {
            return c.json({ success: false, error: 'You cannot suspend your own account' }, 400);
        }
        const result = await pool.query(`UPDATE "user" 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 AND bureau_id = $3 AND deleted_at IS NULL
       RETURNING id, name, status`, [status, id, bureauId]);
        if (result.rows.length === 0)
            return c.json({ success: false, error: 'Staff member not found' }, 404);
        return c.json({ success: true, message: `Staff member marked as ${status}`, data: result.rows[0] });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 5. DELETE Staff (Soft Delete - if they resign or are fired)
agencyManagement.delete('/staff/:id', superAdminAuth(), async (c) => {
    try {
        const bureauId = c.get('bureauId');
        const loggedInUserId = c.get('user_id');
        const { id } = c.req.param();
        // Prevent self-deletion
        if (id === loggedInUserId) {
            return c.json({ success: false, error: 'You cannot delete your own account' }, 400);
        }
        // Soft delete: set deleted_at to NOW()
        const result = await pool.query(`UPDATE "user" 
       SET deleted_at = NOW(), status = 'deleted', deleted_by = $1 
       WHERE id = $2 AND bureau_id = $3 AND deleted_at IS NULL
       RETURNING id, name`, [loggedInUserId, id, bureauId]);
        if (result.rows.length === 0)
            return c.json({ success: false, error: 'Staff member not found' }, 404);
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
// 1. GET All Bureaus with their Admins and SuperAdmins
agencyManagement.get('/bureaus/admins', adminAuth(), globalSuperAdminAuth(), async (c) => {
    try {
        // Fetch all active bureaus
        const bureausResult = await pool.query(`SELECT id, name, description, contact_email, phone, address, status 
       FROM bureaus 
       WHERE status = 'active' 
       ORDER BY name ASC`);
        const bureaus = bureausResult.rows;
        // For each bureau, fetch admins and superadmins
        const result = [];
        for (const bureau of bureaus) {
            const adminsResult = await pool.query(`SELECT id, name, email, role, status, created_at, last_login_at 
         FROM "user" 
         WHERE bureau_id = $1 AND role IN ('admin', 'super_admin') AND deleted_at IS NULL
         ORDER BY role, created_at`, [bureau.id]);
            result.push({
                bureau: bureau,
                admins: adminsResult.rows
            });
        }
        return c.json({ success: true, data: result });
    }
    catch (error) {
        console.error('[Global Admin] Get bureaus admins error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 2. GET Admins and SuperAdmin for a specific Bureau
agencyManagement.get('/bureaus/:bureauId/admins', adminAuth(), globalSuperAdminAuth(), async (c) => {
    try {
        const { bureauId } = c.req.param();
        // Check if bureau exists
        const bureauCheck = await pool.query('SELECT id, name FROM bureaus WHERE id = $1 AND status = $2', [bureauId, 'active']);
        if (bureauCheck.rows.length === 0) {
            return c.json({ success: false, error: 'Bureau not found' }, 404);
        }
        const bureau = bureauCheck.rows[0];
        // Fetch admins and superadmins for this bureau
        const adminsResult = await pool.query(`SELECT id, name, email, role, status, created_at, last_login_at 
       FROM "user" 
       WHERE bureau_id = $1 AND role IN ('admin', 'super_admin') AND deleted_at IS NULL
       ORDER BY role, created_at`, [bureauId]);
        return c.json({
            success: true,
            data: {
                bureau: bureau,
                admins: adminsResult.rows
            }
        });
    }
    catch (error) {
        console.error('[Global Admin] Get bureau admins error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
export default agencyManagement;
