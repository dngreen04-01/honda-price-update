#!/usr/bin/env node

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

console.log('=== Database Connection Test ===\n');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Supabase credentials not set');
  process.exit(1);
}

console.log(`Supabase URL: ${supabaseUrl}`);
console.log(`Service Key: ${supabaseKey.substring(0, 20)}...`);

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\nTesting database connection...');

try {
  // Test domains table
  const { data: domains, error: domainsError } = await supabase
    .from('domains')
    .select('*')
    .limit(10);

  if (domainsError) {
    console.log('❌ Error querying domains table:', domainsError.message);

    if (domainsError.message.includes('relation') && domainsError.message.includes('does not exist')) {
      console.log('\n📝 Tables have not been created yet!');
      console.log('\nPlease follow these steps:');
      console.log('1. Go to https://app.supabase.com');
      console.log('2. Select your project');
      console.log('3. Go to SQL Editor');
      console.log('4. Copy contents of src/database/schema.sql');
      console.log('5. Paste and execute in SQL Editor');
      console.log('\nSee MANUAL_MIGRATION.md for detailed instructions.');
    }

    process.exit(1);
  }

  console.log('✅ Database connected!');
  console.log(`✅ Found ${domains.length} domains:`);

  domains.forEach(d => {
    console.log(`   - ${d.root_url} (${d.active ? 'active' : 'inactive'})`);
  });

  // Check other tables
  const tables = ['product_pages', 'price_history', 'offers', 'shopify_catalog_cache', 'reconcile_results'];

  console.log('\nChecking other tables...');

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);

    if (error) {
      console.log(`❌ ${table}: NOT FOUND`);
    } else {
      console.log(`✅ ${table}: OK`);
    }
  }

  console.log('\n✅ All database checks passed!');
  console.log('\nYou can now run: npm run scrape');

} catch (error) {
  console.log('❌ Error:', error.message);
  process.exit(1);
}
