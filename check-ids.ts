import { supabase } from './src/database/client.js';

async function checkIds() {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('shopify_product_id, shopify_variant_id, variant_sku, product_title')
    .eq('variant_sku', '4AH-BATTERY-CHARGER-COMBO');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nCache entries for SKU 4AH-BATTERY-CHARGER-COMBO:');
  console.log(JSON.stringify(data, null, 2));
}

checkIds()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
