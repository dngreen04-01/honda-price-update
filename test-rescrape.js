// Quick test script for re-scrape functionality
import { handleRescrape } from './dist/api/rescrape-api.js';

const testUrl = 'https://www.hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit';

console.log(`Testing re-scrape for: ${testUrl}\n`);

try {
  const result = await handleRescrape({ url: testUrl });

  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.success && result.data) {
    console.log(`\nOld Price: $${result.data.oldPrice?.toFixed(2) || 'N/A'}`);
    console.log(`New Price: $${result.data.newPrice?.toFixed(2) || 'N/A'}`);
    console.log(`Changed: ${result.data.priceChanged ? 'YES' : 'NO'}`);
  }
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}

process.exit(0);
