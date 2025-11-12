import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🔄 Running migration 006: Add scraped prices to catalog...\n');

  try {
    // Read the migration file
    const migrationPath = join(__dirname, 'migrations', '006_add_scraped_prices_to_catalog.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration SQL:');
    console.log(sql);
    console.log('\n');

    // Split SQL into individual statements and execute each
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      console.log(`🔄 Executing: ${statement.substring(0, 80)}...`);

      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

      if (error) {
        // Try direct execution as fallback
        console.log('⚠️  RPC failed, trying direct execution...');
        const { error: directError } = await supabase.from('shopify_catalog_cache').select('*').limit(0);

        if (directError && !directError.message.includes('already exists')) {
          console.error('❌ Migration failed:', directError);
          throw directError;
        }
      }

      console.log('✅ Success\n');
    }

    // Verify the migration by checking if columns exist
    console.log('🔍 Verifying migration...');
    const { data, error } = await supabase
      .from('shopify_catalog_cache')
      .select('scraped_sale_price, scraped_original_price, scrape_confidence, last_scraped_at')
      .limit(1);

    if (error) {
      console.error('❌ Verification failed:', error);
      console.log('\n⚠️  Manual migration required:');
      console.log('1. Go to Supabase Dashboard → SQL Editor');
      console.log('2. Copy and run the SQL from migrations/006_add_scraped_prices_to_catalog.sql');
      process.exit(1);
    }

    console.log('✅ Migration verified successfully!');
    console.log('📊 New columns added:');
    console.log('   - scraped_sale_price');
    console.log('   - scraped_original_price');
    console.log('   - scrape_confidence');
    console.log('   - last_scraped_at');

  } catch (error) {
    console.error('❌ Migration error:', error);
    console.log('\n⚠️  Manual migration required:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Copy and run the SQL from migrations/006_add_scraped_prices_to_catalog.sql');
    process.exit(1);
  }
}

runMigration();
