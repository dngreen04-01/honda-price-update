import dotenv from 'dotenv';
import { scraperOrchestrator } from './src/scraper/scraper-orchestrator.js';
import { getShopifyCatalogCache } from './src/database/queries.js';
import { logger } from './src/utils/logger.js';

// Load environment variables from .env file
dotenv.config();

async function testStreamingScrape() {
  console.log('🧪 Testing streaming scraper (memory-efficient batch processing)...\n');

  try {
    // Get products with source URLs
    const allProducts = await getShopifyCatalogCache();
    const productsWithUrls = allProducts.filter(p => p.source_url_canonical);

    console.log(`📊 Total products in catalog: ${allProducts.length}`);
    console.log(`📊 Products with source URLs: ${productsWithUrls.length}\n`);

    if (productsWithUrls.length === 0) {
      console.error('❌ No products with source URLs found');
      console.log('   Make sure Shopify products have custom.source_url metafield populated');
      process.exit(1);
    }

    // Configuration
    const batchSize = 25;
    const concurrency = 2;
    const totalBatches = Math.ceil(productsWithUrls.length / batchSize);

    console.log('🔧 Configuration:');
    console.log(`   Batch size: ${batchSize} URLs per batch`);
    console.log(`   Concurrency: ${concurrency} parallel requests`);
    console.log(`   Total batches: ${totalBatches}`);
    console.log('');

    console.log('🚀 Starting streaming scrape with Scrapling...\n');
    console.log('─'.repeat(60));

    const startTime = Date.now();

    // Run streaming scraper with progress callback
    const result = await scraperOrchestrator.runFullScrapeStreaming({
      concurrency,
      batchSize,
      onBatchComplete: (batch, total, stats) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const progress = ((batch / total) * 100).toFixed(1);
        console.log(
          `   📦 Batch ${batch}/${total} stored ` +
          `(${stats.success} success, ${stats.failed} failed) ` +
          `[${progress}% complete, ${elapsed}s elapsed]`
        );
      },
    });

    console.log('─'.repeat(60));
    console.log('');

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const successRate = result.totalProducts > 0
      ? ((result.successfulExtractions / result.totalProducts) * 100).toFixed(1)
      : '0.0';

    console.log('✅ Streaming scrape completed!');
    console.log('');
    console.log('📈 Results:');
    console.log(`   Total products: ${result.totalProducts}`);
    console.log(`   Successful: ${result.successfulExtractions}`);
    console.log(`   Failed: ${result.failedExtractions}`);
    console.log(`   Success rate: ${successRate}%`);
    console.log(`   Batches processed: ${result.batchesProcessed}`);
    console.log(`   Total time: ${totalTime}s`);
    console.log('');

    if (result.successfulExtractions > 0) {
      console.log('✅ Scraper is working correctly!');
      console.log('   Database has been updated with scraped prices.\n');
    } else {
      console.error('❌ No successful extractions');
      console.log('   Check logs above for errors');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
    logger.error('Test scrape error', { error });
    process.exit(1);
  }
}

testStreamingScrape();
