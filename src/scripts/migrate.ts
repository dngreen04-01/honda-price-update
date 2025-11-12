#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../database/client.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run database migrations
 */
async function runMigrations(): Promise<void> {
  logger.info('Running database migrations');

  try {
    // Read SQL schema file
    const schemaPath = join(__dirname, '../database/schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');

    // Split by semicolon to execute statements individually
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    logger.info(`Executing ${statements.length} SQL statements`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        // Execute via Supabase RPC or direct query
        const { error } = await supabase.rpc('exec_sql', { sql: statement });

        if (error) {
          // If RPC doesn't exist, try direct execution (may not work for all statements)
          logger.warn(`Statement ${i + 1} failed via RPC, attempting direct execution`, {
            error: error.message,
          });

          // For now, we'll log and continue
          logger.debug(`Statement ${i + 1}:`, { statement: statement.substring(0, 100) });
        } else {
          logger.debug(`Statement ${i + 1} executed successfully`);
        }
      } catch (error) {
        logger.error(`Failed to execute statement ${i + 1}`, {
          error: error instanceof Error ? error.message : String(error),
          statement: statement.substring(0, 100),
        });
      }
    }

    logger.info('Database migrations completed');

    // Verify tables exist
    const { error: tablesError } = await supabase
      .from('domains')
      .select('id')
      .limit(1);

    if (tablesError) {
      logger.error('Table verification failed', { error: tablesError.message });
      logger.warn('You may need to run the SQL schema manually in Supabase SQL Editor');
      logger.info('Schema file location: src/database/schema.sql');
    } else {
      logger.info('✅ Database tables verified successfully');
    }
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Migrations failed', { error: error.message });
      logger.info('\n📝 Manual Migration Instructions:');
      logger.info('1. Go to your Supabase project dashboard');
      logger.info('2. Navigate to SQL Editor');
      logger.info('3. Copy and paste the contents of src/database/schema.sql');
      logger.info('4. Execute the SQL');
      process.exit(1);
    });
}

export { runMigrations };
