import { Pool } from 'pg';
import { config } from '../config/env.js';

/**
 * Shared database pool instance
 * All modules should import from this file instead of creating their own pools
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
