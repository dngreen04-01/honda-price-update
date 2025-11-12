/**
 * Test bulk scrape API endpoint
 *
 * Prerequisites:
 * 1. Start the API server: npm run dev:api
 * 2. Run this test: node test-bulk-scrape-api.js
 */

const API_URL = 'http://localhost:3000';

async function testBulkScrapeAPI() {
  console.log('=== Testing Bulk Scrape API ===\n');

  try {
    // Test with limit of 2 products
    console.log('Sending request to POST /api/bulk-scrape...');
    console.log('Request body: { concurrency: 3, limit: 2 }\n');

    const response = await fetch(`${API_URL}/api/bulk-scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        concurrency: 3,
        limit: 2,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    console.log('=== Response ===\n');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Bulk scrape API test PASSED');
      console.log(`\nScraped ${result.data.successfulExtractions} of ${result.data.totalScraped} products successfully`);
    } else {
      console.log('\n❌ Bulk scrape API test FAILED');
      console.log(`Error: ${result.message}`);
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('\nMake sure the API server is running:');
    console.error('  npm run dev:api');
  }
}

testBulkScrapeAPI();
