import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    logger.info('Initializing Supabase client');
    supabaseClient = createClient(
      config.supabase.url,
      config.supabase.serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return supabaseClient;
}

export const supabase = getSupabaseClient();
