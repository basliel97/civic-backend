import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
// We use the Service Role Key here so the backend has full access
export const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceKey);
