import { Hono } from "hono";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { config } from "../config/env.js";
import { adminAuth, type AuthContext } from "../middleware/auth.js";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

/**
 * Admin Management Routes
 * For admin password management and citizen password resets
 */
const adminRoutes = new Hono<{ Variables: AuthContext }>();

/**
 * POST /admin/forgot-password
 * Admin forgot password via email
 * This redirects to Better Auth's built-in forgot password endpoint
 */
adminRoutes.post("/forgot-password", adminAuth(), async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ 
        success: false, 
        error: "Email is required" 
      }, 400);
    }

    // Check if user exists and is admin
    const result = await pool.query(
      'SELECT id, role FROM "user" WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if user exists
      return c.json({ 
        success: true, 
        message: "If an account exists, a reset link has been sent." 
      });
    }

    const user = result.rows[0];
    
    // Only allow forgot password for admins
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return c.json({ 
        success: true, 
        message: "If an account exists, a reset link has been sent." 
      });
    }

    // Return success - frontend should call Better Auth's /api/auth/forget-password
    return c.json({ 
      success: true, 
      message: "Use Better Auth forgot password endpoint: POST /api/auth/forget-password",
      endpoint: "/api/auth/forget-password",
      body: { email }
    });

  } catch (error: any) {
    console.error("[Admin] Forgot password error:", error);
    return c.json({ 
      success: false, 
      error: error.message || "Failed to process request" 
    }, 500);
  }
});

/**
 * POST /admin/change-password
 * Admin change their own password
 */
adminRoutes.post("/change-password", adminAuth(), async (c) => {
  try {
    const { currentPassword, newPassword } = await c.req.json();
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader) {
      return c.json({ 
        success: false, 
        error: "Authorization required" 
      }, 401);
    }

    if (!currentPassword || !newPassword) {
      return c.json({ 
        success: false, 
        error: "Current password and new password are required" 
      }, 400);
    }

    // Extract token from Authorization header
    const token = authHeader.replace('Bearer ', '');
    
    // Get user from session
    const sessionResult = await pool.query(
      'SELECT "userId" FROM "session" WHERE token = $1',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return c.json({ 
        success: false, 
        error: "Invalid session" 
      }, 401);
    }

    const userId = sessionResult.rows[0].userId;

    // Verify current password
    const userResult = await pool.query(
      'SELECT "userId", password FROM "account" WHERE "userId" = $1 AND "providerId" = $2',
      [userId, 'credential']
    );

    if (userResult.rows.length === 0) {
      return c.json({ 
        success: false, 
        error: "User not found" 
      }, 404);
    }

    const account = userResult.rows[0];
    const isValid = await bcrypt.compare(currentPassword, account.password);

    if (!isValid) {
      return c.json({ 
        success: false, 
        error: "Current password is incorrect" 
      }, 401);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE "account" SET password = $1 WHERE "userId" = $2',
      [hashedPassword, userId]
    );

    return c.json({ 
      success: true, 
      message: "Password changed successfully" 
    });

  } catch (error: any) {
    console.error("[Admin] Change password error:", error);
    return c.json({ 
      success: false, 
      error: error.message || "Failed to change password" 
    }, 500);
  }
});

/**
 * POST /admin/reset-citizen-password
 * Admin resets citizen password
 */
adminRoutes.post("/reset-citizen-password", adminAuth(), async (c) => {
  try {
    const { userId, newPassword } = await c.req.json();

    if (!userId || !newPassword) {
      return c.json({ 
        success: false, 
        error: "User ID and new password are required" 
      }, 400);
    }

    // Check if user exists and is a citizen
    const userCheck = await pool.query(
      'SELECT role FROM "user" WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return c.json({ 
        success: false, 
        error: "User not found" 
      }, 404);
    }

    if (userCheck.rows[0].role !== 'citizen') {
      return c.json({ 
        success: false, 
        error: "Can only reset citizen passwords" 
      }, 403);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in account table
    const accountResult = await pool.query(
      'UPDATE "account" SET password = $1 WHERE "userId" = $2 RETURNING id',
      [hashedPassword, userId]
    );

    if (accountResult.rowCount === 0) {
      // Create account entry if doesn't exist
      await pool.query(
        'INSERT INTO "account" (id, "userId", "accountId", "providerId", password, "created_at", "updated_at") VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())',
        [userId, userId, 'credential', hashedPassword]
      );
    }

    return c.json({ 
      success: true, 
      message: "Citizen password reset successfully" 
    });

  } catch (error: any) {
    console.error("[Admin] Reset citizen password error:", error);
    return c.json({ 
      success: false, 
      error: error.message || "Failed to reset password" 
    }, 500);
  }
});

export default adminRoutes;
