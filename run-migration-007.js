import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🔄 Running migration 007: Add source_url column...\n');

  const sql = `
    ALTER TABLE shopify_catalog_cache
    ADD COLUMN IF NOT EXISTS source_url TEXT;
    
    CREATE INDEX IF NOT EXISTS idx_shopify_catalog_source_url
    ON shopify_catalog_cache(source_url);
  `;

  // Use raw SQL via fetch
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ sql_query: sql })
  });

  if (!response.ok) {
    console.log('⚠️  Could not run via RPC, please run manually in Supabase Dashboard\n');
    console.log('SQL to run:');
    console.log(sql);
    console.log('\nVerifying if column exists anyway...');
  }

  // Verify
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('source_url')
    .limit(1);

  if (error) {
    console.error('❌ Migration not complete. Please run manually:\n');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Run: migrations/007_add_source_url_original.sql\n');
    process.exit(1);
  }

  console.log('✅ Migration 007 verified successfully!');
  console.log('📊 source_url column exists\n');
}

runMigration();
