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
 * Honda NZ sites to crawl
 */
export const HONDA_SITES = [
  'https://www.hondamotorbikes.co.nz',
  'https://www.hondaoutdoors.co.nz',
  'https://www.hondamarine.co.nz',
];

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
  /** Whether to skip delay between sites (for testing) */
  skipSiteDelay?: boolean;
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
    const sites = options?.sites
      ? HONDA_SITES.filter((s) => options.sites!.some((site) => s.toLowerCase().includes(site.toLowerCase())))
      : HONDA_SITES;

    if (sites.length === 0) {
      throw new Error('No matching sites found for the specified filter');
    }

    const maxPages = options?.maxPagesPerSite ?? CRAWL_CONFIG.maxPagesPerSite;
    const minDelay = options?.minDelay ?? CRAWL_CONFIG.minDelayBetweenRequests;
    const maxDelay = options?.maxDelay ?? CRAWL_CONFIG.maxDelayBetweenRequests;

    // Reset state for new crawl
    this.visited.clear();
    this.discoveries = [];
    this.errors = [];

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
      sites: sites.map((s) => new URL(s).hostname),
      maxPagesPerSite: maxPages,
      minDelayMs: minDelay,
      maxDelayMs: maxDelay,
    });

    try {
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        logger.info(`Crawling site ${i + 1}/${sites.length}`, { site });

        await this.crawlSite(site, maxPages, minDelay, maxDelay);

        // Delay between sites (except after last site)
        if (i < sites.length - 1 && !options?.skipSiteDelay) {
          logger.info('Waiting between sites', {
            delayMs: CRAWL_CONFIG.delayBetweenSites,
          });
          await this.sleep(CRAWL_CONFIG.delayBetweenSites);
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
      sitesCrawled: sites,
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
   */
  private async crawlSite(
    baseUrl: string,
    maxPages: number,
    minDelay: number,
    maxDelay: number
  ): Promise<void> {
    const queue: QueueItem[] = [{ url: baseUrl, depth: 0 }];
    let pagesVisited = 0;
    const domain = new URL(baseUrl).hostname;

    logger.info(`Starting site crawl`, {
      domain,
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
            queue.push({ url: link, depth: getPathDepth(link) });
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
