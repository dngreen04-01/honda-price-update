import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🔄 Running migration directly...\n');

  // Execute SQL using Supabase's SQL API
  const statements = [
    `ALTER TABLE shopify_catalog_cache ADD COLUMN IF NOT EXISTS scraped_sale_price DECIMAL(10, 2)`,
    `ALTER TABLE shopify_catalog_cache ADD COLUMN IF NOT EXISTS scraped_original_price DECIMAL(10, 2)`,
    `ALTER TABLE shopify_catalog_cache ADD COLUMN IF NOT EXISTS scrape_confidence DECIMAL(3, 2)`,
    `ALTER TABLE shopify_catalog_cache ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE`,
    `CREATE INDEX IF NOT EXISTS idx_shopify_catalog_last_scraped ON shopify_catalog_cache(last_scraped_at)`
  ];

  for (const sql of statements) {
    console.log(`Executing: ${sql.substring(0, 60)}...`);

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ sql_query: sql })
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`  ⚠️  Response: ${text}`);
    } else {
      console.log('  ✅ Success');
    }
  }

  // Verify columns exist by querying
  console.log('\n🔍 Verifying columns...');
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('id, scraped_sale_price, scraped_original_price, scrape_confidence, last_scraped_at')
    .limit(1);

  if (error) {
    console.error('❌ Verification failed:', error.message);
    console.log('\n📋 Please run this SQL manually in Supabase Dashboard:');
    console.log('```sql');
    console.log(statements.join(';\n') + ';');
    console.log('```');
    process.exit(1);
  }

  console.log('✅ Migration completed successfully!');
  console.log('📊 Columns verified:', Object.keys(data[0] || {}));
}

runMigration();
