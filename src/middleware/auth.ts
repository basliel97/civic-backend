import { createMiddleware } from 'hono/factory';
import { pool } from '../db/pool.js';

// Type definitions for Hono context
export type AuthContext = {
  user: {
    id: string;
    email: string | null;
    name: string;
    role: string;
    status: string;
      bureau_id?: string | null;
  };
  user_id: string;
  userRole: string;
  bureauId?: string | null;
};

/**
 * Admin Authorization Middleware
 * Verifies JWT token and checks if user is admin or super_admin
 * Also tracks last login time
 */
export const adminAuth = () => createMiddleware<{ Variables: AuthContext }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ 
      success: false, 
      error: 'Authorization header required' 
    }, 401);
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Get session from database
    const sessionResult = await pool.query(
      'SELECT "user_id", "expires_at" FROM "session" WHERE token = $1',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return c.json({ 
        success: false, 
        error: 'Invalid or expired token' 
      }, 401);
    }

    const session = sessionResult.rows[0];
    
    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      return c.json({ 
        success: false, 
        error: 'Session expired' 
      }, 401);
    }

    // Get user details
    const userResult = await pool.query(
      'SELECT id, email, name, role, status, bureau_id FROM "user" WHERE id = $1',
      [session.user_id]
    );

    if (userResult.rows.length === 0) {
      return c.json({ 
        success: false, 
        error: 'User not found' 
      }, 404);
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return c.json({ 
        success: false, 
        error: `Account is ${user.status}` 
      }, 403);
    }

    // Check if user is admin
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return c.json({ 
        success: false, 
        error: 'Unauthorized: Admins only' 
      }, 403);
    }

    // Update last login time
    await pool.query(
      'UPDATE "user" SET "last_login_at" = NOW() WHERE id = $1',
      [user.id]
    );

    // Set user in context
    c.set('user', user);
    c.set('user_id', user.id);
    c.set('userRole', user.role);
     c.set('bureauId', user.bureau_id); 


    await next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    return c.json({ 
      success: false, 
      error: 'Authentication failed' 
    }, 500);
  }
});


export const agencyAuth = (bureauName: string) => createMiddleware<{ Variables: AuthContext }>(async (c, next) => {
  const user = c.get('user');
  const userRole = c.get('userRole');
  const bureauId = c.get('bureauId');

  // A. If Global Super Admin (No bureau assigned), they can see everything
  if (userRole === 'super_admin' && !bureauId) {
    return await next();
  }

  // B. If they have a bureau, check if it matches the name of the agency
  if (bureauId) {
    const res = await pool.query('SELECT name FROM bureaus WHERE id = $1', [bureauId]);
    const currentBureauName = res.rows[0]?.name;

    if (currentBureauName === bureauName) {
      return await next();
    }
  }

  return c.json({ 
    success: false, 
    error: `Forbidden: This dashboard is only for ${bureauName} staff.` 
  }, 403);
});



/**
 * Global Super Admin Authorization
 * Only for the system-wide admin who manages bureaus and civic engagement.
 */
export const globalSuperAdminAuth = () => createMiddleware<{ Variables: AuthContext }>(async (c, next) => {
  const userRole = c.get('userRole');
  const bureauId = c.get('bureauId');
  
  // We check if bureauId is "falsy" (null, undefined, or empty)
  const isGlobal = !bureauId; 

  if (userRole !== 'super_admin' || !isGlobal) {
    return c.json({ 
      success: false, 
      error: "Unauthorized: Global Super Admin only",
      debug: { role: userRole, bureauId: bureauId } // This helps you see what's wrong if it fails
    }, 403);
  }

  await next();
});
/**
 * Super Admin Authorization Middleware
 * Verifies user is super_admin
 */
export const superAdminAuth = () => createMiddleware<{ Variables: AuthContext }>(async (c, next) => {
  const userRole = c.get('userRole');
  
  if (userRole !== 'super_admin') {
    return c.json({ 
      success: false, 
      error: 'Unauthorized: Super Admin only' 
    }, 403);
  }

  await next();
});

/**
 * Active User Middleware
 * Checks if user account is active (not deleted or inactive)
 */
export const activeUser = () => createMiddleware<{ Variables: AuthContext }>(async (c, next) => {
  const user_id = c.get('user_id');
  
  try {
    const result = await pool.query(
      'SELECT status, deleted_at FROM "user" WHERE id = $1',
      [user_id]
    );

    if (result.rows.length === 0) {
      return c.json({ 
        success: false, 
        error: 'User not found' 
      }, 404);
    }

    const user = result.rows[0];

    if (user.deleted_at) {
      return c.json({ 
        success: false, 
        error: 'Account has been deleted' 
      }, 403);
    }

    if (user.status === 'inactive') {
      return c.json({ 
        success: false, 
        error: 'Account is inactive' 
      }, 403);
    }

    await next();
  } catch (error) {
    console.error('[Active User Middleware] Error:', error);
    return c.json({ 
      success: false, 
      error: 'Authorization check failed' 
    }, 500);
  }
});
