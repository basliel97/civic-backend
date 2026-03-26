import { Hono } from 'hono';
import { Pool } from 'pg';
import { config } from '../config/env.js';
import { createMiddleware } from 'hono/factory';
import { 
  verifyExternalRecord, 
  submitApplication, 
  processMockPayment, 
  getCitizenApplications,
  getLicenseInfo,
  addApplicationComment,
  getApplicationComments
} from '../services/transport.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

const transport = new Hono();

/**
 * 🔒 SECURITY MIDDLEWARE
 */
type TransportVariables = { user_id: string; fin: string };

const citizenAuth = createMiddleware<{ Variables: TransportVariables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ success: false, error: 'Login required' }, 401);
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const sessionResult = await pool.query(
      'SELECT "user_id", "expires_at" FROM "session" WHERE token = $1', 
      [token]
    );

    if (sessionResult.rows.length === 0 || new Date(sessionResult.rows[0].expires_at) < new Date()) {
      return c.json({ success: false, error: 'Session expired. Please log in again.' }, 401);
    }
    
    const userResult = await pool.query(
      'SELECT id, fin FROM "user" WHERE id = $1', 
      [sessionResult.rows[0].user_id]
    );
    
    c.set('user_id', userResult.rows[0].id);
    c.set('fin', userResult.rows[0].fin);
    
    await next();
  } catch (error) {
    return c.json({ success: false, error: 'Authentication failed' }, 500);
  }
});

/**
 * 🚗 CITIZEN ROUTES
 */

// 1. Verify Record
transport.post('/verify-record', citizenAuth, async (c) => {
  try {
    const fin = c.get('fin');
    const { recordType, referenceNumber } = await c.req.json();
    
    const record = await verifyExternalRecord(fin, recordType, referenceNumber);
    
    if (!record) {
      return c.json({ success: false, error: 'Record not found or does not match your FIN' }, 404);
    }
    
    return c.json({ success: true, data: record.result_data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. Submit Application (Handles Multiple Documents)
transport.post('/apply', citizenAuth, async (c) => {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 3. Pay for Application
transport.post('/pay/:id', citizenAuth, async (c) => {
  try {
    const { id } = c.req.param();
    const userId = c.get('user_id');
    
    const result = await processMockPayment(id, userId);
    
    return c.json({ success: true, message: 'Payment confirmed', data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

// 4. My Applications History
transport.get('/my-applications', citizenAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const apps = await getCitizenApplications(userId);
    
    return c.json({ success: true, data: apps });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 5. My Digital License
transport.get('/my-license', citizenAuth, async (c) => {
  try {
    const userId = c.get('user_id');
    const license = await getLicenseInfo(userId);
    
    if (!license) {
      return c.json({ success: false, error: 'No active license found' }, 404);
    }
    
    return c.json({ success: true, data: license });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * 💬 CHAT SYSTEM (CITIZEN SIDE)
 */

// 6. Post a Comment
transport.post('/:id/comments', citizenAuth, async (c) => {
  try {
    const { id } = c.req.param();
    const userId = c.get('user_id');
    const { text } = await c.req.json();
    
    if (!text) {
      return c.json({ success: false, error: 'Text is required' }, 400);
    }

    const comment = await addApplicationComment(id, userId, 'citizen', text);
    return c.json({ success: true, data: comment });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 7. Get Chat History
transport.get('/:id/comments', citizenAuth, async (c) => {
  try {
    const { id } = c.req.param();
    const comments = await getApplicationComments(id);
    
    return c.json({ success: true, data: comments });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default transport;