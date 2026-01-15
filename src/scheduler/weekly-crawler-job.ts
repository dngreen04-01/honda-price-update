/**
 * Weekly Crawler Job
 * Scheduled job that crawls Honda NZ websites weekly to discover new products and offers
 *
 * Schedule: Every Sunday at 2 AM NZ time (Pacific/Auckland timezone)
 *
 * This job:
 * 1. Creates a crawl run record in the database
 * 2. Crawls all three Honda NZ sites sequentially
 * 3. Detects new products not already in the catalog
 * 4. Detects and stores new offers
 * 5. Updates the crawl run record with results
 */

import * as cron from 'node-cron';
import {
  crawlerOrchestrator,
  newProductDetector,
  offerDetector,
  HONDA_SITES,
  type DiscoveredOffer,
} from '../crawler/index.js';
import {
  createCrawlRun,
  updateCrawlRun,
  insertDiscoveredProduct,
} from '../database/queries.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration for the weekly crawler
 */
const WEEKLY_CRAWLER_CONFIG = {
  /** Cron expression: Sunday at 2 AM */
  schedule: '0 2 * * 0',
  /** Timezone for the schedule */
  timezone: 'Pacific/Auckland',
  /** Human-readable description */
  description: 'Weekly Honda NZ website crawl (Sundays at 2 AM NZ time)',
};

/**
 * Result of a weekly crawl execution
 */
export interface WeeklyCrawlResult {
  /** Database ID of the crawl run */
  runId: number;
  /** Whether the crawl completed successfully */
  success: boolean;
  /** Total URLs discovered during crawl */
  urlsDiscovered: number;
  /** Count of new products found */
  newProductsFound: number;
  /** Count of new offers found */
  newOffersFound: number;
  /** Duration of the crawl in milliseconds */
  durationMs: number;
  /** Error message if crawl failed */
  error?: string;
}

/**
 * Weekly Crawler Job Manager
 * Handles scheduling and execution of the weekly Honda NZ website crawl
 */
export class WeeklyCrawlerJob {
  private task: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private lastRunResult: WeeklyCrawlResult | null = null;

  /**
   * Start the weekly crawler schedule
   */
  start(): void {
    if (this.task) {
      logger.warn('Weekly crawler job is already scheduled');
      return;
    }

    // Validate cron expression
    if (!cron.validate(WEEKLY_CRAWLER_CONFIG.schedule)) {
      throw new Error(`Invalid cron expression: ${WEEKLY_CRAWLER_CONFIG.schedule}`);
    }

    // Schedule the weekly crawl
    this.task = cron.schedule(
      WEEKLY_CRAWLER_CONFIG.schedule,
      async () => {
        if (this.isRunning) {
          logger.warn('Weekly crawl already in progress, skipping scheduled run');
          return;
        }

        logger.info('Starting scheduled weekly crawl');
        await this.runCrawl();
      },
      {
        timezone: WEEKLY_CRAWLER_CONFIG.timezone,
      }
    );

    logger.info('Weekly crawler job scheduled', {
      schedule: WEEKLY_CRAWLER_CONFIG.schedule,
      timezone: WEEKLY_CRAWLER_CONFIG.timezone,
      description: WEEKLY_CRAWLER_CONFIG.description,
      sites: HONDA_SITES.map((s) => new URL(s).hostname),
    });
  }

  /**
   * Stop the weekly crawler schedule
   */
  stop(): void {
    if (this.task) {
      logger.info('Stopping weekly crawler job');
      this.task.stop();
      this.task = null;
    }
  }

  /**
   * Manually trigger a crawl run (outside of schedule)
   * @returns Result of the crawl
   */
  async runNow(): Promise<WeeklyCrawlResult> {
    if (this.isRunning) {
      throw new Error('A crawl is already in progress');
    }

    logger.info('Manually triggering weekly crawl');
    return this.runCrawl();
  }

  /**
   * Execute the crawl and process results
   */
  private async runCrawl(): Promise<WeeklyCrawlResult> {
    this.isRunning = true;
    const startTime = Date.now();

    // Extract site names for the crawl run record
    const siteNames = HONDA_SITES.map((s) => new URL(s).hostname.replace('www.', ''));

    // Create crawl run record
    let runId: number;
    try {
      runId = await createCrawlRun(siteNames);
      logger.info('Created crawl run', { runId, sites: siteNames });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create crawl run record', { error: errorMessage });

      this.isRunning = false;
      this.lastRunResult = {
        runId: 0,
        success: false,
        urlsDiscovered: 0,
        newProductsFound: 0,
        newOffersFound: 0,
        durationMs: Date.now() - startTime,
        error: `Failed to create crawl run: ${errorMessage}`,
      };
      return this.lastRunResult;
    }

    try {
      // Execute the crawl
      logger.info('Starting crawler orchestrator', { runId });
      const crawlResult = await crawlerOrchestrator.crawl();

      // Detect new products
      logger.info('Detecting new products', {
        runId,
        totalDiscoveries: crawlResult.discoveries.length,
      });
      const detectionResult = await newProductDetector.detectNewProducts(crawlResult.discoveries);

      // Save new products to discovered_products table
      logger.info('Saving new products to database', {
        runId,
        newProductCount: detectionResult.newProducts.length,
      });
      for (const product of detectionResult.newProducts) {
        await insertDiscoveredProduct(runId, {
          url: product.url,
          urlCanonical: product.urlCanonical,
          domain: product.domain,
          pageTitle: product.pageTitle,
          detectedPrice: product.detectedPrice,
        });
      }

      // Process offers
      logger.info('Processing discovered offers', {
        runId,
        offerCount: detectionResult.offers.length,
      });
      const offersToProcess: DiscoveredOffer[] = detectionResult.offers.map((offer) => ({
        url: offer.url,
        urlCanonical: offer.urlCanonical,
        domain: offer.domain,
        title: offer.offerTitle || offer.pageTitle || 'Untitled Offer',
        summary: offer.offerSummary,
        startDate: offer.offerStartDate,
        endDate: offer.offerEndDate,
      }));

      const offerResult = await offerDetector.processOffers(offersToProcess);

      // Update crawl run with results
      const durationMs = Date.now() - startTime;
      await updateCrawlRun(runId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        urls_discovered: crawlResult.urlsDiscovered,
        new_products_found: detectionResult.newProducts.length,
        new_offers_found: offerResult.newCount,
      });

      const result: WeeklyCrawlResult = {
        runId,
        success: true,
        urlsDiscovered: crawlResult.urlsDiscovered,
        newProductsFound: detectionResult.newProducts.length,
        newOffersFound: offerResult.newCount,
        durationMs,
      };

      this.lastRunResult = result;

      logger.info('Weekly crawl completed successfully', {
        runId,
        urlsDiscovered: result.urlsDiscovered,
        newProductsFound: result.newProductsFound,
        newOffersFound: result.newOffersFound,
        durationMinutes: Math.round(durationMs / 60000),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      // Update crawl run with failure
      try {
        await updateCrawlRun(runId, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        });
      } catch (updateError) {
        logger.error('Failed to update crawl run with error status', {
          runId,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      }

      const result: WeeklyCrawlResult = {
        runId,
        success: false,
        urlsDiscovered: 0,
        newProductsFound: 0,
        newOffersFound: 0,
        durationMs,
        error: errorMessage,
      };

      this.lastRunResult = result;

      logger.error('Weekly crawl failed', {
        runId,
        error: errorMessage,
        durationMinutes: Math.round(durationMs / 60000),
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if the weekly crawler is scheduled
   */
  isScheduled(): boolean {
    return this.task !== null;
  }

  /**
   * Check if a crawl is currently running
   */
  isCrawlRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the last run result
   */
  getLastRunResult(): WeeklyCrawlResult | null {
    return this.lastRunResult;
  }

  /**
   * Get the schedule configuration
   */
  getScheduleConfig(): typeof WEEKLY_CRAWLER_CONFIG {
    return { ...WEEKLY_CRAWLER_CONFIG };
  }
}

/**
 * Singleton instance of the weekly crawler job
 */
export const weeklyCrawlerJob = new WeeklyCrawlerJob();

/**
 * Convenience function to schedule the weekly crawl
 * Can be called from application startup
 */
export function scheduleWeeklyCrawl(): void {
  weeklyCrawlerJob.start();
}

/**
 * Convenience function to stop the weekly crawl schedule
 * Can be called on application shutdown
 */
export function stopWeeklyCrawl(): void {
  weeklyCrawlerJob.stop();
}
