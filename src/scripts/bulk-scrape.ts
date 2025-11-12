#!/usr/bin/env node

import { handleBulkScrape } from '../api/bulk-scrape-api.js';
import { logger } from '../utils/logger.js';

/**
 * CLI command to bulk scrape all products without supplier prices
 *
 * Usage:
 *   npm run bulk-scrape                    # Scrape all eligible products
 *   npm run bulk-scrape -- --limit 10      # Scrape only first 10 products
 *   npm run bulk-scrape -- --concurrency 5 # Use 5 concurrent scrapers
 */

async function main() {
  console.log('=== Bulk Scrape - Products Without Supplier Prices ===\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const concurrency = parseInt(args.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || '3');
  const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];

  console.log('Configuration:');
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Limit: ${limit || 'none (scrape all)'}`);
  console.log('');

  try {
    const result = await handleBulkScrape({
      concurrency,
      limit: limit ? parseInt(limit) : undefined,
    });

    console.log('\n=== Results ===\n');
    console.log(result.message);

    if (result.data) {
      console.log('');
      console.log('Statistics:');
      console.log(`  Total eligible products: ${result.data.totalEligible}`);
      console.log(`  Products scraped: ${result.data.totalScraped}`);
      console.log(`  Successful extractions: ${result.data.successfulExtractions}`);
      console.log(`  Failed extractions: ${result.data.failedExtractions}`);
      console.log(`  Success rate: ${((result.data.successfulExtractions / result.data.totalScraped) * 100).toFixed(1)}%`);
      console.log(`  Duration: ${result.data.duration.toFixed(2)}s`);
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Bulk scrape failed:', error);
    logger.error('Bulk scrape failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
