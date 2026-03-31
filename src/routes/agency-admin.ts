import { Hono } from 'hono';
import { adminAuth, agencyAdminAuth, type AuthContext } from '../middleware/auth.js';
import {
  getAgencyStats,
  getBureauServices,
  createBureauService,
  getBureauStaff,
  getAdminApplications,
  getApplicationsByService,
  reviewApplication,
  cancelApplication,
  addApplicationComment,
  getApplicationComments
} from '../services/agency.js';

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
 * 🛠️ SERVICE MANAGEMENT
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
    const body = await c.req.json();
    const service = await createBureauService(bureauId!, body);
    return c.json({ success: true, data: service });
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
 * 📋 UNIFIED APPLICATIONS ENDPOINT (Dynamic Multi-tenant)
 * Filter by: ?status=paid&serviceId=uuid
 */
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

/**
 * 📂 SERVICE-SPECIFIC APPLICATION TABS (Dynamic Multi-tenant)
 * Each route is scoped to the admin's bureau.
 */
agencyAdmin.get('/renewals', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'renewal', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/verifications', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'verification_international', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/replacements', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'replacement', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/transfers', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'file_transfer', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/specialty-training', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'specialty_training', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/taxi-competency', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'taxi_competency', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/rescheduling', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'rescheduling', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/lifting-suspensions', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'lifting_suspension', status);
  return c.json({ success: true, count: data.length, data });
});

agencyAdmin.get('/info-requests', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'info_request', status);
  return c.json({ success: true, count: data.length, data });
});

/**
 * 📝 APPLICATION REVIEW
 */

// 1. Review Application (Approve/Reject with conditional license issuance)
agencyAdmin.post('/review/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    const updates = await c.req.json();

    const result = await reviewApplication(id, adminId, updates);

    return c.json({ success: true, message: 'Review updated', data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. Cancel Application
agencyAdmin.delete('/cancel/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    const { reason } = await c.req.json();

    const result = await cancelApplication(id, adminId, reason);

    return c.json({ success: true, message: 'Application cancelled', data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 💬 COMMUNICATION SYSTEM (ADMIN SIDE)
 */

// 1. Reply to Citizen
agencyAdmin.post('/:id/comments', async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    const { text } = await c.req.json();

    if (!text) {
      return c.json({ success: false, error: 'Text is required' }, 400);
    }

    const comment = await addApplicationComment(id, adminId, 'admin', text);

    return c.json({ success: true, data: comment });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. View Comment History
agencyAdmin.get('/:id/comments', async (c) => {
  try {
    const { id } = c.req.param();
    const comments = await getApplicationComments(id);

    return c.json({ success: true, data: comments });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default agencyAdmin;
