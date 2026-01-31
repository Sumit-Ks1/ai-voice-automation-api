import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env';
import logger from './logger';

/**
 * Supabase database client singleton
 * Uses service role key for server-side operations with full access
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client with configuration
 * Connection pooling and retry logic handled by Supabase client
 */
export function getDatabase(): SupabaseClient {
  if (!supabaseClient) {
    try {
      supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'x-application-name': 'ai-voice-automation',
          },
        },
      });

      logger.info('Supabase client initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize Supabase client');
      throw error;
    }
  }

  return supabaseClient;
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDatabase(): Promise<void> {
  if (supabaseClient) {
    // Supabase client doesn't have explicit close method
    // Connections are managed automatically
    supabaseClient = null;
    logger.info('Supabase client connection closed');
  }
}

/**
 * Health check for database connectivity
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const db = getDatabase();
    const { error } = await db.from('appointments').select('count').limit(1);
    
    if (error) {
      logger.error({ err: error }, 'Database health check failed');
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database health check error');
    return false;
  }
}

export default getDatabase;
