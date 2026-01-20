/**
 * Nightly Scraper Job
 * Scheduled job that scrapes prices from all supplier product pages daily
 *
 * Schedule: Every day at 2 AM NZ time (Pacific/Auckland timezone)
 *
 * This job:
 * 1. Runs full price scrape of all products with source URLs
 * 2. Refreshes Shopify catalog cache
 * 3. Generates and sends email digest
 */

import * as cron from 'node-cron';
import { scraperOrchestrator } from '../scraper/scraper-orchestrator.js';
import { refreshShopifyCatalogCache } from '../shopify/price-sync.js';
import { generateDigestData, generateAttachments } from '../email/digest-generator.js';
import { sendgridClient } from '../email/sendgrid-client.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration for the nightly scraper
 */
const NIGHTLY_SCRAPER_CONFIG = {
  /** Cron expression: Every day at 2 AM */
  schedule: '0 2 * * *',
  /** Timezone for the schedule */
  timezone: 'Pacific/Auckland',
  /** Human-readable description */
  description: 'Nightly price scrape (daily at 2 AM NZ time)',
};

/**
 * Result of a nightly scrape execution
 */
export interface NightlyScrapeResult {
  /** Whether the scrape completed successfully */
  success: boolean;
  /** Total products scraped */
  totalProducts: number;
  /** Successful price extractions */
  successfulExtractions: number;
  /** Failed extractions */
  failedExtractions: number;
  /** Whether email was sent */
  emailSent: boolean;
  /** Duration of the scrape in milliseconds */
  durationMs: number;
  /** Error message if scrape failed */
  error?: string;
}

/**
 * Nightly Scraper Job Manager
 * Handles scheduling and execution of the nightly price scrape
 */
export class NightlyScraperJob {
  private task: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private lastRunResult: NightlyScrapeResult | null = null;

  /**
   * Start the nightly scraper schedule
   */
  async start(): Promise<void> {
    if (this.task) {
      logger.warn('Nightly scraper job is already scheduled');
      return;
    }

    // Validate cron expression
    if (!cron.validate(NIGHTLY_SCRAPER_CONFIG.schedule)) {
      throw new Error(`Invalid cron expression: ${NIGHTLY_SCRAPER_CONFIG.schedule}`);
    }

    // Schedule the nightly scrape
    this.task = cron.schedule(
      NIGHTLY_SCRAPER_CONFIG.schedule,
      async () => {
        if (this.isRunning) {
          logger.warn('Nightly scrape already in progress, skipping scheduled run');
          return;
        }

        logger.info('Starting scheduled nightly scrape');
        await this.runScrape();
      },
      {
        timezone: NIGHTLY_SCRAPER_CONFIG.timezone,
      }
    );

    logger.info('Nightly scraper job scheduled', {
      schedule: NIGHTLY_SCRAPER_CONFIG.schedule,
      timezone: NIGHTLY_SCRAPER_CONFIG.timezone,
      description: NIGHTLY_SCRAPER_CONFIG.description,
    });
  }

  /**
   * Stop the nightly scraper schedule
   */
  stop(): void {
    if (this.task) {
      logger.info('Stopping nightly scraper job');
      this.task.stop();
      this.task = null;
    }
  }

  /**
   * Manually trigger a scrape run (outside of schedule)
   * @returns Result of the scrape
   */
  async runNow(): Promise<NightlyScrapeResult> {
    if (this.isRunning) {
      throw new Error('A scrape is already in progress');
    }

    logger.info('Manually triggering nightly scrape');
    return this.runScrape();
  }

  /**
   * Execute the scrape and process results
   */
  private async runScrape(): Promise<NightlyScrapeResult> {
    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('=== Nightly scrape job started ===');

      // Step 1: Run full scrape
      logger.info('Step 1: Running full price scrape');
      const scrapeStats = await scraperOrchestrator.runFullScrape();

      // Step 2: Refresh Shopify catalog cache
      logger.info('Step 2: Refreshing Shopify catalog cache');
      await refreshShopifyCatalogCache();

      // Step 3: Price sync is manual (skip)
      logger.info('Step 3: Skipping automatic price sync (manual approval required)');

      // Step 4: Generate email digest
      logger.info('Step 4: Generating email digest');
      const digestData = await generateDigestData({
        totalProductsScraped: scrapeStats.totalProducts,
        successfulExtractions: scrapeStats.successfulExtractions,
        shopifySynced: 0,
        emailsSent: 0,
      });

      // Step 5: Generate attachments
      logger.info('Step 5: Generating CSV attachments');
      const attachments = generateAttachments(digestData);

      // Step 6: Send email digest
      logger.info('Step 6: Sending email digest');
      const emailSent = await sendgridClient.sendNightlyDigest(digestData, attachments);

      const durationMs = Date.now() - startTime;

      const result: NightlyScrapeResult = {
        success: true,
        totalProducts: scrapeStats.totalProducts,
        successfulExtractions: scrapeStats.successfulExtractions,
        failedExtractions: scrapeStats.failedExtractions,
        emailSent,
        durationMs,
      };

      this.lastRunResult = result;

      logger.info('=== Nightly scrape job completed ===', {
        durationMinutes: Math.round(durationMs / 60000),
        totalProducts: result.totalProducts,
        successfulExtractions: result.successfulExtractions,
        failedExtractions: result.failedExtractions,
        emailSent: result.emailSent,
      });

      // Log acceptance criteria
      const extractionRate = scrapeStats.totalProducts > 0
        ? (scrapeStats.successfulExtractions / scrapeStats.totalProducts) * 100
        : 0;

      logger.info('Acceptance criteria validation', {
        extractionRate: `${extractionRate.toFixed(2)}% (target: ≥98%)`,
        emailDelivery: emailSent ? 'success' : 'failed',
      });

      if (extractionRate < 98) {
        logger.warn('⚠️  Extraction rate below target (98%)');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      // Send alert email
      try {
        await sendgridClient.sendAlertEmail(
          'Nightly Scrape Job Failed',
          `The nightly scrape job failed with error: ${errorMessage}`
        );
      } catch (emailError) {
        logger.error('Failed to send alert email', {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }

      const result: NightlyScrapeResult = {
        success: false,
        totalProducts: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        emailSent: false,
        durationMs,
        error: errorMessage,
      };

      this.lastRunResult = result;

      logger.error('Nightly scrape job failed', {
        error: errorMessage,
        durationMinutes: Math.round(durationMs / 60000),
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if the nightly scraper is scheduled
   */
  isScheduled(): boolean {
    return this.task !== null;
  }

  /**
   * Check if a scrape is currently running
   */
  isScrapeRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the last run result
   */
  getLastRunResult(): NightlyScrapeResult | null {
    return this.lastRunResult;
  }

  /**
   * Get the schedule configuration
   */
  getScheduleConfig(): typeof NIGHTLY_SCRAPER_CONFIG {
    return { ...NIGHTLY_SCRAPER_CONFIG };
  }
}

/**
 * Singleton instance of the nightly scraper job
 */
export const nightlyScraperJob = new NightlyScraperJob();

/**
 * Convenience function to schedule the nightly scrape
 * Can be called from application startup
 */
export async function scheduleNightlyScrape(): Promise<void> {
  await nightlyScraperJob.start();
}

/**
 * Convenience function to stop the nightly scrape schedule
 * Can be called on application shutdown
 */
export function stopNightlyScrape(): void {
  nightlyScraperJob.stop();
}
