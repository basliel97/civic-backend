import { createMiddleware } from 'hono/factory';
import { pool } from '../db/pool.js';
/**
 * Admin Authorization Middleware
 * Verifies JWT token and checks if user is admin or super_admin
 * Also tracks last login time
 */
export const adminAuth = () => createMiddleware(async (c, next) => {
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
        const sessionResult = await pool.query('SELECT "user_id", "expires_at" FROM "session" WHERE token = $1', [token]);
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
        const userResult = await pool.query('SELECT id, email, name, role, status, bureau_id FROM "user" WHERE id = $1', [session.user_id]);
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
        await pool.query('UPDATE "user" SET "last_login_at" = NOW() WHERE id = $1', [user.id]);
        // Set user in context
        c.set('user', user);
        c.set('user_id', user.id);
        c.set('userRole', user.role);
        c.set('bureauId', user.bureau_id);
        await next();
    }
    catch (error) {
        console.error('[Auth Middleware] Error:', error);
        return c.json({
            success: false,
            error: 'Authentication failed'
        }, 500);
    }
});
/**
 * Dynamic Agency Admin Authorization Middleware
 *
 * Allows access if:
 * 1. User is a Global Super Admin (super_admin with no bureau_id)
 * 2. User belongs to ANY valid bureau (has bureau_id)
 *
 * This replaces the hardcoded agencyAuth(bureauName) middleware.
 */
export const agencyAdminAuth = () => createMiddleware(async (c, next) => {
    const userRole = c.get('userRole');
    const bureauId = c.get('bureauId');
    // A. Global Super Admin (no bureau assigned) - can access all agencies
    if (userRole === 'super_admin' && !bureauId) {
        return await next();
    }
    // B. Any user with a bureau - they belong to some agency
    if (bureauId) {
        return await next();
    }
    // C. Otherwise, deny access
    return c.json({
        success: false,
        error: 'Access Denied: You must be an Agency Staff member to view this.'
    }, 403);
});
/**
 * Global Super Admin Authorization
 * Only for the system-wide admin who manages bureaus and civic engagement.
 */
export const globalSuperAdminAuth = () => createMiddleware(async (c, next) => {
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
export const superAdminAuth = () => createMiddleware(async (c, next) => {
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
export const activeUser = () => createMiddleware(async (c, next) => {
    const user_id = c.get('user_id');
    try {
        const result = await pool.query('SELECT status, deleted_at FROM "user" WHERE id = $1', [user_id]);
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
    }
    catch (error) {
        console.error('[Active User Middleware] Error:', error);
        return c.json({
            success: false,
            error: 'Authorization check failed'
        }, 500);
    }
});
