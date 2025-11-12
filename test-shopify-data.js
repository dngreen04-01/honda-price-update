import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkShopifyData() {
  console.log('Checking shopify_catalog_cache table...\n');

  try {
    // Get count of records
    const { count, error: countError } = await supabase
      .from('shopify_catalog_cache')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting records:', countError);
      return;
    }

    console.log(`Total records in shopify_catalog_cache: ${count}`);

    // Get first 5 records
    const { data, error } = await supabase
      .from('shopify_catalog_cache')
      .select('*')
      .limit(5);

    if (error) {
      console.error('Error fetching records:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log('\nSample records:');
      data.forEach((record, i) => {
        console.log(`\n${i + 1}. Product ID: ${record.shopify_product_id}`);
        console.log(`   Variant ID: ${record.shopify_variant_id}`);
        console.log(`   Source URL: ${record.source_url_canonical}`);
        console.log(`   Shopify Price: $${record.shopify_price}`);
        console.log(`   Compare At Price: ${record.shopify_compare_at_price ? '$' + record.shopify_compare_at_price : 'N/A'}`);
        console.log(`   Last Synced: ${record.last_synced_at}`);
      });
    } else {
      console.log('\n❌ No records found in shopify_catalog_cache');
      console.log('\nTo populate this table:');
      console.log('1. Ensure your Shopify products have the source_url metafield set');
      console.log('2. Run: npm run shopify:refresh');
    }

    // Also check product_pages table
    const { count: productCount } = await supabase
      .from('product_pages')
      .select('*', { count: 'exact', head: true });

    console.log(`\n\nTotal product_pages: ${productCount}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkShopifyData().then(() => process.exit(0));
