import { Hono } from 'hono';
import { adminAuth, agencyAuth } from '../middleware/auth.js';
import { getTransportStats, getAgencyServices, createAgencyService, getAgencyStaff, getApplicationsByService, reviewApplication, cancelApplication, addApplicationComment, getApplicationComments } from '../services/transport.js';
const transportAdmin = new Hono();
/**
 * 🔒 SECURITY: The Bureau Guard
 */
transportAdmin.use('/*', adminAuth());
transportAdmin.use('/*', agencyAuth('Addis Ababa Traffic Management'));
/**
 * 📊 DASHBOARD STATS
 */
transportAdmin.get('/stats', async (c) => {
    try {
        const stats = await getTransportStats();
        return c.json({ success: true, data: stats });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * 🛠️ SERVICE & STAFF MANAGEMENT
 */
transportAdmin.get('/services', async (c) => {
    try {
        const bureauId = c.get('bureauId');
        const services = await getAgencyServices(bureauId);
        return c.json({ success: true, data: services });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
transportAdmin.post('/services', async (c) => {
    try {
        const bureauId = c.get('bureauId');
        const body = await c.req.json();
        const service = await createAgencyService(bureauId, body);
        return c.json({ success: true, data: service });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
transportAdmin.get('/staff', async (c) => {
    try {
        const bureauId = c.get('bureauId');
        const staff = await getAgencyStaff(bureauId);
        return c.json({ success: true, data: staff });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * 🏛️ ALL 9 EXPLICIT SERVICE TABS (GET)
 */
transportAdmin.get('/renewals', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('renewal', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/verifications', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('verification_international', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/replacements', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('replacement', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/transfers', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('file_transfer', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/specialty-training', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('specialty_training', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/taxi-competency', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('taxi_competency', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/rescheduling', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('rescheduling', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/lifting-suspensions', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('lifting_suspension', status);
    return c.json({ success: true, count: data.length, data });
});
transportAdmin.get('/info-requests', async (c) => {
    const status = c.req.query('status');
    const data = await getApplicationsByService('info_request', status);
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 2. View Chat History
transportAdmin.get('/:id/comments', async (c) => {
    try {
        const { id } = c.req.param();
        const comments = await getApplicationComments(id);
        return c.json({ success: true, data: comments });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
export default transportAdmin;
