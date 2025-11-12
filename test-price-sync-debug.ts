import { syncPricesToShopify } from './src/shopify/price-sync.js';
import { logger } from './src/utils/logger.js';

async function testPriceSync() {
  // The URL that should be sent from the frontend
  const url = 'https://hondaoutdoors.co.nz/4ah-battery-charger-combo';

  console.log('\n=== Testing Price Sync ===');
  console.log('URL:', url);
  console.log('\n');

  try {
    const result = await syncPricesToShopify([url]);

    console.log('\n=== Result ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testPriceSync()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
