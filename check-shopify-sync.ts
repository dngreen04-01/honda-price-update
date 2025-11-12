import { ShopifyClient } from './src/shopify/client.js';
import { createClient } from '@supabase/supabase-js';

const shopifyClient = new ShopifyClient();
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

(async () => {
  try {
    // Get all products from Shopify with source_url
    console.log('Fetching all products from Shopify...');
    const productMap = await shopifyClient.getAllProductsWithSourceUrl();

    let totalVariants = 0;
    let foundProduct: any = null;
    const products = Array.from(productMap.values());

    for (const product of products) {
      totalVariants += product.variants.edges.length;

      // Look for the specific SKU
      for (const variantEdge of product.variants.edges) {
        if (variantEdge.node.sku === 'UMK450TU3UT') {
          foundProduct = {
            product: product.title,
            variant: variantEdge.node.title,
            sku: variantEdge.node.sku,
            price: variantEdge.node.price,
            productId: product.id,
            variantId: variantEdge.node.id
          };
          break;
        }
      }
    }

    console.log('Total products in Shopify (with source_url):', products.length);
    console.log('Total variants in Shopify (with source_url):', totalVariants);

    // Get database count
    const { count: dbCount } = await supabase
      .from('shopify_catalog_cache')
      .select('*', { count: 'exact', head: true });

    console.log('Total variants in database:', dbCount);
    console.log('Missing variants:', totalVariants - (dbCount || 0));

    if (foundProduct) {
      console.log('\nFound UMK450TU3UT in Shopify:');
      console.log(JSON.stringify(foundProduct, null, 2));
    } else {
      console.log('\nUMK450TU3UT NOT found in Shopify');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
})();
