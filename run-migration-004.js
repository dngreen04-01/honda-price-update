import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runMigration() {
  console.log('=== Running Migration 004: Fix source_url_canonical unique constraint ===\n');

  try {
    // Read the migration SQL
    const migrationSQL = readFileSync('migrations/004_fix_source_url_unique_constraint.sql', 'utf8');

    console.log('Executing migration SQL...\n');

    // Execute through Supabase RPC or direct SQL
    // Note: Supabase client doesn't support DDL directly, so we'll do it step by step

    // Step 1: Drop the unique constraint
    console.log('Step 1: Dropping UNIQUE constraint from source_url_canonical...');

    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE shopify_catalog_cache DROP CONSTRAINT IF EXISTS shopify_catalog_cache_source_url_canonical_key;'
    }).catch(async () => {
      // If RPC doesn't exist, we need to manually execute
      // This is a workaround - the constraint needs to be dropped in Supabase SQL Editor
      console.log('\n⚠️  Cannot execute DDL through Supabase JS client.');
      console.log('Please run this SQL manually in Supabase SQL Editor:\n');
      console.log('----------------------------------------');
      console.log(migrationSQL);
      console.log('----------------------------------------\n');

      return { error: new Error('Manual migration required') };
    });

    if (dropError) {
      throw dropError;
    }

    console.log('✅ Migration 004 completed successfully!\n');
    console.log('Summary:');
    console.log('- Removed UNIQUE constraint from source_url_canonical');
    console.log('- shopify_variant_id remains UNIQUE');
    console.log('- Multiple products can now share the same source URL (e.g., empty URLs)\n');

  } catch (error) {
    console.error('\n❌ Migration failed:',error.message);
    console.log('\n📝 MANUAL MIGRATION REQUIRED');
    console.log('Please run this SQL in Supabase SQL Editor (https://supabase.com/dashboard):\n');
    console.log('----------------------------------------');
    const migrationSQL = readFileSync('migrations/004_fix_source_url_canonical_constraint.sql', 'utf8');
    console.log(migrationSQL);
    console.log('----------------------------------------\n');

    process.exit(1);
  }
}

runMigration();
