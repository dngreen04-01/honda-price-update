#!/usr/bin/env node

import { scraperOrchestrator } from './scraper/scraper-orchestrator.js';
import { refreshShopifyCatalogCache } from './shopify/price-sync.js';
import { reconciliationEngine } from './utils/reconciliation.js';
import { generateDigestData, generateAttachments } from './email/digest-generator.js';
import { sendgridClient } from './email/sendgrid-client.js';
import { logger } from './utils/logger.js';

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

    // Step 3: Price sync is now manual (via dashboard)
    logger.info('Step 3: Skipping automatic price sync (manual approval required via dashboard)');
    const syncResult = { synced: 0, skipped: 0, failed: 0 };

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
        failedExtractions: scrapeStats.failedExtractions,
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

/**
 * Start scheduler mode (keeps server running)
 */
async function startScheduler(): Promise<void> {
  logger.info('Starting in scheduler mode');

  // Parse command line arguments for schedule customization
  const args = process.argv.slice(2);
  const scheduleArg = args.find(arg => arg.startsWith('--schedule='));
  const runOnStart = args.includes('--run-now');

  // Dynamically import scheduler (ES modules)
  const { JobScheduler } = await import('./scheduler/scheduler.js');
  const customScheduler = new JobScheduler({
    schedule: scheduleArg ? scheduleArg.split('=')[1] : '0 2 * * 0', // Default: 2 AM every Sunday (weekly)
    runOnStart,
    enabled: true,
    checkMissedRuns: true, // Check for missed runs on startup
    scheduleIntervalHours: 168, // 168 hours = 1 week
  });

  // Start the scheduler (now async to check for missed runs)
  await customScheduler.start();

  logger.info('Scheduler mode started', {
    schedule: customScheduler.getConfig().schedule,
    nextRun: customScheduler.getNextRun(),
  });

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    customScheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    customScheduler.stop();
    process.exit(0);
  });
}

// Run if called directly
// Check if this is the main module (works with both node and tsx)
const isMainModule = process.argv[1]?.includes('index.ts') || process.argv[1]?.includes('index.js');

if (isMainModule) {
  const args = process.argv.slice(2);
  const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'once';

  if (mode === 'scheduler') {
    // Scheduler mode: keeps running and executes jobs on schedule
    startScheduler();
  } else {
    // Once mode: run job immediately and exit
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
}

export { runNightlyJob };
