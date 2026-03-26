import { Hono } from 'hono';
import { citizenAuth } from '../middleware/citizen-auth.js';
import { verifyExternalRecord, submitApplication, processMockPayment, getCitizenApplications, getLicenseInfo, addApplicationComment, getApplicationComments } from '../services/transport.js';
const transport = new Hono();
/**
 * 🚗 CITIZEN ROUTES
 */
// 1. Verify Record
transport.post('/verify-record', citizenAuth(), async (c) => {
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
// 2. Submit Application (Handles Multiple Documents)
transport.post('/apply', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const body = await c.req.json();
        const application = await submitApplication({
            userId,
            serviceType: body.serviceType,
            deliveryMethod: body.deliveryMethod,
            externalReferences: body.externalReferences,
            documents: body.documents // Array of URLs
        });
        return c.json({ success: true, message: 'Application submitted', data: application }, 201);
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 3. Pay for Application
transport.post('/pay/:id', citizenAuth(), async (c) => {
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
// 4. My Applications History
transport.get('/my-applications', citizenAuth(), async (c) => {
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
transport.get('/my-license', citizenAuth(), async (c) => {
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
 * 💬 CHAT SYSTEM (CITIZEN SIDE)
 */
// 6. Post a Comment
transport.post('/:id/comments', citizenAuth(), async (c) => {
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
// 7. Get Chat History
transport.get('/:id/comments', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const comments = await getApplicationComments(id);
        return c.json({ success: true, data: comments });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
export default transport;
