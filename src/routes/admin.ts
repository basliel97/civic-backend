import { Hono } from 'hono';
import { supabaseAdmin } from '../services/supabase.js';
import { adminGuard, type AdminEnv } from '../middleware/adminAuth.js';

// Initialize Hono with the custom Environment Type
const admin = new Hono<AdminEnv>();

// --- PUBLIC ROUTES (No Token Required) ---

/**
 * ADMIN LOGIN
 */
admin.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) return c.json({ error: "Missing credentials" }, 400);

  try {
    // 1. Authenticate via Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      return c.json({ error: "Invalid Credentials" }, 401);
    }

    // 2. Check Database Role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name, id')
      .eq('id', authData.user.id)
      .single();

    // 3. Reject if not an Admin
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
      // Security: Sign them out immediately if they aren't an admin
      await supabaseAdmin.auth.admin.signOut(authData.session.access_token);
      return c.json({ error: "Unauthorized: Access denied for non-admin accounts." }, 403);
    }

    // 4. Return Session
    return c.json({
      message: "Welcome Admin",
      session: authData.session,
      user: {
        id: profile.id,
        name: profile.full_name,
        email: authData.user.email,
        role: profile.role
      }
    });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * REFRESH TOKEN
 */
admin.post('/refresh', async (c) => {
  const { refresh_token } = await c.req.json();
  
  if (!refresh_token) return c.json({ error: "Missing Refresh Token" }, 400);

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });

  if (error) return c.json({ error: "Session Expired. Please Login Again." }, 401);

  return c.json({ session: data.session });
});


// --- PROTECTED ROUTES (Token Required) ---

/**
 * LOGOUT
 * Fixes: Uses auth.admin.signOut(token)
 */
admin.post('/logout', adminGuard(), async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    // The Admin API requires the JWT to sign out that specific user session
    const { error } = await supabaseAdmin.auth.admin.signOut(token);
    if (error) {
      console.error("Logout Error:", error.message);
    }
  }
  
  return c.json({ message: "Logged out successfully" });
});

/**
 * GET CURRENT ADMIN
 * Fixes: Types for 'user' and 'role' are now known
 */
admin.get('/me', adminGuard(), async (c) => {
  // Since we used Hono<AdminEnv>, TypeScript knows these exist
  const user = c.get('user'); 
  const role = c.get('role');

  return c.json({ 
    id: user.id, 
    email: user.email, 
    role: role,
    last_login: user.last_sign_in_at
  });
});

/**
 * SUPER ADMIN ONLY EXAMPLE
 */
admin.get('/system-logs', adminGuard('super_admin'), async (c) => {
  return c.json({ 
    logs: [
      { id: 1, event: "System Started", time: new Date().toISOString() },
      { id: 2, event: "Database Backup", time: new Date().toISOString() }
    ] 
  });
});

export default admin;