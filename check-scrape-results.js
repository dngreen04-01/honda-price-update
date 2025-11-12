import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkResults() {
  console.log('🔍 Checking scrape results...\n');

  // Check total products
  const { count: totalCount } = await supabase
    .from('shopify_catalog_cache')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Total products in shopify_catalog_cache: ${totalCount}`);

  // Check products with scraped prices
  const { count: scrapedCount } = await supabase
    .from('shopify_catalog_cache')
    .select('*', { count: 'exact', head: true })
    .not('scraped_sale_price', 'is', null);

  console.log(`✅ Products with scraped prices: ${scrapedCount}`);
  console.log(`❌ Products without scraped prices: ${totalCount - scrapedCount}\n`);

  // Check specific SKU
  const { data: skuData, error: skuError } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .eq('variant_sku', '0sv05hl4300');

  if (skuError) {
    console.error('Error searching for SKU:', skuError);
  } else if (skuData && skuData.length > 0) {
    console.log('✅ SKU 0sv05hl4300 found in database:');
    console.log(JSON.stringify(skuData[0], null, 2));
  } else {
    console.log('❌ SKU 0sv05hl4300 NOT FOUND in database\n');

    // Search by partial SKU
    const { data: partialData } = await supabase
      .from('shopify_catalog_cache')
      .select('variant_sku, product_title, scraped_sale_price')
      .ilike('variant_sku', '%0sv05hl4%');

    if (partialData && partialData.length > 0) {
      console.log('Similar SKUs found:');
      console.log(partialData);
    }
  }

  // Show sample of scraped products
  console.log('\n📋 Sample of recently scraped products:');
  const { data: samples } = await supabase
    .from('shopify_catalog_cache')
    .select('variant_sku, product_title, scraped_sale_price, last_scraped_at')
    .not('scraped_sale_price', 'is', null)
    .order('last_scraped_at', { ascending: false })
    .limit(10);

  samples?.forEach(p => {
    console.log(`  ${p.variant_sku} - $${p.scraped_sale_price} - ${p.product_title.substring(0, 50)}`);
  });

  // Check if there are products with source_url_canonical but no scraped price
  console.log('\n🔍 Products with URLs but no scraped price:');
  const { data: unscraped } = await supabase
    .from('shopify_catalog_cache')
    .select('variant_sku, product_title, source_url_canonical')
    .not('source_url_canonical', 'is', null)
    .is('scraped_sale_price', null)
    .limit(5);

  unscraped?.forEach(p => {
    console.log(`  ${p.variant_sku} - ${p.source_url_canonical}`);
  });
}

checkResults();
