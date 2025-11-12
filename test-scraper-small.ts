import dotenv from 'dotenv';
import { scraperOrchestrator } from './src/scraper/scraper-orchestrator.js';
import { getShopifyCatalogCache } from './src/database/queries.js';
import { logger } from './src/utils/logger.js';

// Load environment variables from .env file
dotenv.config();

async function testSmallScrape() {
  console.log('🧪 Testing simplified scraper with small subset...\n');

  try {
    // Get first 5 products with source URLs
    const allProducts = await getShopifyCatalogCache();
    const productsWithUrls = allProducts.filter(p => p.source_url_canonical);

    console.log(`📊 Total products in catalog: ${allProducts.length}`);
    console.log(`📊 Products with source URLs: ${productsWithUrls.length}\n`);

    if (productsWithUrls.length === 0) {
      console.error('❌ No products with source URLs found');
      console.log('   Make sure Shopify products have custom.source_url metafield populated');
      process.exit(1);
    }

    // Test with first 3 products
    const testUrls = productsWithUrls.slice(0, 3).map(p => p.source_url_canonical);

    console.log('🎯 Testing with 3 URLs:');
    testUrls.forEach((url, i) => {
      console.log(`   ${i + 1}. ${url}`);
    });
    console.log('');

    // Run scraper
    console.log('🚀 Starting scrape with Bright Data...\n');

    const result = await scraperOrchestrator.runFullScrape({ concurrency: 2 });

    console.log('\n✅ Test scrape completed!');
    console.log(`   Total products: ${result.totalProducts}`);
    console.log(`   Successful: ${result.successfulExtractions}`);
    console.log(`   Failed: ${result.failedExtractions}`);
    console.log(`   Success rate: ${((result.successfulExtractions / result.totalProducts) * 100).toFixed(1)}%\n`);

    if (result.successfulExtractions > 0) {
      console.log('✅ Scraper is working correctly!');
      console.log('   You can now run the full scrape: npm run scrape\n');
    } else {
      console.error('❌ No successful extractions');
      console.log('   Check logs above for errors');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logger.error('Test scrape error', { error });
    process.exit(1);
  }
}

testSmallScrape();
