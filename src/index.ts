#!/usr/bin/env node

import { scraperOrchestrator } from './scraper/scraper-orchestrator.js';
import { syncPricesToShopify, refreshShopifyCatalogCache } from './shopify/price-sync.js';
import { reconciliationEngine } from './utils/reconciliation.js';
import { generateDigestData, generateAttachments } from './email/digest-generator.js';
import { sendgridClient } from './email/sendgrid-client.js';
import { logger } from './utils/logger.js';
import { getAllProductPages } from './database/queries.js';

/**
 * Main nightly job orchestration
 */
async function runNightlyJob(): Promise<void> {
  const startTime = Date.now();
  logger.info('=== Nightly scrape job started ===');

  try {
    // Step 1: Run full scrape (discover + crawl + extract + store)
    logger.info('Step 1: Running full scrape');
    const scrapeStats = await scraperOrchestrator.runFullScrape();

    // Step 2: Refresh Shopify catalog cache
    logger.info('Step 2: Refreshing Shopify catalog cache');
    await refreshShopifyCatalogCache();

    // Step 3: Sync prices to Shopify
    logger.info('Step 3: Syncing prices to Shopify');
    const allProducts = await getAllProductPages();
    const productUrls = allProducts.map(p => p.canonical_url);
    const syncResult = await syncPricesToShopify(productUrls);

    // Step 4: Run reconciliation
    logger.info('Step 4: Running reconciliation');
    const reconcileResult = await reconciliationEngine.reconcile();

    // Step 5: Generate email digest data
    logger.info('Step 5: Generating email digest');
    const digestData = await generateDigestData(
      reconcileResult.supplierOnly,
      reconcileResult.shopifyOnly,
      {
        totalProductsScraped: scrapeStats.totalProducts,
        successfulExtractions: scrapeStats.successfulExtractions,
        shopifySynced: syncResult.synced,
        emailsSent: 0, // Will be updated after sending
      }
    );

    // Step 6: Generate CSV attachments
    logger.info('Step 6: Generating CSV attachments');
    const attachments = generateAttachments(digestData);

    // Step 7: Send email digest
    logger.info('Step 7: Sending email digest');
    const emailSent = await sendgridClient.sendNightlyDigest(digestData, attachments);

    // Update email sent count
    digestData.stats.emailsSent = emailSent ? 1 : 0;

    // Final summary
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    logger.info('=== Nightly scrape job completed ===', {
      duration: `${duration} minutes`,
      stats: {
        productsScraped: scrapeStats.totalProducts,
        successfulExtractions: scrapeStats.successfulExtractions,
        offersFound: scrapeStats.offersFound,
        pricesSynced: syncResult.synced,
        supplierOnly: reconcileResult.supplierOnly.length,
        shopifyOnly: reconcileResult.shopifyOnly.length,
        emailSent,
      },
    });

    // Acceptance criteria validation
    const discoveryRate = (scrapeStats.successfulExtractions / scrapeStats.totalProducts) * 100;
    const extractionSuccessRate = (scrapeStats.successfulExtractions / scrapeStats.totalProducts) * 100;

    logger.info('Acceptance criteria validation', {
      discoveryRate: `${discoveryRate.toFixed(2)}% (target: ≥90%)`,
      extractionSuccessRate: `${extractionSuccessRate.toFixed(2)}% (target: ≥98% deterministic)`,
      shopifySyncAccuracy: `${syncResult.synced}/${syncResult.synced + syncResult.failed} (target: 100%)`,
      emailDelivery: emailSent ? '2xx (success)' : 'failed',
    });

    if (discoveryRate < 90) {
      logger.warn('⚠️  Discovery rate below target (90%)');
    }

    if (extractionSuccessRate < 98) {
      logger.warn('⚠️  Extraction success rate below target (98%)');
    }

    if (syncResult.failed > 0) {
      logger.warn('⚠️  Some Shopify syncs failed');
    }

    if (!emailSent) {
      logger.error('⚠️  Email delivery failed');
    }
  } catch (error) {
    logger.error('Nightly job failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Send alert email
    try {
      await sendgridClient.sendAlertEmail(
        'Nightly Scrape Job Failed',
        `The nightly scrape job failed with error: ${error instanceof Error ? error.message : String(error)}`
      );
    } catch (emailError) {
      logger.error('Failed to send alert email', {
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    process.exit(1);
  }
}

// Run if called directly
// Check if this is the main module (works with both node and tsx)
const isMainModule = process.argv[1]?.includes('index.ts') || process.argv[1]?.includes('index.js');

if (isMainModule) {
  runNightlyJob()
    .then(() => {
      logger.info('Job completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Job failed', { error: error.message });
      process.exit(1);
    });
}

export { runNightlyJob };
