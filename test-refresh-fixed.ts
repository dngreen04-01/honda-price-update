import { refreshShopifyCatalogCache } from './src/shopify/price-sync.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

(async () => {
  try {
    console.log('Testing refresh with fixed metafield limit...\n');

    // Get count before
    const { count: before } = await supabase
      .from('shopify_catalog_cache')
      .select('*', { count: 'exact', head: true });

    console.log('Products in database BEFORE:', before);

    // Run refresh
    console.log('\nRunning refresh...');
    const cached = await refreshShopifyCatalogCache();

    console.log('\n✓ Refresh completed');
    console.log('Products cached:', cached);

    // Get count after
    const { count: after } = await supabase
      .from('shopify_catalog_cache')
      .select('*', { count: 'exact', head: true });

    console.log('Products in database AFTER:', after);
    console.log('New products added:', (after || 0) - (before || 0));

    // Test specific SKUs
    console.log('\nTesting specific SKUs:');

    const testSkus = ['HF2417', 'UMK450TU3UT'];

    for (const sku of testSkus) {
      const { data } = await supabase
        .from('shopify_catalog_cache')
        .select('product_title, variant_sku, shopify_price')
        .eq('variant_sku', sku)
        .maybeSingle();

      if (data) {
        console.log(`  ✓ ${sku}: ${data.product_title} - $${data.shopify_price}`);
      } else {
        console.log(`  ✗ ${sku}: NOT FOUND`);
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
