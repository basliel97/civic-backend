import { Hono } from 'hono';
import { citizenAuth } from '../middleware/citizen-auth.js';
import { pool } from '../db/pool.js';
import { verifyExternalRecord, submitApplication, processMockPayment, getCitizenApplications, getLicenseInfo, addApplicationComment, getApplicationComments, getPublicBureauServices, updateApplicationByCitizen, cancelApplicationByCitizen, getUserActivityLogs, getActiveAnnouncements } from '../services/agency.js';
const citizenPortal = new Hono();
/**
 * 🏛️ GOVERNMENT AGENCY PORTAL - CITIZEN ROUTES
 */
// 0. Get Bureau Services (PUBLIC - No Auth Required)
citizenPortal.get('/bureaus/:bureauId/services', async (c) => {
    try {
        const { bureauId } = c.req.param();
        const services = await getPublicBureauServices(bureauId);
        return c.json({ success: true, data: services });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 1. Verify External Record (Medical/Police)
citizenPortal.post('/verify-record', citizenAuth(), async (c) => {
    try {
        const fin = c.get('fin');
        const { recordType, referenceNumber } = await c.req.json();
        const record = await verifyExternalRecord(fin, recordType, referenceNumber);
        if (!record) {
            return c.json({ success: false, error: 'Record not found or does not match your FIN' }, 404);
        }
        return c.json({ success: true, data: record.result_data });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 2. Submit Application
citizenPortal.post('/apply', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const body = await c.req.json();
        const application = await submitApplication({
            userId,
            serviceId: body.serviceId,
            deliveryMethod: body.deliveryMethod,
            externalReferences: body.externalReferences,
            documents: body.documents
        });
        return c.json({ success: true, message: 'Application submitted', data: application }, 201);
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 3. Process Payment
citizenPortal.post('/pay/:id', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const userId = c.get('user_id');
        const result = await processMockPayment(id, userId);
        return c.json({ success: true, message: 'Payment confirmed', data: result });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 400);
    }
});
// 4. My Applications
citizenPortal.get('/my-applications', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const apps = await getCitizenApplications(userId);
        return c.json({ success: true, data: apps });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 5. My Digital License
citizenPortal.get('/my-license', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const license = await getLicenseInfo(userId);
        if (!license) {
            return c.json({ success: false, error: 'No active license found' }, 404);
        }
        return c.json({ success: true, data: license });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * 💬 COMMUNICATION SYSTEM
 */
// 6. Post a Comment
citizenPortal.post('/:id/comments', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const userId = c.get('user_id');
        const { text } = await c.req.json();
        if (!text) {
            return c.json({ success: false, error: 'Text is required' }, 400);
        }
        const comment = await addApplicationComment(id, userId, 'citizen', text);
        return c.json({ success: true, data: comment });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 7. Get Comment History
citizenPortal.get('/:id/comments', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const comments = await getApplicationComments(id);
        return c.json({ success: true, data: comments });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * PUT /api/portal/applications/:id
 * Citizen updates their own application (Delivery or Documents)
 */
citizenPortal.put('/applications/:id', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const userId = c.get('user_id');
        const { deliveryMethod, documents } = await c.req.json();
        const updated = await updateApplicationByCitizen(id, userId, { deliveryMethod, documents });
        return c.json({
            success: true,
            message: 'Application details updated',
            data: updated
        });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 400);
    }
});
/**
 * 🆕 CANCEL: POST /api/portal/applications/:id/cancel
 * Citizen withdraws their application
 * FIXED: Added () to citizenAuth
 */
citizenPortal.post('/applications/:id/cancel', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const userId = c.get('user_id');
        const result = await cancelApplicationByCitizen(id, userId);
        return c.json({
            success: true,
            message: 'Application withdrawn successfully',
            data: result
        });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 400);
    }
});
citizenPortal.get('/notifications', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const logs = await getUserActivityLogs(userId);
        return c.json({ success: true, data: logs });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 9. Get System Announcements (Public News)
citizenPortal.get('/announcements', async (c) => {
    try {
        // For citizens, get bureau-specific announcements if they have a bureau, otherwise global only
        const userId = c.get('user_id');
        let bureauId;
        if (userId) {
            // Get user's bureau if they have one
            const userResult = await pool.query('SELECT bureau_id FROM "user" WHERE id = $1', [userId]);
            bureauId = userResult.rows[0]?.bureau_id;
        }
        const limit = parseInt(c.req.query('limit') || '10');
        const news = await getActiveAnnouncements(bureauId, limit);
        return c.json({ success: true, data: news });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
export default citizenPortal;
