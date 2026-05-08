import { Hono } from 'hono';
import { adminAuth, globalSuperAdminAuth } from '../middleware/auth.js';
import { getGlobalSystemAuditLogs, getGlobalAuditStats, getGlobalSecurityLogs } from '../services/global-audit.js';
import { getPlatformGrowthTrends } from '../services/global-admin.js';
import { pool } from '../db/pool.js';
const globalAuditRoutes = new Hono();
// 🔒 SECURITY: Strictly for Global Super Admins (bureau_id must be null)
globalAuditRoutes.use('/*', adminAuth());
globalAuditRoutes.use('/*', globalSuperAdminAuth());
// 1. Get High-Level System Stats
globalAuditRoutes.get('/stats', async (c) => {
    try {
        const stats = await getGlobalAuditStats();
        return c.json({ success: true, data: stats });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 2. Get Global System Actions (Bureau-Free Logs)
globalAuditRoutes.get('/admin-actions', async (c) => {
    try {
        const limit = parseInt(c.req.query('limit') || '100');
        const offset = parseInt(c.req.query('offset') || '0');
        const logs = await getGlobalSystemAuditLogs(limit, offset);
        return c.json({ success: true, data: logs });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 3. Get Global Security Events
globalAuditRoutes.get('/security', async (c) => {
    try {
        const logs = await getGlobalSecurityLogs();
        return c.json({ success: true, data: logs });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
globalAuditRoutes.get('/stats/growth', async (c) => {
    try {
        const trends = await getPlatformGrowthTrends();
        return c.json({
            success: true,
            data: trends
        });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
globalAuditRoutes.get('/notifications', async (c) => {
    try {
        const adminId = c.get('user_id');
        const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [adminId]);
        return c.json({ success: true, data: result.rows });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// Mark system alert as read
globalAuditRoutes.post('/notifications/:id/read', async (c) => {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [id, adminId]);
    return c.json({ success: true });
});
export default globalAuditRoutes;
