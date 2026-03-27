import { Hono } from 'hono';
import { adminAuth, agencyAdminAuth, type AuthContext } from '../middleware/auth.js';
import {
  getTransportStats,
  getAgencyServices,
  createAgencyService,
  getAgencyStaff,
  getAdminApplications,
  getApplicationsByService,
  reviewApplication,
  cancelApplication,
  addApplicationComment,
  getApplicationComments
} from '../services/transport.js';

const transportAdmin = new Hono<{ Variables: AuthContext }>();

/**
 * 🔒 SECURITY: Dynamic Agency Guard
 * Uses agencyAdminAuth() - allows Global Super Admins or any Agency Staff
 */
transportAdmin.use('/*', adminAuth());
transportAdmin.use('/*', agencyAdminAuth());

/**
 * 📊 DASHBOARD STATS
 */
transportAdmin.get('/stats', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const stats = await getTransportStats(bureauId ?? undefined);
    return c.json({ success: true, data: stats });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 🛠️ SERVICE & STAFF MANAGEMENT
 */
transportAdmin.get('/services', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const services = await getAgencyServices(bureauId!);
    return c.json({ success: true, data: services });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

transportAdmin.post('/services', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const body = await c.req.json();
    const service = await createAgencyService(bureauId!, body);
    return c.json({ success: true, data: service });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

transportAdmin.get('/staff', async (c) => {
  try {
    const bureauId = c.get('bureauId');
    const staff = await getAgencyStaff(bureauId!);
    return c.json({ success: true, data: staff });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 🏛️ UNIFIED APPLICATIONS ENDPOINT (Dynamic Multi-tenant)
 * Filter by: ?status=paid&serviceId=uuid
 */
transportAdmin.get('/applications', async (c) => {
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
 * 📋 SERVICE-SPECIFIC APPLICATION TABS (Dynamic Multi-tenant)
 * Each route is now scoped to the admin's bureau.
 */
transportAdmin.get('/renewals', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'renewal', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/verifications', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'verification_international', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/replacements', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'replacement', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/transfers', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'file_transfer', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/specialty-training', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'specialty_training', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/taxi-competency', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'taxi_competency', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/rescheduling', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'rescheduling', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/lifting-suspensions', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'lifting_suspension', status);
  return c.json({ success: true, count: data.length, data });
});

transportAdmin.get('/info-requests', async (c) => {
  const bureauId = c.get('bureauId');
  const status = c.req.query('status');
  const data = await getApplicationsByService(bureauId, 'info_request', status);
  return c.json({ success: true, count: data.length, data });
});

/**
 * 📝 APPLICATION CRUD & REVIEW
 */

// 1. Unified Review Route (Handles App Status, Delivery Status, and Notes)
transportAdmin.post('/review/:id', async (c) => {
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

// 2. Cancel/Archive Application
transportAdmin.delete('/cancel/:id', async (c) => {
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
 * 💬 CHAT SYSTEM (ADMIN SIDE)
 */

// 1. Reply to Citizen
transportAdmin.post('/:id/comments', async (c) => {
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

// 2. View Chat History
transportAdmin.get('/:id/comments', async (c) => {
  try {
    const { id } = c.req.param();
    const comments = await getApplicationComments(id);
    
    return c.json({ success: true, data: comments });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default transportAdmin;