import { createMiddleware } from 'hono/factory';
import { pool } from '../db/pool.js';

/**
 * Citizen authentication context type
 */
export type CitizenAuthContext = {
  user_id: string;
  fin: string;
  userRole: string;
  userRegion?: string;
  userWorkType?: string;
  userGender?: string;
};

/**
 * Citizen Authentication Middleware
 * 
 * Validates session token and returns user context.
 * Also verifies the account is active (not deleted or inactive).
 * 
 * Use this middleware for any citizen-facing protected routes.
 * 
 * @example
 * ```typescript
 * import { citizenAuth, type CitizenAuthContext } from '../middleware/citizen-auth.js';
 * 
 * const router = new Hono<{ Variables: CitizenAuthContext }>();
 * router.use('/*', citizenAuth());
 * 
 * router.get('/protected', async (c) => {
 *   const userId = c.get('user_id');
 *   const fin = c.get('fin');
 *   // ...
 * });
 * ```
 */
export const citizenAuth = () => createMiddleware<{ Variables: CitizenAuthContext }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ success: false, error: 'Authorization required' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Get session from database
    const sessionResult = await pool.query(
      'SELECT "user_id", "expires_at" FROM "session" WHERE token = $1',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }

    const session = sessionResult.rows[0];

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      return c.json({ success: false, error: 'Session expired. Please log in again.' }, 401);
    }

    // Get user details
    const userResult = await pool.query(
      `SELECT id, fin, role, status, region, work_type, gender, deleted_at 
       FROM "user" WHERE id = $1`,
      [session.user_id]
    );

    if (userResult.rows.length === 0) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const user = userResult.rows[0];

    // Check if account is deleted
    if (user.deleted_at) {
      return c.json({ success: false, error: 'Account has been deleted' }, 403);
    }

    // Check if account is active
    if (user.status !== 'active') {
      return c.json({ success: false, error: `Account is ${user.status}` }, 403);
    }

    // Set user context
    c.set('user_id', user.id);
    c.set('fin', user.fin);
    c.set('userRole', user.role);
    c.set('userRegion', user.region);
    c.set('userWorkType', user.work_type);
    c.set('userGender', user.gender);

    await next();
  } catch (error) {
    console.error('[Citizen Auth] Error:', error);
    return c.json({ success: false, error: 'Authentication failed' }, 500);
  }
});
