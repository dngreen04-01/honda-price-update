import { shopifyClient } from './src/shopify/client.js';

async function debugShopifyLookup() {
  const url = 'https://hondaoutdoors.co.nz/4ah-battery-charger-combo';

  console.log('\n=== Shopify Lookup Debug ===');
  console.log('Searching for:', url);

  const product = await shopifyClient.getProductBySourceUrl(url);

  if (!product) {
    console.log('\n❌ Product not found');
    return;
  }

  console.log('\n✅ Found Product:');
  console.log('  ID:', product.id);
  console.log('  Title:', product.title);

  const variant = product.variants?.edges[0]?.node;
  if (variant) {
    console.log('\n✅ First Variant:');
    console.log('  ID:', variant.id);
    console.log('  SKU:', (variant as any).sku);
    console.log('  Price:', variant.price);
    console.log('  Compare At:', variant.compareAtPrice);
  }

  console.log('\n=== Metafields ===');
  const metafields = product.metafields?.edges || [];
  for (const edge of metafields) {
    const mf = edge.node;
    console.log(`  ${mf.namespace}.${mf.key}: ${mf.value}`);
  }
}

debugShopifyLookup()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
