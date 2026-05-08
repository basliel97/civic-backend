import { Hono } from 'hono';
import { adminAuth, type AuthContext } from '../middleware/auth.js';
import { getGlobalAdminStatsOverview, getGlobalAdminStatsDetailed } from '../services/global-admin.js';
import { getGlobalAnnouncements, createGlobalAnnouncement, updateAnnouncement, deleteAnnouncement } from '../services/agency.js';

const globalAdmin = new Hono<{ Variables: AuthContext }>();

/**
 * 🔒 SECURITY: Global Admin Access Only
 * Uses adminAuth() - allows 'admin' or 'super_admin' roles
 * Additional check: bureauId must be null (global access only)
 */
globalAdmin.use('/*', adminAuth());
globalAdmin.use('/*', async (c, next) => {
  const bureauId = c.get('bureauId');
  if (bureauId !== null) {
    return c.json({
      success: false,
      error: 'Access Denied: Global admin access only. Bureau-assigned admins cannot access this endpoint.'
    }, 403);
  }
  await next();
});

/**
 * 📊 GLOBAL ADMIN DASHBOARD STATISTICS - OVERVIEW
 * High-level totals for quick dashboard load
 */
globalAdmin.get('/stats/overview', async (c) => {
  try {
    const stats = await getGlobalAdminStatsOverview();
    return c.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('[Global Admin] Overview stats error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 📊 GLOBAL ADMIN DASHBOARD STATISTICS - DETAILED
 * Detailed breakdowns with filters and insights
 */
globalAdmin.get('/stats/detailed', async (c) => {
  try {
    const stats = await getGlobalAdminStatsDetailed();
    return c.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('[Global Admin] Detailed stats error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 📢 GLOBAL ANNOUNCEMENT MANAGEMENT
 */

// Get Global Announcements
globalAdmin.get('/announcements', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const announcements = await getGlobalAnnouncements(limit, offset);
    return c.json({ success: true, data: announcements });
  } catch (error: any) {
    console.error('[Global Admin] Get announcements error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create Global Announcement
globalAdmin.post('/announcements', async (c) => {
  try {
    const adminId = c.get('user_id');
    const data = await c.req.json();

    if (!data.title || !data.content) {
      return c.json({ success: false, error: 'Title and content are required' }, 400);
    }

    const announcement = await createGlobalAnnouncement(adminId, data);
    return c.json({ success: true, data: announcement });
  } catch (error: any) {
    console.error('[Global Admin] Create announcement error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update Global Announcement
globalAdmin.put('/announcements/:id', async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();
    const data = await c.req.json();

    const updated = await updateAnnouncement(id, null, adminId, data);
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Global Admin] Update announcement error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete Global Announcement
globalAdmin.delete('/announcements/:id', async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();

    const deleted = await deleteAnnouncement(id, null, adminId);
    return c.json({ success: true, message: 'Announcement deactivated', data: deleted });
  } catch (error: any) {
    console.error('[Global Admin] Delete announcement error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});



export default globalAdmin;