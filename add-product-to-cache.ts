import { createClient } from '@supabase/supabase-js';
import { ShopifyClient } from './src/shopify/client.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const shopifyClient = new ShopifyClient();
const PRODUCT_URL = 'https://hondaoutdoors.co.nz/umk450-bull-handle';

(async () => {
  try {
    console.log('Fetching product from Shopify...');
    const product = await shopifyClient.getProductBySourceUrl(PRODUCT_URL);

    if (!product) {
      console.error('Product not found in Shopify');
      process.exit(1);
    }

    console.log('Product found:', product.title);

    // Get the first variant
    const variant = product.variants.edges[0]?.node;
    if (!variant) {
      console.error('No variants found');
      process.exit(1);
    }

    console.log('Variant:', variant.title, '- SKU:', variant.sku);

    // Check if already exists
    const { data: existing } = await supabase
      .from('shopify_catalog_cache')
      .select('id')
      .eq('source_url_canonical', PRODUCT_URL)
      .maybeSingle();

    let error = null;

    if (existing) {
      console.log('Product already exists, updating...');
      const result = await supabase
        .from('shopify_catalog_cache')
        .update({
          shopify_product_id: product.id,
          shopify_variant_id: variant.id,
          product_title: product.title,
          variant_title: variant.title,
          variant_sku: variant.sku,
          shopify_price: parseFloat(variant.price),
          shopify_compare_at_price: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      error = result.error;
    } else {
      console.log('Inserting new product...');
      const result = await supabase
        .from('shopify_catalog_cache')
        .insert({
          source_url_canonical: PRODUCT_URL,
          shopify_product_id: product.id,
          shopify_variant_id: variant.id,
          product_title: product.title,
          variant_title: variant.title,
          variant_sku: variant.sku,
          shopify_price: parseFloat(variant.price),
          shopify_compare_at_price: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
          last_synced_at: new Date().toISOString(),
        });
      error = result.error;
    }

    if (error) {
      console.error('Database error:', error);
      process.exit(1);
    }

    console.log('\n✓ Successfully added product to database!');
    console.log('\nYou can now search for:');
    console.log('  - SKU: UMK450TU3UT');
    console.log('  - URL: https://hondaoutdoors.co.nz/umk450-bull-handle');
    console.log('  - Title: Honda UMK450 Bull Handle Brush Cutter');

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
