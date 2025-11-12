import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function verifyMigration() {
  console.log('🔍 Verifying migration...\n');

  try {
    // Try to query the new columns
    const { data, error } = await supabase
      .from('shopify_catalog_cache')
      .select('id, scraped_sale_price, scraped_original_price, scrape_confidence, last_scraped_at')
      .limit(1);

    if (error) {
      console.error('❌ Migration NOT complete:', error.message);
      console.log('\n📋 Please run the migration SQL in Supabase Dashboard.');
      console.log('See MIGRATION_INSTRUCTIONS.md for details.\n');
      process.exit(1);
    }

    console.log('✅ Migration verified successfully!\n');
    console.log('📊 New columns detected:');
    console.log('   - scraped_sale_price');
    console.log('   - scraped_original_price');
    console.log('   - scrape_confidence');
    console.log('   - last_scraped_at\n');

    // Check how many products have source URLs
    const { count, error: countError } = await supabase
      .from('shopify_catalog_cache')
      .select('*', { count: 'exact', head: true })
      .not('source_url_canonical', 'is', null);

    if (!countError) {
      console.log(`📈 Products with source URLs: ${count}`);
      console.log(`   Ready to scrape: ${count} URLs\n`);
    }

    console.log('✅ Ready to test scraper!');
    console.log('   Run: npm run scrape:test\n');

  } catch (err) {
    console.error('❌ Verification error:', err.message);
    process.exit(1);
  }
}

verifyMigration();
