import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('Running scheduler_state table migration...\n');

  try {
    // Read the migration SQL file
    const sql = fs.readFileSync('migrations/003_scheduler_state.sql', 'utf8');

    // Note: Supabase JavaScript client doesn't support raw SQL execution
    // This needs to be run via Supabase SQL Editor
    console.log('⚠️  Please run this SQL in Supabase SQL Editor:');
    console.log('--------------------------------------------------');
    console.log(sql);
    console.log('--------------------------------------------------\n');

    console.log('Or use the Supabase CLI:');
    console.log('supabase db execute --file migrations/003_scheduler_state.sql\n');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

runMigration().then(() => process.exit(0));
