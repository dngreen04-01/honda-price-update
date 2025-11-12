import { supabase } from './src/database/client.js';
import { shopifyClient } from './src/shopify/client.js';
import { canonicalizeUrl } from './src/utils/canonicalize.js';

async function testDetailedSync() {
  const url = 'https://hondaoutdoors.co.nz/4ah-battery-charger-combo';
  const canonicalUrl = canonicalizeUrl(url);

  console.log('\n=== Detailed Sync Test ===');
  console.log('URL:', url);
  console.log('Canonical:', canonicalUrl);

  // Step 1: Get cache data
  const { data: cacheData, error: cacheError } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .eq('source_url_canonical', canonicalUrl)
    .single();

  if (cacheError || !cacheData) {
    console.log('\n❌ Not found in cache');
    return;
  }

  console.log('\n✅ Cache Data:');
  console.log('  SKU:', cacheData.variant_sku);
  console.log('  Shopify Price:', cacheData.shopify_price);
  console.log('  Shopify Compare At:', cacheData.shopify_compare_at_price);
  console.log('  Scraped Sale Price:', cacheData.scraped_sale_price);
  console.log('  Scraped Original Price:', cacheData.scraped_original_price);

  const salePrice = cacheData.scraped_sale_price;
  const originalPrice = cacheData.scraped_original_price;

  // Step 2: Get Shopify product
  console.log('\n=== Fetching from Shopify ===');
  const shopifyProduct = await shopifyClient.getProductBySourceUrl(canonicalUrl);

  if (!shopifyProduct) {
    console.log('❌ Not found in Shopify by source_url');
    return;
  }

  console.log('✅ Shopify Product:', shopifyProduct.id);
  console.log('   Title:', shopifyProduct.title);

  const variant = shopifyProduct.variants?.edges[0]?.node;
  if (!variant) {
    console.log('❌ No variants');
    return;
  }

  console.log('\n✅ Variant:', variant.id);
  console.log('   SKU:', (variant as any).sku);
  console.log('   Current Price:', variant.price);
  console.log('   Current Compare At:', variant.compareAtPrice);

  // Step 3: Calculate updates
  console.log('\n=== Update Calculation ===');
  const currentPrice = parseFloat(variant.price);
  const currentCompareAt = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;

  const hasActiveSale = originalPrice !== null && originalPrice > salePrice;
  const targetCompareAt = hasActiveSale ? originalPrice : null;

  console.log('Has Active Sale:', hasActiveSale);
  console.log('  Sale Price:', salePrice);
  console.log('  Original Price:', originalPrice);
  console.log('  Target Compare At:', targetCompareAt);

  const needsUpdate =
    currentPrice !== salePrice ||
    currentCompareAt !== targetCompareAt;

  console.log('\nNeeds Update:', needsUpdate);
  console.log('  Price Match:', currentPrice === salePrice, `(${currentPrice} === ${salePrice})`);
  console.log('  Compare At Match:', currentCompareAt === targetCompareAt, `(${currentCompareAt} === ${targetCompareAt})`);

  if (needsUpdate) {
    console.log('\n✅ Would update to:');
    console.log('  Price:', salePrice.toFixed(2));
    console.log('  Compare At:', hasActiveSale ? originalPrice.toFixed(2) : null);
  } else {
    console.log('\n⚠️  Skipping - prices already match');
  }
}

testDetailedSync()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
