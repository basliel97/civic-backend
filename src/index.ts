import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config/env.js';
import { auth } from './auth/index.js';
import citizenAuthRoutes from './routes/citizen-auth.js';
import adminRoutes from './routes/admin.js';
import citizenManagementRoutes from './routes/citizen-management.js';
import civicRoutes from './routes/civic.js';
import civicAdminRoutes from './routes/civic-admin.js';
import workTypesRoutes from './routes/work-types.js';

const app = new Hono();

// CORS Configuration
app.use('/*', cors({
  origin: config.trustedOrigins?.split(',') || [config.betterAuthUrl, 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// Mount Better Auth handler - handles all standard auth routes at /api/auth/*
app.on(['POST', 'GET', 'PUT', 'DELETE'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw);
});

// Mount Citizen Auth routes (Fayda integration)
app.route('/api/citizen', citizenAuthRoutes);

// Mount Admin routes
app.route('/api/admin', adminRoutes);

// Mount Citizen Management routes
app.route('/api/admin', citizenManagementRoutes);

// Mount Civic Engagement routes (public)
app.route('/api', civicRoutes);

// Mount Civic Engagement Admin routes
app.route('/api/admin', civicAdminRoutes);

// Mount Work Types routes
app.route('/api', workTypesRoutes);

// Health Check
app.get('/', (c) => {
  return c.json({ 
    status: 'Civic Backend is Running 🚀',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Documentation endpoint
app.get('/api', (c) => {
  return c.json({
    name: 'Civic Backend API',
    version: '2.0.0',
    documentation: '/api/docs',
    features: {
      auth: 'Better Auth with username support (FIN as username)',
      email: 'Optional for citizens, required for admins',
      password_reset: 'SMS OTP for citizens, email for admins'
    },
    endpoints: {
      auth: '/api/auth/*',
      citizen: '/api/citizen/*',
      admin: '/api/admin/*'
    }
  });
});

console.log(`🚀 Server running on http://localhost:${config.port}`);
console.log(`📚 Better Auth endpoints: ${config.betterAuthUrl}/api/auth/*`);
console.log(`👥 Citizen endpoints: ${config.betterAuthUrl}/api/citizen/*`);
console.log(`👮 Admin endpoints: ${config.betterAuthUrl}/api/admin/*`);

serve({
  fetch: app.fetch,
  port: config.port
});