import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runMigration() {
  console.log('=== Running Migration 005: Add archive fields ===\n');

  try {
    // Read the migration SQL
    const migrationSQL = readFileSync('migrations/005_add_archive_fields.sql', 'utf8');

    console.log('Executing migration SQL...\n');

    // Supabase client doesn't support DDL directly
    console.log('\n⚠️  DDL operations must be run through Supabase SQL Editor.');
    console.log('Please run this SQL manually in Supabase SQL Editor:\n');
    console.log('Go to: https://supabase.com/dashboard → Your Project → SQL Editor\n');
    console.log('----------------------------------------');
    console.log(migrationSQL);
    console.log('----------------------------------------\n');

    console.log('After running the SQL, the following columns will be added to product_pages:');
    console.log('- archived (BOOLEAN DEFAULT false)');
    console.log('- archived_at (TIMESTAMPTZ)');
    console.log('- archive_reason (TEXT)\n');

  } catch (error) {
    console.error('\n❌ Failed to read migration file:', error.message);
    process.exit(1);
  }
}

runMigration();
