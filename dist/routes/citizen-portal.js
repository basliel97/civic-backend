import { Hono } from 'hono';
import { citizenAuth } from '../middleware/citizen-auth.js';
import { pool } from '../db/pool.js';
import { verifyExternalRecord, submitApplication, processMockPayment, getCitizenApplications, getLicenseInfo, addApplicationComment, getApplicationComments, getPublicBureauServices, updateApplicationByCitizen, cancelApplicationByCitizen, getUserActivityLogs, getActiveAnnouncements, deleteApplicationByCitizen, checkServiceEligibility, notifyGlobalAdmins, getCitizenCertificates, getCitizenCertificateById, getDriverLicenseWithCertificates } from '../services/agency.js';
import { getBureaus, createSuggestion, getMySuggestions } from '../services/suggestion.js';
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
        const { serviceId } = body;
        // 🛡️ SECURITY CHECK: The Final Gatekeeper
        // We call the SAME function we used for the GET check
        const eligibility = await checkServiceEligibility(userId, serviceId);
        if (!eligibility.eligible) {
            return c.json({
                success: false,
                error: "Security Violation: You are not eligible for this service.",
                message: eligibility.message
            }, 403);
        }
        // 🚀 If they pass the check, THEN create the application
        const application = await submitApplication({
            userId,
            serviceId,
            deliveryMethod: body.deliveryMethod,
            externalReferences: body.externalReferences,
            documents: body.documents,
            formResponses: body.formResponses
        });
        return c.json({ success: true, data: application }, 201);
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
        const licenseData = await getDriverLicenseWithCertificates(userId);
        if (!licenseData) {
            return c.json({ success: false, error: 'No active license found' }, 404);
        }
        return c.json({ success: true, data: licenseData });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * 📄 CERTIFICATES & DOCUMENTS
 */
// 6. My Certificates
citizenPortal.get('/my-certificates', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const certificates = await getCitizenCertificates(userId);
        return c.json({ success: true, data: certificates });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 7. Get Specific Certificate
citizenPortal.get('/my-certificates/:id', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const userId = c.get('user_id');
        const certificate = await getCitizenCertificateById(userId, id);
        if (!certificate) {
            return c.json({ success: false, error: 'Certificate not found' }, 404);
        }
        return c.json({ success: true, data: certificate });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * 🚗 DRIVING TESTS & SCHEDULING
 */
// 8. Get My Scheduled Tests
citizenPortal.get('/my-tests', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const result = await pool.query(`SELECT id, test_type, scheduled_date, status, office_location, created_at, updated_at
       FROM test_records
       WHERE user_id = $1
       ORDER BY scheduled_date DESC`, [userId]);
        return c.json({ success: true, data: result.rows });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * 💬 COMMUNICATION SYSTEM
 */
// 9. Post a Comment
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
        const bureauId = c.req.query('bureauId');
        const typeQuery = c.req.query('type');
        // 🆕 THE FIX: Construct the filter object instead of passing a string
        const filters = {
            bureauId: bureauId,
            // If no type is provided, default to 'all' if they are on the news feed, 
            // or 'global' if you prefer. Let's use 'all' for the full feed.
            type: typeQuery || (bureauId ? 'bureau' : 'all')
        };
        const news = await getActiveAnnouncements(filters, 20);
        return c.json({ success: true, data: news });
    }
    catch (error) {
        console.error('[Portal News] Error:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 10. Check Eligibility (Called before showing the application form)
citizenPortal.get('/check-eligibility/:serviceId', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const { serviceId } = c.req.param();
        const result = await checkServiceEligibility(userId, serviceId);
        return c.json({
            success: true,
            eligible: result.eligible,
            reason: result.reason,
            message: result.message
        });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
citizenPortal.get('/bureaus', async (c) => {
    try {
        const bureaus = await getBureaus();
        return c.json({ success: true, data: bureaus });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 2. Submit a private suggestion
// src/routes/citizen-portal.ts
citizenPortal.post('/suggestions', citizenAuth(), async (c) => {
    try {
        const user_id = c.get('user_id');
        const { bureau_id, subject, content } = await c.req.json();
        // 🆕 FIXED: Only check for subject and content. 
        // bureau_id is now OPTIONAL (can be null for General feedback)
        if (!subject || !content) {
            return c.json({ success: false, error: 'Subject and content are required' }, 400);
        }
        // Call the service (it will now pass null to the DB correctly)
        const suggestion = await createSuggestion(user_id, bureau_id, subject, content);
        if (!bureau_id) {
            await notifyGlobalAdmins({ title: 'System Feedback', message: 'A citizen sent feedback about the portal platform.', type: 'info', screen: 'general_feedback', targetId: suggestion.id });
        }
        return c.json({ success: true, data: suggestion }, 201);
    }
    catch (error) {
        console.error("[Suggestions] Error:", error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});
// 3. Get my suggestion history
// src/routes/citizen-portal.ts
citizenPortal.get('/suggestions/my', citizenAuth(), async (c) => {
    try {
        const user_id = c.get('user_id');
        const query = c.req.query();
        const page = parseInt(query.page || '1');
        const limit = Math.min(parseInt(query.limit || '20'), 50);
        // getMySuggestions already returns an object: { suggestions: [], total: X, ... }
        const result = await getMySuggestions(user_id, page, limit);
        // 🚀 Return 'result' directly as 'data'
        return c.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
citizenPortal.delete('/applications/:id', citizenAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const userId = c.get('user_id');
        await deleteApplicationByCitizen(id, userId);
        return c.json({ success: true, message: 'Record removed from history' });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 400);
    }
});
citizenPortal.get('/notifications', citizenAuth(), async (c) => {
    try {
        const userId = c.get('user_id');
        const res = await pool.query(`SELECT 
        id, 
        title, 
        message, 
        type, 
        is_read AS "isRead",        -- 🆕 ALIAS FOR UI
        target_screen AS "targetScreen", -- 🆕 ALIAS FOR UI
        target_id AS "targetId",      -- 🆕 ALIAS FOR UI
        created_at 
      FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC LIMIT 50`, [userId]);
        return c.json({ success: true, data: res.rows });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
citizenPortal.post('/notifications/:id/read', citizenAuth(), async (c) => {
    const { id } = c.req.param();
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [id]);
    return c.json({ success: true });
});
export default citizenPortal;
