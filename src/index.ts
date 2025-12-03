import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config/env.js';
import authRoutes from './routes/auth.js';

const app = new Hono();

// Middleware
app.use('/*', cors()); // Allow Mobile App to connect

// Routes
app.route('/auth', authRoutes);

// Health Check
app.get('/', (c) => {
  return c.json({ status: 'Civic Backend is Running 🚀' });
});

console.log(`Server is running on http://localhost:${config.port}`);

serve({
  fetch: app.fetch,
  port: config.port
});