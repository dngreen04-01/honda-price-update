import { shopifyClient } from './src/shopify/client.js';
import { ShopifyPriceUpdate } from './src/types/index.js';

async function forcePriceUpdate() {
  const update: ShopifyPriceUpdate = {
    productId: 'gid://shopify/Product/8962441511161',
    variantId: 'gid://shopify/ProductVariant/46893115408633',
    price: '200.00',
    compareAtPrice: '398.00',
  };

  console.log('\n=== Force Price Update ===');
  console.log('Update:', JSON.stringify(update, null, 2));

  const result = await shopifyClient.updateVariantPrices([update]);

  console.log('\n=== Result ===');
  console.log('Success:', result.success);
  console.log('Failed:', result.failed);
  console.log('Errors:', result.errors);
}

forcePriceUpdate()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
