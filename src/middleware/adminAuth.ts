import { createMiddleware } from 'hono/factory';
import { supabaseAdmin } from '../services/supabase.js';
import type { User } from '@supabase/supabase-js';

// 1. Define the Type for our Hono Context
// This tells TypeScript: "Inside these routes, 'user' is a User object, not unknown"
export type AdminEnv = {
  Variables: {
    user: User;
    role: 'admin' | 'super_admin';
  };
};

export const adminGuard = (requiredRole?: 'super_admin') => createMiddleware<{ Variables: AdminEnv['Variables'] }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization Header' }, 401);
  }

  // Remove "Bearer " prefix
  const token = authHeader.replace('Bearer ', '');

  // 2. Verify Token with Supabase
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: 'Invalid or Expired Token' }, 401);
  }

  // 3. Check Role in Database (Profiles table)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return c.json({ error: 'Profile not found' }, 404);
  }

  // Cast the role string to our specific types
  const userRole = profile.role as 'admin' | 'super_admin' | 'citizen';

  // 4. Permission Checks
  if (userRole !== 'admin' && userRole !== 'super_admin') {
    return c.json({ error: 'Unauthorized: Admins Only' }, 403);
  }

  if (requiredRole === 'super_admin' && userRole !== 'super_admin') {
    return c.json({ error: 'Unauthorized: Super Admins Only' }, 403);
  }

  // 5. Save to Context (Now Type-Safe)
  c.set('user', user);
  c.set('role', userRole);

  await next();
});