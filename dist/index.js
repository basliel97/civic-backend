import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config/env.js';
import { auth } from './auth/index.js';
import citizenAuthRoutes from './routes/citizen-auth.js';
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
        version: '1.0.0',
        documentation: '/api/docs',
        endpoints: {
            auth: '/api/auth/*',
            citizen: '/api/citizen/*',
        }
    });
});
console.log(`🚀 Server running on http://localhost:${config.port}`);
console.log(`📚 Better Auth endpoints: ${config.betterAuthUrl}/api/auth/*`);
console.log(`👥 Citizen endpoints: ${config.betterAuthUrl}/api/citizen/*`);
serve({
    fetch: app.fetch,
    port: config.port
});
