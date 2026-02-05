/**
 * Nightly Offers Crawler Job
 * Scheduled job that crawls only the /offers/ pages from Honda NZ websites every night
 *
 * Schedule: Every day at 1 AM NZ time (Pacific/Auckland timezone)
 *
 * This job:
 * 1. Creates a crawl run record in the database
 * 2. Crawls ONLY the /offers/ pages from all three Honda NZ sites
 * 3. Detects and stores new/updated offers
 * 4. Updates the crawl run record with results
 *
 * This is a focused crawl that runs nightly to catch time-sensitive offers,
 * complementing the weekly full site crawl.
 */

import * as cron from 'node-cron';
import {
  CrawlerOrchestrator,
  offerDetector,
  type DiscoveredOffer,
  type DiscoveredUrl,
} from '../crawler/index.js';
import {
  createCrawlRun,
  updateCrawlRun,
  cleanupStaleCrawlRuns,
} from '../database/queries.js';
import { logger } from '../utils/logger.js';

/**
 * Offer-only seed URLs for each Honda NZ site
 * Only crawls the /offers/ section, not the entire site
 */
const OFFERS_ONLY_SITES = [
  {
    baseUrl: 'https://www.hondamotorbikes.co.nz',
    seedUrls: ['https://www.hondamotorbikes.co.nz/offers/'],
  },
  {
    baseUrl: 'https://www.hondaoutdoors.co.nz',
    seedUrls: ['https://www.hondaoutdoors.co.nz/offers/'],
  },
  {
    baseUrl: 'https://www.hondamarine.co.nz',
    seedUrls: ['https://www.hondamarine.co.nz/offers/'],
  },
];

/**
 * Configuration for the nightly offers crawler
 */
const NIGHTLY_OFFERS_CONFIG = {
  /** Cron expression: Every day at 1 AM */
  schedule: '0 1 * * *',
  /** Timezone for the schedule */
  timezone: 'Pacific/Auckland',
  /** Human-readable description */
  description: 'Nightly Honda NZ offers crawl (Daily at 1 AM NZ time)',
  /** Maximum pages to crawl per site (offers pages are limited) */
  maxPagesPerSite: 50,
  /** Faster delays for smaller crawl */
  minDelayMs: 15000, // 15 seconds
  maxDelayMs: 30000, // 30 seconds
};

/**
 * Result of a nightly offers crawl execution
 */
export interface NightlyOffersCrawlResult {
  /** Database ID of the crawl run */
  runId: number;
  /** Whether the crawl completed successfully */
  success: boolean;
  /** Total URLs discovered during crawl */
  urlsDiscovered: number;
  /** Count of new offers found */
  newOffersFound: number;
  /** Count of offers saved (includes upserts) */
  savedOffersCount: number;
  /** Duration of the crawl in milliseconds */
  durationMs: number;
  /** Error message if crawl failed */
  error?: string;
}

/**
 * Nightly Offers Crawler Job Manager
 * Handles scheduling and execution of the nightly Honda NZ offers crawl
 */
export class NightlyOffersCrawlerJob {
  private task: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private lastRunResult: NightlyOffersCrawlResult | null = null;

  constructor() {
    // No initialization needed - crawler instances are created per-site during crawl
  }

  /**
   * Start the nightly offers crawler schedule
   */
  async start(): Promise<void> {
    if (this.task) {
      logger.warn('Nightly offers crawler job is already scheduled');
      return;
    }

    // Clean up any stale "running" crawl runs from crashed processes
    try {
      const cleanedUp = await cleanupStaleCrawlRuns(24);
      if (cleanedUp > 0) {
        logger.info('Cleaned up stale crawl runs on startup (nightly offers)', { count: cleanedUp });
      }
    } catch (error) {
      logger.error('Failed to cleanup stale crawl runs on startup (nightly offers)', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with scheduling even if cleanup fails
    }

    // Validate cron expression
    if (!cron.validate(NIGHTLY_OFFERS_CONFIG.schedule)) {
      throw new Error(`Invalid cron expression: ${NIGHTLY_OFFERS_CONFIG.schedule}`);
    }

    // Schedule the nightly offers crawl
    this.task = cron.schedule(
      NIGHTLY_OFFERS_CONFIG.schedule,
      async () => {
        if (this.isRunning) {
          logger.warn('Nightly offers crawl already in progress, skipping scheduled run');
          return;
        }

        logger.info('Starting scheduled nightly offers crawl');
        await this.runCrawl();
      },
      {
        timezone: NIGHTLY_OFFERS_CONFIG.timezone,
      }
    );

    logger.info('Nightly offers crawler job scheduled', {
      schedule: NIGHTLY_OFFERS_CONFIG.schedule,
      timezone: NIGHTLY_OFFERS_CONFIG.timezone,
      description: NIGHTLY_OFFERS_CONFIG.description,
      sites: OFFERS_ONLY_SITES.map((s) => new URL(s.baseUrl).hostname),
    });
  }

  /**
   * Stop the nightly offers crawler schedule
   */
  stop(): void {
    if (this.task) {
      logger.info('Stopping nightly offers crawler job');
      this.task.stop();
      this.task = null;
    }
  }

  /**
   * Manually trigger a crawl run (outside of schedule)
   * @returns Result of the crawl
   */
  async runNow(): Promise<NightlyOffersCrawlResult> {
    if (this.isRunning) {
      throw new Error('An offers crawl is already in progress');
    }

    logger.info('Manually triggering nightly offers crawl');
    return this.runCrawl();
  }

  /**
   * Execute the offers-only crawl and process results
   */
  private async runCrawl(): Promise<NightlyOffersCrawlResult> {
    this.isRunning = true;
    const startTime = Date.now();

    // Extract site names for the crawl run record
    const siteNames = OFFERS_ONLY_SITES.map((s) =>
      new URL(s.baseUrl).hostname.replace('www.', '') + '/offers'
    );

    // Create crawl run record
    let runId: number;
    try {
      runId = await createCrawlRun(siteNames);
      logger.info('Created nightly offers crawl run', { runId, sites: siteNames });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create crawl run record for nightly offers', { error: errorMessage });

      this.isRunning = false;
      this.lastRunResult = {
        runId: 0,
        success: false,
        urlsDiscovered: 0,
        newOffersFound: 0,
        savedOffersCount: 0,
        durationMs: Date.now() - startTime,
        error: `Failed to create crawl run: ${errorMessage}`,
      };
      return this.lastRunResult;
    }

    try {
      // Execute the offers-only crawl
      // We need to temporarily override the sites config
      logger.info('Starting offers-only crawler', { runId });

      // Crawl each offers page
      const allDiscoveries: DiscoveredUrl[] = [];
      let totalUrlsVisited = 0;

      for (const siteConfig of OFFERS_ONLY_SITES) {
        logger.info('Crawling offers for site', {
          site: siteConfig.baseUrl,
          seedUrls: siteConfig.seedUrls,
        });

        try {
          // Create a fresh crawler instance for each site to avoid state issues
          const siteCrawler = new CrawlerOrchestrator();
          const crawlResult = await siteCrawler.crawl({
            sites: [siteConfig.baseUrl],
            maxPagesPerSite: NIGHTLY_OFFERS_CONFIG.maxPagesPerSite,
            minDelay: NIGHTLY_OFFERS_CONFIG.minDelayMs,
            maxDelay: NIGHTLY_OFFERS_CONFIG.maxDelayMs,
            parallel: false, // Sequential for single-site focus
            skipSiteDelay: true, // No delay needed between single site
          });

          // Only keep offer discoveries (filter out any products found via links)
          const offerDiscoveries = crawlResult.discoveries.filter((d) => d.isOffer);
          allDiscoveries.push(...offerDiscoveries);
          totalUrlsVisited += crawlResult.urlsDiscovered;

          logger.info('Site offers crawl completed', {
            site: siteConfig.baseUrl,
            urlsVisited: crawlResult.urlsDiscovered,
            offersFound: offerDiscoveries.length,
          });
        } catch (siteError) {
          logger.error('Failed to crawl offers for site', {
            site: siteConfig.baseUrl,
            error: siteError instanceof Error ? siteError.message : String(siteError),
          });
          // Continue with other sites even if one fails
        }

        // Small delay between sites
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Process offers through the offer detector
      logger.info('Processing discovered offers', {
        runId,
        offerCount: allDiscoveries.length,
      });

      const offersToProcess: DiscoveredOffer[] = allDiscoveries.map((offer) => ({
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
        urls_discovered: totalUrlsVisited,
        new_products_found: 0, // Offers-only crawl doesn't look for products
        new_offers_found: offerResult.newCount,
      });

      const result: NightlyOffersCrawlResult = {
        runId,
        success: true,
        urlsDiscovered: totalUrlsVisited,
        newOffersFound: offerResult.newCount,
        savedOffersCount: offerResult.savedCount,
        durationMs,
      };

      this.lastRunResult = result;

      logger.info('Nightly offers crawl completed successfully', {
        runId,
        urlsDiscovered: result.urlsDiscovered,
        newOffersFound: result.newOffersFound,
        savedOffersCount: result.savedOffersCount,
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

      const result: NightlyOffersCrawlResult = {
        runId,
        success: false,
        urlsDiscovered: 0,
        newOffersFound: 0,
        savedOffersCount: 0,
        durationMs,
        error: errorMessage,
      };

      this.lastRunResult = result;

      logger.error('Nightly offers crawl failed', {
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
   * Check if the nightly offers crawler is scheduled
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
  getLastRunResult(): NightlyOffersCrawlResult | null {
    return this.lastRunResult;
  }

  /**
   * Get the schedule configuration
   */
  getScheduleConfig(): typeof NIGHTLY_OFFERS_CONFIG {
    return { ...NIGHTLY_OFFERS_CONFIG };
  }
}

/**
 * Singleton instance of the nightly offers crawler job
 */
export const nightlyOffersCrawlerJob = new NightlyOffersCrawlerJob();

/**
 * Convenience function to schedule the nightly offers crawl
 * Can be called from application startup
 */
export async function scheduleNightlyOffersCrawl(): Promise<void> {
  await nightlyOffersCrawlerJob.start();
}

/**
 * Convenience function to stop the nightly offers crawl schedule
 * Can be called on application shutdown
 */
export function stopNightlyOffersCrawl(): void {
  nightlyOffersCrawlerJob.stop();
}
