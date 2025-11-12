import { supabase } from './src/database/client.js';
import { shopifyClient } from './src/shopify/client.js';
import { canonicalizeUrl } from './src/utils/canonicalize.js';
import { ShopifyPriceUpdate } from './src/types/index.js';

async function testSyncDetailed() {
  const url = 'https://hondaoutdoors.co.nz/4ah-battery-charger-combo';
  const canonicalUrl = canonicalizeUrl(url);

  console.log('\n=== Detailed Sync Flow ===');

  // Step 1: Get cache
  const { data: cacheDataArray, error: cacheError } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .eq('source_url_canonical', canonicalUrl)
    .order('variant_sku', { ascending: false, nullsFirst: false });

  if (cacheError || !cacheDataArray || cacheDataArray.length === 0) {
    console.log('❌ Not found in cache');
    return;
  }

  const cacheData = cacheDataArray[0];
  console.log('\n✅ Cache Data (first match):');
  console.log('  SKU:', cacheData.variant_sku);
  console.log('  Shopify Price:', cacheData.shopify_price);
  console.log('  Shopify Compare At:', cacheData.shopify_compare_at_price);
  console.log('  Scraped Sale Price:', cacheData.scraped_sale_price);
  console.log('  Scraped Original Price:', cacheData.scraped_original_price);

  // Step 2: Get prices
  let salePrice = cacheData.scraped_sale_price;
  let originalPrice = cacheData.scraped_original_price;

  console.log('\n✅ Prices to use:');
  console.log('  Sale Price:', salePrice);
  console.log('  Original Price:', originalPrice);

  // Step 3: Check IDs
  console.log('\n✅ Shopify IDs:');
  console.log('  Product ID:', cacheData.shopify_product_id);
  console.log('  Variant ID:', cacheData.shopify_variant_id);

  // Step 4: Comparison
  const currentPrice = cacheData.shopify_price;
  const currentCompareAt = cacheData.shopify_compare_at_price;

  const hasActiveSale = originalPrice !== null && originalPrice > salePrice;
  const targetCompareAt = hasActiveSale ? originalPrice : null;

  console.log('\n=== Comparison ===');
  console.log('Current Price:', currentPrice);
  console.log('Current Compare At:', currentCompareAt);
  console.log('Has Active Sale:', hasActiveSale);
  console.log('Target Compare At:', targetCompareAt);

  const needsUpdate =
    currentPrice !== salePrice ||
    currentCompareAt !== targetCompareAt;

  console.log('\nNeeds Update:', needsUpdate);
  console.log('  Price match:', currentPrice === salePrice, `(${currentPrice} === ${salePrice})`);
  console.log('  Compare At match:', currentCompareAt === targetCompareAt, `(${currentCompareAt} === ${targetCompareAt})`);

  if (needsUpdate) {
    console.log('\n✅ Would create update:');
    const update: ShopifyPriceUpdate = {
      productId: cacheData.shopify_product_id,
      variantId: cacheData.shopify_variant_id,
      price: salePrice.toFixed(2),
      compareAtPrice: hasActiveSale ? originalPrice.toFixed(2) : null,
    };
    console.log(JSON.stringify(update, null, 2));
  } else {
    console.log('\n⚠️  No update needed');
  }
}

testSyncDetailed()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
