/**
 * Crawler Orchestrator
 * Manages the URL queue, coordinates with Scrapling service, and discovers products
 * Uses rate limiting and sequential processing to avoid triggering bot protection
 */

import { scraplingClient, ScrapeResult } from '../scraper/scrapling-client.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';
import {
  extractLinks,
  extractPageTitle,
  extractPrice,
  extractOfferTitle,
  extractOfferSummary,
  extractOfferDates,
} from './link-extractor.js';
import {
  matchesExclusionPattern,
  isLikelyProductPage,
  isOfferPage,
  isStaticAsset,
  getPathDepth,
} from './url-patterns.js';
import { logger } from '../utils/logger.js';
import { getShopifyProductUrls } from '../database/queries.js';

/**
 * Rate limiting configuration - conservative to avoid bot detection
 */
const CRAWL_CONFIG = {
  /** Minimum delay between requests in ms (30 seconds) */
  minDelayBetweenRequests: 30000,
  /** Maximum delay between requests in ms (60 seconds) */
  maxDelayBetweenRequests: 60000,
  /** Delay between crawling different sites in ms (5 minutes) */
  delayBetweenSites: 300000,
  /** Maximum concurrent requests (sequential only for stealth) */
  maxConcurrentRequests: 1,
  /** Maximum pages to crawl per site (safety limit) */
  maxPagesPerSite: 500,
  /** Request timeout in ms */
  requestTimeout: 60000,
};

/**
 * Honda NZ sites to crawl with their seed URLs
 * Each site has a base URL plus additional pages to ensure thorough coverage
 */
export const HONDA_SITES_CONFIG = [
  {
    baseUrl: 'https://www.hondamotorbikes.co.nz',
    seedUrls: [
      'https://www.hondamotorbikes.co.nz',
      'https://www.hondamotorbikes.co.nz/offers/',
      'https://www.hondamotorbikes.co.nz/motorcycles/',
    ],
  },
  {
    baseUrl: 'https://www.hondaoutdoors.co.nz',
    seedUrls: [
      'https://www.hondaoutdoors.co.nz',
      'https://www.hondaoutdoors.co.nz/offers/',
      'https://www.hondaoutdoors.co.nz/lawn-garden/',
      'https://www.hondaoutdoors.co.nz/generators/',
    ],
  },
  {
    baseUrl: 'https://www.hondamarine.co.nz',
    seedUrls: [
      'https://www.hondamarine.co.nz',
      'https://www.hondamarine.co.nz/offers/',
      'https://www.hondamarine.co.nz/outboards/',
    ],
  },
];

/** Simple list of base URLs for backwards compatibility */
export const HONDA_SITES = HONDA_SITES_CONFIG.map((s) => s.baseUrl);

/**
 * Callback for incremental batch saves
 * Called periodically with new discoveries to save to database
 */
export type BatchSaveCallback = (discoveries: DiscoveredUrl[], stats: BatchStats) => Promise<void>;

/**
 * Statistics for batch saves
 */
export interface BatchStats {
  /** Total URLs visited so far */
  totalVisited: number;
  /** Total discoveries so far */
  totalDiscoveries: number;
  /** Products discovered so far */
  productsDiscovered: number;
  /** Offers discovered so far */
  offersDiscovered: number;
}

/**
 * Options for configuring a crawl run
 */
export interface CrawlOptions {
  /** Maximum pages to crawl per site (default: 500) */
  maxPagesPerSite?: number;
  /** Specific sites to crawl (filters HONDA_SITES by substring match) */
  sites?: string[];
  /** Minimum delay between requests in ms (default: 30000) */
  minDelay?: number;
  /** Maximum delay between requests in ms (default: 60000) */
  maxDelay?: number;
  /** Whether to skip delay between sites (for testing) - ignored when parallel=true */
  skipSiteDelay?: boolean;
  /** Crawl all sites in parallel (default: true) */
  parallel?: boolean;
  /** Callback for incremental batch saves (called every batchSize discoveries or batchIntervalMs) */
  onBatchReady?: BatchSaveCallback;
  /** Number of discoveries to accumulate before triggering batch save (default: 50) */
  batchSize?: number;
  /** Maximum time between batch saves in ms (default: 600000 = 10 minutes) */
  batchIntervalMs?: number;
}

/**
 * A discovered URL during crawling
 */
export interface DiscoveredUrl {
  /** Original URL as found */
  url: string;
  /** Canonicalized URL for comparison */
  urlCanonical: string;
  /** Domain of the URL */
  domain: string;
  /** Page title if extracted */
  pageTitle?: string;
  /** Detected price if found */
  detectedPrice?: number;
  /** Whether this is an offer/promotion page */
  isOffer: boolean;
  /** Offer title (for offer pages) */
  offerTitle?: string;
  /** Offer summary/description (for offer pages) */
  offerSummary?: string;
  /** Offer start date (for offer pages) */
  offerStartDate?: Date;
  /** Offer end date (for offer pages) */
  offerEndDate?: Date;
}

/**
 * Result of a complete crawl run
 */
export interface CrawlResult {
  /** Run ID (set by caller after DB insert, 0 as placeholder) */
  runId: number;
  /** Total unique URLs visited */
  urlsDiscovered: number;
  /** Count of new product pages found */
  newProductsFound: number;
  /** Count of new offer pages found */
  newOffersFound: number;
  /** All discovered product and offer URLs */
  discoveries: DiscoveredUrl[];
  /** Sites that were crawled */
  sitesCrawled: string[];
  /** Duration of the crawl in ms */
  durationMs: number;
  /** Any errors encountered */
  errors: Array<{ url: string; error: string }>;
}

/**
 * Internal queue item for breadth-first crawling
 */
interface QueueItem {
  url: string;
  depth: number;
}

/**
 * Crawler Orchestrator
 * Coordinates the crawling of Honda NZ websites to discover products and offers
 */
export class CrawlerOrchestrator {
  /** Set of canonicalized URLs that have been visited */
  private visited: Set<string> = new Set();
  /** Discovered product and offer pages */
  private discoveries: DiscoveredUrl[] = [];
  /** Errors encountered during crawl */
  private errors: Array<{ url: string; error: string }> = [];
  /** Whether a crawl is currently in progress */
  private isRunning: boolean = false;
  /** URLs already being tracked in the database (to skip during discovery) */
  private existingTrackedUrls: Set<string> = new Set();
  /** Index of last discovery that was saved (for incremental batch saves) */
  private lastSavedIndex: number = 0;
  /** Timestamp of last batch save */
  private lastBatchSaveTime: number = 0;
  /** Batch save callback (if provided) */
  private onBatchReady?: BatchSaveCallback;
  /** Batch size threshold */
  private batchSize: number = 50;
  /** Batch interval in ms */
  private batchIntervalMs: number = 600000; // 10 minutes

  /**
   * Start a crawl of Honda NZ websites
   * @param options - Configuration options for the crawl
   * @returns Result of the crawl including all discoveries
   */
  async crawl(options?: CrawlOptions): Promise<CrawlResult> {
    if (this.isRunning) {
      throw new Error('Crawl already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();

    // Filter sites if specific ones requested
    const siteConfigs = options?.sites
      ? HONDA_SITES_CONFIG.filter((s) => options.sites!.some((site) => s.baseUrl.toLowerCase().includes(site.toLowerCase())))
      : HONDA_SITES_CONFIG;

    if (siteConfigs.length === 0) {
      throw new Error('No matching sites found for the specified filter');
    }

    const maxPages = options?.maxPagesPerSite ?? CRAWL_CONFIG.maxPagesPerSite;
    const minDelay = options?.minDelay ?? CRAWL_CONFIG.minDelayBetweenRequests;
    const maxDelay = options?.maxDelay ?? CRAWL_CONFIG.maxDelayBetweenRequests;
    const parallelCrawl = options?.parallel ?? true; // Default to parallel crawling

    // Reset state for new crawl
    this.visited.clear();
    this.discoveries = [];
    this.errors = [];
    this.lastSavedIndex = 0;
    this.lastBatchSaveTime = Date.now();
    this.onBatchReady = options?.onBatchReady;
    this.batchSize = options?.batchSize ?? 50;
    this.batchIntervalMs = options?.batchIntervalMs ?? 600000; // 10 minutes

    // Load existing tracked URLs from database to avoid re-discovering them
    try {
      this.existingTrackedUrls = await getShopifyProductUrls();
      logger.info('Loaded existing tracked URLs', {
        count: this.existingTrackedUrls.size,
      });
    } catch (error) {
      logger.warn('Failed to load existing URLs, will discover all products', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.existingTrackedUrls = new Set();
    }

    logger.info('Starting crawler', {
      sites: siteConfigs.map((s) => new URL(s.baseUrl).hostname),
      maxPagesPerSite: maxPages,
      minDelayMs: minDelay,
      maxDelayMs: maxDelay,
      parallel: parallelCrawl,
    });

    try {
      if (parallelCrawl) {
        // Crawl all sites in parallel for faster completion
        logger.info('Starting parallel crawl of all sites', {
          siteCount: siteConfigs.length,
        });

        const crawlPromises = siteConfigs.map((siteConfig) =>
          this.crawlSite(siteConfig.baseUrl, siteConfig.seedUrls, maxPages, minDelay, maxDelay)
            .catch((error) => {
              logger.error('Site crawl failed', {
                site: siteConfig.baseUrl,
                error: error instanceof Error ? error.message : String(error),
              });
              this.errors.push({
                url: siteConfig.baseUrl,
                error: error instanceof Error ? error.message : String(error),
              });
            })
        );

        await Promise.all(crawlPromises);
      } else {
        // Sequential crawl (legacy behavior)
        for (let i = 0; i < siteConfigs.length; i++) {
          const siteConfig = siteConfigs[i];
          logger.info(`Crawling site ${i + 1}/${siteConfigs.length}`, { site: siteConfig.baseUrl });

          await this.crawlSite(siteConfig.baseUrl, siteConfig.seedUrls, maxPages, minDelay, maxDelay);

          // Delay between sites (except after last site)
          if (i < siteConfigs.length - 1 && !options?.skipSiteDelay) {
            logger.info('Waiting between sites', {
              delayMs: CRAWL_CONFIG.delayBetweenSites,
            });
            await this.sleep(CRAWL_CONFIG.delayBetweenSites);
          }
        }
      }
    } finally {
      this.isRunning = false;
    }

    const durationMs = Date.now() - startTime;

    const result: CrawlResult = {
      runId: 0, // Set by caller after DB insert
      urlsDiscovered: this.visited.size,
      newProductsFound: this.discoveries.filter((d) => !d.isOffer).length,
      newOffersFound: this.discoveries.filter((d) => d.isOffer).length,
      discoveries: this.discoveries,
      sitesCrawled: siteConfigs.map((s) => s.baseUrl),
      durationMs,
      errors: this.errors,
    };

    logger.info('Crawl completed', {
      urlsDiscovered: result.urlsDiscovered,
      newProductsFound: result.newProductsFound,
      newOffersFound: result.newOffersFound,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
      durationMinutes: Math.round(result.durationMs / 60000),
    });

    return result;
  }

  /**
   * Crawl a single site using breadth-first search
   * @param baseUrl - The base URL of the site
   * @param seedUrls - Additional URLs to seed the crawl queue (e.g., /offers/)
   */
  private async crawlSite(
    baseUrl: string,
    seedUrls: string[],
    maxPages: number,
    minDelay: number,
    maxDelay: number
  ): Promise<void> {
    // Initialize queue with all seed URLs at depth 0
    const queue: QueueItem[] = seedUrls.map((url) => ({ url, depth: 0 }));
    let pagesVisited = 0;
    const domain = new URL(baseUrl).hostname;

    logger.info(`Starting site crawl`, {
      domain,
      seedUrls: seedUrls.length,
      maxPages,
    });

    while (queue.length > 0 && pagesVisited < maxPages) {
      // Sort queue by depth (breadth-first) - prioritize shallow pages
      queue.sort((a, b) => a.depth - b.depth);

      const item = queue.shift()!;
      const { url } = item;

      // Canonicalize for deduplication
      const canonical = canonicalizeUrl(url);

      // Skip if already visited
      if (this.visited.has(canonical)) {
        continue;
      }

      // Skip static assets
      if (isStaticAsset(url)) {
        continue;
      }

      // Mark as visited
      this.visited.add(canonical);

      // Skip excluded pages (but still mark as visited to avoid re-checking)
      if (matchesExclusionPattern(url)) {
        logger.debug('Skipping excluded URL', { url });
        continue;
      }

      // Random delay between requests (human-like behavior)
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      await this.sleep(delay);

      // Fetch the page
      const result = await this.fetchPage(url);

      if (!result.success) {
        logger.warn('Failed to fetch page', { url, error: result.error });
        this.errors.push({ url, error: result.error || 'Unknown error' });
        continue;
      }

      pagesVisited++;

      // Extract links and add to queue
      const links = extractLinks(result.html, url);
      for (const link of links) {
        const linkCanonical = canonicalizeUrl(link);
        if (!this.visited.has(linkCanonical)) {
          // Don't add duplicates to queue
          const alreadyInQueue = queue.some(
            (q) => canonicalizeUrl(q.url) === linkCanonical
          );
          if (!alreadyInQueue) {
            // Prioritize offer pages by giving them depth 0 (same as seed URLs)
            // This ensures offer subpages are crawled early, not deprioritized
            const linkDepth = isOfferPage(link) ? 0 : getPathDepth(link);
            queue.push({ url: link, depth: linkDepth });
          }
        }
      }

      // Check if this is a product or offer page
      const isOffer = isOfferPage(url);
      const isProduct = !isOffer && isLikelyProductPage(url, result.html);

      if (isProduct || isOffer) {
        // Skip products already being tracked in the database
        if (isProduct && this.existingTrackedUrls.has(canonical)) {
          logger.debug('Skipping already-tracked product', { url, canonical });
          continue;
        }

        const discovery: DiscoveredUrl = {
          url,
          urlCanonical: canonical,
          domain,
          pageTitle: extractPageTitle(result.html),
          detectedPrice: isProduct ? extractPrice(result.html) : undefined,
          isOffer,
        };

        // Extract additional details for offer pages
        if (isOffer) {
          discovery.offerTitle = extractOfferTitle(result.html);
          discovery.offerSummary = extractOfferSummary(result.html);
          const dates = extractOfferDates(result.html);
          discovery.offerStartDate = dates.startDate;
          discovery.offerEndDate = dates.endDate;
        }

        this.discoveries.push(discovery);

        logger.info(`Discovered ${isOffer ? 'offer' : 'product'} page`, {
          url,
          pageTitle: discovery.pageTitle,
          detectedPrice: discovery.detectedPrice,
          offerTitle: discovery.offerTitle,
          offerEndDate: discovery.offerEndDate?.toISOString(),
        });

        // Check if we should flush discoveries to database
        await this.checkAndFlushBatch();
      }

      // Progress logging
      if (pagesVisited % 10 === 0) {
        logger.info('Crawl progress', {
          domain,
          pagesVisited,
          maxPages,
          queueSize: queue.length,
          discoveries: this.discoveries.length,
        });
      }
    }

    logger.info('Finished crawling site', {
      domain,
      pagesVisited,
      maxPages,
      discoveredOnSite: this.discoveries.filter((d) => d.domain === domain).length,
    });
  }

  /**
   * Fetch a page using the Scrapling client
   */
  private async fetchPage(url: string): Promise<ScrapeResult> {
    try {
      return await scraplingClient.scrape(url, {
        renderJs: true, // Honda sites require JS rendering
        timeoutMs: CRAWL_CONFIG.requestTimeout,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        html: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if batch save should be triggered and execute if needed
   * Saves when: discoveries since last save >= batchSize OR time since last save >= batchIntervalMs
   */
  private async checkAndFlushBatch(): Promise<void> {
    if (!this.onBatchReady) return;

    const unsavedCount = this.discoveries.length - this.lastSavedIndex;
    const timeSinceLastSave = Date.now() - this.lastBatchSaveTime;

    const shouldFlush = unsavedCount >= this.batchSize ||
                        (unsavedCount > 0 && timeSinceLastSave >= this.batchIntervalMs);

    if (shouldFlush) {
      const newDiscoveries = this.discoveries.slice(this.lastSavedIndex);

      const stats: BatchStats = {
        totalVisited: this.visited.size,
        totalDiscoveries: this.discoveries.length,
        productsDiscovered: this.discoveries.filter(d => !d.isOffer).length,
        offersDiscovered: this.discoveries.filter(d => d.isOffer).length,
      };

      logger.info('Flushing discovery batch to database', {
        batchSize: newDiscoveries.length,
        totalDiscoveries: this.discoveries.length,
        timeSinceLastSaveMs: timeSinceLastSave,
        products: newDiscoveries.filter(d => !d.isOffer).length,
        offers: newDiscoveries.filter(d => d.isOffer).length,
      });

      try {
        await this.onBatchReady(newDiscoveries, stats);
        this.lastSavedIndex = this.discoveries.length;
        this.lastBatchSaveTime = Date.now();

        logger.info('Batch save completed successfully', {
          savedCount: newDiscoveries.length,
          totalSaved: this.lastSavedIndex,
        });
      } catch (error) {
        logger.error('Batch save failed - will retry on next flush', {
          error: error instanceof Error ? error.message : String(error),
          batchSize: newDiscoveries.length,
        });
        // Don't update lastSavedIndex so we retry these items
      }
    }
  }

  /**
   * Force flush any remaining unsaved discoveries
   * Called at end of crawl to ensure nothing is lost
   */
  async flushRemainingDiscoveries(): Promise<void> {
    if (!this.onBatchReady) return;

    const unsavedCount = this.discoveries.length - this.lastSavedIndex;
    if (unsavedCount === 0) return;

    const newDiscoveries = this.discoveries.slice(this.lastSavedIndex);

    const stats: BatchStats = {
      totalVisited: this.visited.size,
      totalDiscoveries: this.discoveries.length,
      productsDiscovered: this.discoveries.filter(d => !d.isOffer).length,
      offersDiscovered: this.discoveries.filter(d => d.isOffer).length,
    };

    logger.info('Flushing final discovery batch', {
      batchSize: newDiscoveries.length,
      totalDiscoveries: this.discoveries.length,
    });

    await this.onBatchReady(newDiscoveries, stats);
    this.lastSavedIndex = this.discoveries.length;
    this.lastBatchSaveTime = Date.now();
  }

  /**
   * Check if a crawl is currently running
   */
  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current count of visited URLs (for progress monitoring)
   */
  getVisitedCount(): number {
    return this.visited.size;
  }

  /**
   * Get the current count of discoveries (for progress monitoring)
   */
  getDiscoveryCount(): number {
    return this.discoveries.length;
  }
}

/**
 * Singleton instance of the crawler orchestrator
 */
export const crawlerOrchestrator = new CrawlerOrchestrator();
