import { supabase } from './src/database/client.js';

async function checkCacheUrls() {
  // Check for battery charger products
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('source_url_canonical, variant_sku, product_title')
    .or('variant_sku.eq.4AH-BATTERY-CHARGER-COMBO,source_url_canonical.ilike.%battery-charger%')
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nFound products:');
  console.log(JSON.stringify(data, null, 2));
}

checkCacheUrls()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
