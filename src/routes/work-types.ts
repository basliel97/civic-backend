import { Hono } from 'hono';
import { Pool } from 'pg';
import { config } from '../config/env.js';
import { adminAuth } from '../middleware/auth.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

const workTypes = new Hono();

workTypes.get('/work-types', async (c) => {
  try {
    const result = await pool.query('SELECT * FROM work_types ORDER BY name ASC');
    return c.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('[Work Types] List error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

workTypes.post('/work-types', adminAuth(), async (c) => {
  try {
    const adminId = c.get('userId');
    const { name, category } = await c.req.json();
    
    if (!name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }
    
    const result = await pool.query(
      'INSERT INTO work_types (name, category, is_custom) VALUES ($1, $2, TRUE) RETURNING *',
      [name, category || 'other']
    );
    
    return c.json({ success: true, data: result.rows[0] }, 201);
  } catch (error: any) {
    if (error.code === '23505') {
      return c.json({ success: false, error: 'Work type already exists' }, 409);
    }
    console.error('[Work Types] Create error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

workTypes.delete('/work-types/:id', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    
    const result = await pool.query(
      'UPDATE work_types SET name = name || \' (archived)\' WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return c.json({ success: false, error: 'Work type not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Work type archived' });
  } catch (error: any) {
    console.error('[Work Types] Delete error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default workTypes;
