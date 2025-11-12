#!/usr/bin/env node

import { refreshShopifyCatalogCache } from '../shopify/price-sync.js';
import { logger } from '../utils/logger.js';

/**
 * Script to refresh the Shopify catalog cache
 * This fetches all products from Shopify with source_url metafield
 * and updates the shopify_catalog_cache table
 */
async function refreshCache(): Promise<void> {
  logger.info('=== Refreshing Shopify Catalog Cache ===\n');

  try {
    logger.info('Fetching products from Shopify...');
    const cached = await refreshShopifyCatalogCache();

    logger.info(`\n✅ Successfully cached ${cached} products`);
    logger.info('\nThe frontend Price Comparison table will now show Shopify prices');
    logger.info('Visit: http://localhost:5173/dashboard/price-comparison');
  } catch (error) {
    logger.error('❌ Failed to refresh cache:', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.message.includes('401')) {
      logger.error('\n🔑 Authentication Error:');
      logger.error('   Your Shopify access token may be invalid or expired.');
      logger.error('   Run: npm run verify:shopify');
    }

    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshCache().catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });
}

export { refreshCache };
