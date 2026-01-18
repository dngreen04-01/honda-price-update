# Honda Website Crawler for New Product & Offer Discovery

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This document must be maintained in accordance with `/References/Plans.md`.

## Purpose / Big Picture

After this change, the system will automatically discover new products and promotional offers on Honda NZ websites that are not currently being tracked. Once per week, the crawler will visit three Honda sites (hondamotorbikes.co.nz, hondaoutdoors.co.nz, hondamarine.co.nz), extract all product and offer URLs, compare them against the existing `source_url_canonical` values in the database, and present any new discoveries in a review queue.

A user can see this working by triggering a manual crawl via `POST /api/crawl`, then viewing discovered products at `GET /api/crawl/results`. New products appear with status "pending" and can be reviewed, ignored, or added to price tracking.

## Progress

- [x] Phase 1: Add sitemap endpoint to Python scraper service
- [x] Phase 2: Create TypeScript crawler orchestrator
- [x] Phase 3: Implement URL pattern filtering (exclusions and product detection)
- [x] Phase 4: Create database migration for discovery tables
- [x] Phase 5: Implement new product detection logic
- [x] Phase 6: Add offer detection and storage
- [x] Phase 7: Create weekly scheduled crawl job
- [x] Phase 8: Implement API endpoints for manual trigger and review

## Surprises & Discoveries

- Observation: Honda NZ sites use enterprise-level Cloudflare Bot Fight Mode that blocks Puppeteer, Playwright, datacenter IPs, VPNs, and premium scraping services like Firecrawl.
  Evidence: See `/BOT_PROTECTION_ANALYSIS.md` which documents HTTP 403 responses and explicit "If you are using a VPN, please consider not using a VPN" messages.

- Observation: The existing Scrapling Python service with `DynamicFetcher` and `stealth=True` successfully bypasses the bot protection.
  Evidence: The current price scraping functionality in `python-scraper/server.py` works against these sites.

- Observation: Honda sites use flat URL structures without `/product/` prefixes. Products are at paths like `/eu22i`, `/bf200`, `/nc750x`.
  Evidence: Analysis of `Products-Grid view (12).csv` shows URLs like `https://www.hondaoutdoors.co.nz/eu22i`, `https://www.hondamarine.co.nz/bf200`.

- Observation: Honda NZ sites do not have public sitemap.xml files.
  Evidence: All three sites (hondamarine.co.nz, hondaoutdoors.co.nz, hondamotorbikes.co.nz) return 404 HTML pages for /sitemap.xml requests. The crawler will need to rely entirely on link extraction from page crawling.
  Date: 2026-01-15

- Observation: Phases 2 and 3 are tightly coupled - the crawler orchestrator requires URL pattern filtering as a direct dependency.
  Evidence: `crawler-orchestrator.ts` imports from `url-patterns.ts` for exclusion matching and product detection. Both phases implemented together.
  Date: 2026-01-15

- Observation: Phase 6 required adding a unique constraint on `offer_url` in the offers table for upsert support.
  Evidence: Created migration `010_add_offer_url_unique.sql`. The existing offers table schema lacked this constraint which is needed for ON CONFLICT handling.
  Date: 2026-01-15

- Observation: Phase 8 (API endpoints) was implemented alongside Phase 6 as they share offer storage logic.
  Evidence: `src/api/crawler-api.ts` created with endpoints for crawl management and the `runCrawlAsync` function processes both products and offers.
  Date: 2026-01-15

- Observation: Product URLs can have category prefixes that create duplicate entries in the discovery queue.
  Evidence: `/honda-genuine-accessories/08l78mkse00` and `/08l78mkse00` are the same product but were treated as different due to exact URL matching.
  Solution: Implemented multi-level matching in `new-product-detector.ts`:
    - Tier 1: Exact canonical URL match (existing)
    - Tier 2: Product ID / SKU match using last path segment against `variant_sku` and extracted product IDs from existing URLs
  Date: 2026-01-17

## Decision Log

- Decision: Use hybrid Scrapling + TypeScript orchestrator instead of Scrapy or Crawlee
  Rationale: Scrapy (Python HTTP-based) and Crawlee (Puppeteer/Playwright-based) would both be blocked by Cloudflare. The existing Scrapling service already bypasses protection. Adding a TypeScript orchestration layer on top maintains consistency with the existing codebase while leveraging proven stealth capabilities.
  Date/Author: 2026-01-15

- Decision: Store new products in a review queue rather than auto-adding to tracking
  Rationale: User preference. Allows manual verification before adding products to price monitoring.
  Date/Author: 2026-01-15

- Decision: Track offers independently in the existing `offers` table rather than linking to products
  Rationale: User preference. Offers are site-wide promotions, not necessarily tied to specific products.
  Date/Author: 2026-01-15

- Decision: Use exclusion-based URL filtering rather than inclusion patterns
  Rationale: Honda sites have flat URL structures where products live at root-level paths. It is easier to exclude known non-product pages (finance, about, contact) than to enumerate all valid product URL patterns.
  Date/Author: 2026-01-15

## Outcomes & Retrospective

(To be completed as work proceeds)

## Context and Orientation

This repository is a price monitoring system that synchronizes product prices between Shopify stores and Honda NZ supplier websites. The key components relevant to this task are:

**Database Tables** (in `src/database/schema.sql`):
- `shopify_catalog_cache`: Stores products with `source_url_canonical` (the canonicalized supplier URL used for matching) and `source_url` (the original URL used for scraping)
- `offers`: Exists but is currently empty; has columns for `domain_id`, `title`, `offer_url`, `summary`
- `domains`: Contains the three Honda domains with IDs

**Scraping Infrastructure**:
- `python-scraper/server.py`: FastAPI service on port 8002 using Scrapling's `DynamicFetcher` with stealth mode. Exposes `/scrape` endpoint that returns HTML content.
- `src/scraper/scrapling-client.ts`: TypeScript client that calls the Python service with circuit breaker protection and retry logic.
- `src/utils/canonicalize.ts`: URL canonicalization function that normalizes URLs (removes www., trailing slashes, tracking parameters, sorts query params).

**Bot Protection Context**:
The Honda sites use Cloudflare Bot Fight Mode. Previous attempts with Puppeteer, Bright Data proxies, and Firecrawl all failed with HTTP 403. The Scrapling `DynamicFetcher` with `stealth=True` is the only method that currently works.

## Plan of Work

The implementation proceeds in eight phases, each building on the previous. All new TypeScript code goes in `src/crawler/`. The Python service gets one new endpoint. A new database migration creates tables for tracking crawl runs and discovered products.

**Phase 1** adds a `/sitemap` endpoint to the Python service. Sitemaps are typically whitelisted even by aggressive bot protection, so this provides the fastest path to URL discovery. The endpoint fetches `sitemap.xml` from a given domain, parses the XML, and returns all `<loc>` URLs.

**Phase 2** creates the TypeScript crawler orchestrator at `src/crawler/crawler-orchestrator.ts`. This class manages the URL queue, calls the Scrapling client for each page, extracts links from HTML responses, and respects rate limits (30-60 second delays between requests, sequential processing only).

**Phase 3** implements URL filtering in `src/crawler/url-patterns.ts`. This defines exclusion patterns for non-product pages (about, contact, finance, find-a-dealer, etc.) and heuristics for detecting product pages (presence of price elements, add-to-cart buttons, JSON-LD Product schema).

**Phase 4** creates migration `migrations/009_add_crawl_discovery.sql` with two tables: `crawl_runs` (tracks each crawl execution with status, counts, timestamps) and `discovered_products` (stores URLs awaiting review with status pending/reviewed/ignored/added).

**Phase 5** implements new product detection in `src/crawler/new-product-detector.ts`. This queries all existing `source_url_canonical` values from `shopify_catalog_cache`, canonicalizes each discovered URL, and identifies those not present in the existing set.

**Phase 6** adds offer detection. URLs matching patterns like `/offers/`, `/promotions/`, `/specials/` are inserted into the existing `offers` table with the appropriate `domain_id`.

**Phase 7** creates the weekly scheduled job at `src/scheduler/weekly-crawler-job.ts`. This runs every Sunday at 2 AM NZ time, crawls all three sites sequentially with 5-minute delays between sites, and stores results.

**Phase 8** adds API endpoints in `src/api/crawler-api.ts`: POST `/api/crawl` to trigger manual crawls, GET `/api/crawl/status/:runId` for progress, GET `/api/crawl/results` for pending discoveries, and POST `/api/crawl/review/:productId` to act on discoveries.

## Concrete Steps

### Step 1: Create the database migration

Working directory: `/Users/Development/Honda Price Update`

Create file `migrations/009_add_crawl_discovery.sql`:

    -- Crawl run tracking
    CREATE TABLE IF NOT EXISTS crawl_runs (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'running',
      sites_crawled TEXT[],
      urls_discovered INTEGER DEFAULT 0,
      new_products_found INTEGER DEFAULT 0,
      new_offers_found INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- Discovered products awaiting review
    CREATE TABLE IF NOT EXISTS discovered_products (
      id SERIAL PRIMARY KEY,
      crawl_run_id INTEGER REFERENCES crawl_runs(id),
      url TEXT NOT NULL,
      url_canonical TEXT NOT NULL,
      domain TEXT NOT NULL,
      page_title TEXT,
      detected_price DECIMAL(10,2),
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMP,
      reviewed_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(url_canonical)
    );

    CREATE INDEX IF NOT EXISTS idx_discovered_products_status ON discovered_products(status);
    CREATE INDEX IF NOT EXISTS idx_discovered_products_domain ON discovered_products(domain);
    CREATE INDEX IF NOT EXISTS idx_crawl_runs_status ON crawl_runs(status);

Run the migration:

    node run-migration-009.cjs

Expected output: Migration completes without errors; tables `crawl_runs` and `discovered_products` exist.

### Step 2: Add sitemap endpoint to Python service

Working directory: `/Users/Development/Honda Price Update/python-scraper`

Edit `server.py` to add after the existing `/scrape` endpoint:

    from xml.etree import ElementTree

    class SitemapRequest(BaseModel):
        url: str

    @app.post("/sitemap")
    async def fetch_sitemap(request: SitemapRequest):
        """Fetch and parse a sitemap.xml, returning all URLs."""
        try:
            response = await run_in_threadpool(
                fetch_url_sync,
                request.url,
                False,  # render_js not needed for XML
                None,   # proxy_url
                True,   # stealth
            )

            # Parse XML
            root = ElementTree.fromstring(response.body)
            namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

            urls = []
            for url_elem in root.findall('.//ns:url', namespace):
                loc = url_elem.find('ns:loc', namespace)
                if loc is not None and loc.text:
                    urls.append(loc.text)

            return {"success": True, "urls": urls, "count": len(urls)}
        except Exception as e:
            logger.exception("Error fetching sitemap %s", request.url)
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": str(e)}
            )

Test the endpoint:

    curl -X POST http://localhost:8002/sitemap \
      -H "Content-Type: application/json" \
      -d '{"url": "https://www.hondamarine.co.nz/sitemap.xml"}'

Expected output: JSON with `success: true` and an array of URLs, or an error if sitemap is blocked/missing.

### Step 3: Create URL patterns module

Working directory: `/Users/Development/Honda Price Update`

Create file `src/crawler/url-patterns.ts`:

    // Exclusion patterns - pages to skip during crawl
    export const EXCLUSION_PATTERNS: string[] = [
      'about', 'about-us', 'contact', 'contact-us',
      'finance', 'financing', 'why-honda',
      'find-a-dealer', 'dealers', 'find-a-store', 'stores',
      'privacy', 'privacy-policy', 'terms', 'terms-and-conditions',
      'careers', 'jobs', 'news', 'blog', 'articles',
      'faq', 'faqs', 'help', 'support', 'service', 'servicing',
      'warranty', 'warranties',
      'category', 'categories', 'collection', 'collections', 'range', 'ranges',
      'search', 'cart', 'checkout', 'login', 'account', 'register',
      'sitemap', '404'
    ];

    export function matchesExclusionPattern(url: string): boolean {
      const path = new URL(url).pathname.toLowerCase();
      return EXCLUSION_PATTERNS.some(pattern =>
        path.includes(`/${pattern}`) || path === `/${pattern}`
      );
    }

    export function isLikelyProductPage(url: string, html: string): boolean {
      // Check for price indicators
      const hasPriceElement = /class="[^"]*price[^"]*"/.test(html);
      const hasAddToCart = /add.to.cart|add-to-cart|addtocart/i.test(html);
      const hasProductSchema = /"@type"\s*:\s*"Product"/.test(html);

      return hasPriceElement || hasAddToCart || hasProductSchema;
    }

    export function isOfferPage(url: string): boolean {
      const path = new URL(url).pathname.toLowerCase();
      return /\/(offers?|promotions?|specials?|deals?|sale)\//i.test(path);
    }

### Step 4: Create link extractor

Create file `src/crawler/link-extractor.ts`:

    export function extractLinks(html: string, baseUrl: string): string[] {
      const links: string[] = [];
      const baseUrlObj = new URL(baseUrl);

      // Match href attributes
      const hrefRegex = /href=["']([^"']+)["']/gi;
      let match;

      while ((match = hrefRegex.exec(html)) !== null) {
        try {
          const href = match[1];
          // Skip anchors, javascript, mailto
          if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
            continue;
          }

          // Resolve relative URLs
          const absoluteUrl = new URL(href, baseUrl);

          // Only include same-domain links
          if (absoluteUrl.hostname === baseUrlObj.hostname) {
            links.push(absoluteUrl.href);
          }
        } catch {
          // Invalid URL, skip
        }
      }

      return [...new Set(links)]; // Deduplicate
    }

### Step 5: Create crawler orchestrator

Create file `src/crawler/crawler-orchestrator.ts`:

    import { scraplingClient, ScrapeResult } from '../scraper/scrapling-client.js';
    import { canonicalize } from '../utils/canonicalize.js';
    import { extractLinks } from './link-extractor.js';
    import { matchesExclusionPattern, isLikelyProductPage, isOfferPage } from './url-patterns.js';
    import { logger } from '../utils/logger.js';

    const CRAWL_CONFIG = {
      minDelayBetweenRequests: 30000,  // 30 seconds minimum
      maxDelayBetweenRequests: 60000,  // 60 seconds maximum
      delayBetweenSites: 300000,       // 5 minutes between sites
      maxConcurrentRequests: 1,        // Sequential only
      maxPagesPerSite: 500,            // Safety limit
    };

    export interface CrawlOptions {
      maxPagesPerSite?: number;
      sites?: string[];
    }

    export interface DiscoveredUrl {
      url: string;
      urlCanonical: string;
      domain: string;
      pageTitle?: string;
      detectedPrice?: number;
      isOffer: boolean;
    }

    export interface CrawlResult {
      runId: number;
      urlsDiscovered: number;
      newProductsFound: number;
      newOffersFound: number;
      discoveries: DiscoveredUrl[];
    }

    const HONDA_SITES = [
      'https://www.hondamotorbikes.co.nz',
      'https://www.hondaoutdoors.co.nz',
      'https://www.hondamarine.co.nz',
    ];

    export class CrawlerOrchestrator {
      private visited: Set<string> = new Set();
      private discoveries: DiscoveredUrl[] = [];

      async crawl(options?: CrawlOptions): Promise<CrawlResult> {
        const sites = options?.sites
          ? HONDA_SITES.filter(s => options.sites!.some(site => s.includes(site)))
          : HONDA_SITES;
        const maxPages = options?.maxPagesPerSite ?? CRAWL_CONFIG.maxPagesPerSite;

        this.visited.clear();
        this.discoveries = [];

        for (let i = 0; i < sites.length; i++) {
          const site = sites[i];
          logger.info(`Starting crawl of ${site}`);

          await this.crawlSite(site, maxPages);

          // Delay between sites (except after last)
          if (i < sites.length - 1) {
            await this.sleep(CRAWL_CONFIG.delayBetweenSites);
          }
        }

        return {
          runId: 0, // Set by caller after DB insert
          urlsDiscovered: this.visited.size,
          newProductsFound: this.discoveries.filter(d => !d.isOffer).length,
          newOffersFound: this.discoveries.filter(d => d.isOffer).length,
          discoveries: this.discoveries,
        };
      }

      private async crawlSite(baseUrl: string, maxPages: number): Promise<void> {
        const queue: string[] = [baseUrl];
        let pagesVisited = 0;
        const domain = new URL(baseUrl).hostname;

        while (queue.length > 0 && pagesVisited < maxPages) {
          const url = queue.shift()!;
          const canonical = canonicalize(url);

          if (this.visited.has(canonical)) continue;
          this.visited.add(canonical);

          // Skip excluded pages
          if (matchesExclusionPattern(url)) {
            logger.debug(`Skipping excluded URL: ${url}`);
            continue;
          }

          // Random delay
          const delay = CRAWL_CONFIG.minDelayBetweenRequests +
            Math.random() * (CRAWL_CONFIG.maxDelayBetweenRequests - CRAWL_CONFIG.minDelayBetweenRequests);
          await this.sleep(delay);

          // Fetch page
          const result = await scraplingClient.scrape(url);
          if (!result.success) {
            logger.warn(`Failed to fetch ${url}: ${result.error}`);
            continue;
          }

          pagesVisited++;

          // Extract and queue new links
          const links = extractLinks(result.html, url);
          for (const link of links) {
            const linkCanonical = canonicalize(link);
            if (!this.visited.has(linkCanonical) && !queue.includes(link)) {
              queue.push(link);
            }
          }

          // Check if this is a product or offer page
          const isOffer = isOfferPage(url);
          const isProduct = !isOffer && isLikelyProductPage(url, result.html);

          if (isProduct || isOffer) {
            this.discoveries.push({
              url,
              urlCanonical: canonical,
              domain,
              isOffer,
            });
          }

          logger.info(`Crawled ${pagesVisited}/${maxPages}: ${url}`);
        }
      }

      private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    }

### Step 6: Create new product detector

Create file `src/crawler/new-product-detector.ts`:

    import { pool } from '../database/connection.js';
    import { DiscoveredUrl } from './crawler-orchestrator.js';

    export class NewProductDetector {
      private existingCanonicalUrls: Set<string> = new Set();

      async loadExistingUrls(): Promise<void> {
        const result = await pool.query(
          'SELECT source_url_canonical FROM shopify_catalog_cache WHERE source_url_canonical IS NOT NULL'
        );
        this.existingCanonicalUrls = new Set(result.rows.map(r => r.source_url_canonical));
      }

      async detectNewProducts(discoveries: DiscoveredUrl[]): Promise<DiscoveredUrl[]> {
        await this.loadExistingUrls();

        return discoveries.filter(d =>
          !d.isOffer && !this.existingCanonicalUrls.has(d.urlCanonical)
        );
      }
    }

### Step 7: Create database queries

Add to `src/database/queries.ts`:

    // Crawl discovery queries
    export async function createCrawlRun(sites: string[]): Promise<number> {
      const result = await pool.query(
        'INSERT INTO crawl_runs (sites_crawled) VALUES ($1) RETURNING id',
        [sites]
      );
      return result.rows[0].id;
    }

    export async function updateCrawlRun(
      id: number,
      updates: {
        status?: string;
        completed_at?: Date;
        urls_discovered?: number;
        new_products_found?: number;
        new_offers_found?: number;
        error_message?: string;
      }
    ): Promise<void> {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length > 0) {
        values.push(id);
        await pool.query(
          `UPDATE crawl_runs SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
      }
    }

    export async function insertDiscoveredProduct(
      crawlRunId: number,
      product: {
        url: string;
        urlCanonical: string;
        domain: string;
        pageTitle?: string;
        detectedPrice?: number;
      }
    ): Promise<void> {
      await pool.query(
        `INSERT INTO discovered_products
         (crawl_run_id, url, url_canonical, domain, page_title, detected_price)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (url_canonical) DO UPDATE SET
           crawl_run_id = EXCLUDED.crawl_run_id,
           page_title = COALESCE(EXCLUDED.page_title, discovered_products.page_title),
           detected_price = COALESCE(EXCLUDED.detected_price, discovered_products.detected_price)`,
        [crawlRunId, product.url, product.urlCanonical, product.domain, product.pageTitle, product.detectedPrice]
      );
    }

    export async function getDiscoveredProducts(status?: string): Promise<any[]> {
      const query = status
        ? 'SELECT * FROM discovered_products WHERE status = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM discovered_products ORDER BY created_at DESC';
      const result = await pool.query(query, status ? [status] : []);
      return result.rows;
    }

    export async function updateDiscoveredProductStatus(
      id: number,
      status: string,
      reviewedBy?: string
    ): Promise<void> {
      await pool.query(
        'UPDATE discovered_products SET status = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE id = $3',
        [status, reviewedBy, id]
      );
    }

### Step 8: Create API endpoints

Create file `src/api/crawler-api.ts`:

    import express from 'express';
    import { CrawlerOrchestrator } from '../crawler/crawler-orchestrator.js';
    import { NewProductDetector } from '../crawler/new-product-detector.js';
    import * as queries from '../database/queries.js';
    import { logger } from '../utils/logger.js';

    export const crawlerRouter = express.Router();

    // POST /api/crawl - Trigger manual crawl
    crawlerRouter.post('/crawl', async (req, res) => {
      try {
        const sites = req.query.sites ? String(req.query.sites).split(',') : undefined;
        const maxPages = req.query.maxPages ? parseInt(String(req.query.maxPages)) : undefined;

        // Create crawl run record
        const runId = await queries.createCrawlRun(sites || ['motorbikes', 'outdoors', 'marine']);

        // Run crawl asynchronously
        const orchestrator = new CrawlerOrchestrator();
        orchestrator.crawl({ sites, maxPagesPerSite: maxPages })
          .then(async (result) => {
            // Detect new products
            const detector = new NewProductDetector();
            const newProducts = await detector.detectNewProducts(result.discoveries);

            // Save discoveries to database
            for (const product of newProducts) {
              await queries.insertDiscoveredProduct(runId, product);
            }

            // Update crawl run
            await queries.updateCrawlRun(runId, {
              status: 'completed',
              completed_at: new Date(),
              urls_discovered: result.urlsDiscovered,
              new_products_found: newProducts.length,
              new_offers_found: result.discoveries.filter(d => d.isOffer).length,
            });

            logger.info(`Crawl ${runId} completed: ${newProducts.length} new products found`);
          })
          .catch(async (error) => {
            await queries.updateCrawlRun(runId, {
              status: 'failed',
              error_message: error.message,
            });
            logger.error(`Crawl ${runId} failed: ${error.message}`);
          });

        res.json({ runId, status: 'started' });
      } catch (error) {
        logger.error('Failed to start crawl', error);
        res.status(500).json({ error: 'Failed to start crawl' });
      }
    });

    // GET /api/crawl/status/:runId - Get crawl status
    crawlerRouter.get('/crawl/status/:runId', async (req, res) => {
      try {
        const result = await pool.query(
          'SELECT * FROM crawl_runs WHERE id = $1',
          [req.params.runId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Crawl run not found' });
        }
        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get crawl status' });
      }
    });

    // GET /api/crawl/results - Get discovered products
    crawlerRouter.get('/crawl/results', async (req, res) => {
      try {
        const status = req.query.status as string | undefined;
        const products = await queries.getDiscoveredProducts(status);
        res.json(products);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get results' });
      }
    });

    // POST /api/crawl/review/:productId - Review discovered product
    crawlerRouter.post('/crawl/review/:productId', async (req, res) => {
      try {
        const { status, reviewedBy } = req.body;
        if (!['reviewed', 'ignored', 'added'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        await queries.updateDiscoveredProductStatus(
          parseInt(req.params.productId),
          status,
          reviewedBy
        );
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update review status' });
      }
    });

### Step 9: Register API routes

Edit `src/server.ts` to add:

    import { crawlerRouter } from './api/crawler-api.js';

    // Add after existing route registrations:
    app.use('/api', crawlerRouter);

### Step 10: Create weekly scheduler job

Create file `src/scheduler/weekly-crawler-job.ts`:

    import cron from 'node-cron';
    import { CrawlerOrchestrator } from '../crawler/crawler-orchestrator.js';
    import { NewProductDetector } from '../crawler/new-product-detector.js';
    import * as queries from '../database/queries.js';
    import { logger } from '../utils/logger.js';

    // Run every Sunday at 2 AM NZ time (14:00 UTC Saturday)
    export function scheduleWeeklyCrawl(): void {
      cron.schedule('0 14 * * 6', async () => {
        logger.info('Starting scheduled weekly crawl');

        try {
          const runId = await queries.createCrawlRun(['motorbikes', 'outdoors', 'marine']);
          const orchestrator = new CrawlerOrchestrator();
          const result = await orchestrator.crawl();

          const detector = new NewProductDetector();
          const newProducts = await detector.detectNewProducts(result.discoveries);

          for (const product of newProducts) {
            await queries.insertDiscoveredProduct(runId, product);
          }

          await queries.updateCrawlRun(runId, {
            status: 'completed',
            completed_at: new Date(),
            urls_discovered: result.urlsDiscovered,
            new_products_found: newProducts.length,
            new_offers_found: result.discoveries.filter(d => d.isOffer).length,
          });

          logger.info(`Weekly crawl completed: ${newProducts.length} new products found`);
        } catch (error) {
          logger.error('Weekly crawl failed', error);
        }
      }, {
        timezone: 'Pacific/Auckland'
      });

      logger.info('Weekly crawler job scheduled for Sundays at 2 AM NZ time');
    }

## Validation and Acceptance

**Unit test validation**: Run `npm test` after implementation. New tests should cover:
- URL pattern exclusion matching (info pages excluded, product pages included)
- Canonicalization consistency with existing `canonicalize.ts`
- Link extraction from sample HTML

**Integration test**:
1. Start the Python service: `cd python-scraper && python server.py`
2. Start the Node server: `npm run dev`
3. Trigger a limited crawl: `curl -X POST "http://localhost:3000/api/crawl?sites=marine&maxPages=5"`
4. Check status: `curl "http://localhost:3000/api/crawl/status/1"`
5. View results: `curl "http://localhost:3000/api/crawl/results"`

Expected: The crawl completes, discovers URLs from hondamarine.co.nz, and any URLs not in `shopify_catalog_cache.source_url_canonical` appear in `discovered_products` with status "pending".

**Database verification**:

    SELECT COUNT(*) FROM crawl_runs WHERE status = 'completed';
    -- Should be >= 1

    SELECT domain, COUNT(*) FROM discovered_products GROUP BY domain;
    -- Should show counts per domain

    SELECT dp.url_canonical FROM discovered_products dp
    WHERE dp.status = 'pending'
    AND dp.url_canonical NOT IN (
      SELECT source_url_canonical FROM shopify_catalog_cache
      WHERE source_url_canonical IS NOT NULL
    );
    -- Should return only genuinely new URLs

## Idempotence and Recovery

The migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so it can be run multiple times safely.

The `discovered_products` table has a unique constraint on `url_canonical`, so re-crawling the same URLs will not create duplicates. The orchestrator uses `INSERT ... ON CONFLICT DO UPDATE` to update existing records.

If a crawl fails midway, the `crawl_runs` record will have status "running" with no `completed_at`. A cleanup function should mark stale runs (running for >2 hours) as "failed" before starting new crawls.

Rate limiting (30-60 second delays) ensures the crawler does not trigger bot protection even if run multiple times.

## Interfaces and Dependencies

**Python Service** (`python-scraper/server.py`):

New endpoint:

    POST /sitemap
    Request: {"url": "https://example.com/sitemap.xml"}
    Response: {"success": true, "urls": ["...", "..."], "count": 42}

**TypeScript Modules**:

In `src/crawler/url-patterns.ts`:

    export const EXCLUSION_PATTERNS: string[];
    export function matchesExclusionPattern(url: string): boolean;
    export function isLikelyProductPage(url: string, html: string): boolean;
    export function isOfferPage(url: string): boolean;

In `src/crawler/link-extractor.ts`:

    export function extractLinks(html: string, baseUrl: string): string[];

In `src/crawler/crawler-orchestrator.ts`:

    export interface CrawlOptions {
      maxPagesPerSite?: number;
      sites?: string[];
    }

    export interface DiscoveredUrl {
      url: string;
      urlCanonical: string;
      domain: string;
      pageTitle?: string;
      detectedPrice?: number;
      isOffer: boolean;
    }

    export interface CrawlResult {
      runId: number;
      urlsDiscovered: number;
      newProductsFound: number;
      newOffersFound: number;
      discoveries: DiscoveredUrl[];
    }

    export class CrawlerOrchestrator {
      async crawl(options?: CrawlOptions): Promise<CrawlResult>;
    }

In `src/crawler/new-product-detector.ts`:

    export class NewProductDetector {
      async loadExistingUrls(): Promise<void>;
      async detectNewProducts(discoveries: DiscoveredUrl[]): Promise<DiscoveredUrl[]>;
    }

**Database Queries** (add to `src/database/queries.ts`):

    export async function createCrawlRun(sites: string[]): Promise<number>;
    export async function updateCrawlRun(id: number, updates: Partial<CrawlRun>): Promise<void>;
    export async function insertDiscoveredProduct(crawlRunId: number, product: DiscoveredProduct): Promise<void>;
    export async function getDiscoveredProducts(status?: string): Promise<DiscoveredProduct[]>;
    export async function updateDiscoveredProductStatus(id: number, status: string, reviewedBy?: string): Promise<void>;

## Artifacts and Notes

**Rate Limiting Configuration** (critical for avoiding bot detection):

    const CRAWL_CONFIG = {
      minDelayBetweenRequests: 30000,  // 30 seconds minimum
      maxDelayBetweenRequests: 60000,  // 60 seconds maximum
      delayBetweenSites: 300000,       // 5 minutes between sites
      maxConcurrentRequests: 1,        // Sequential only
      maxPagesPerSite: 500,            // Safety limit
    };

**Exclusion Patterns** (pages to skip):

    about, about-us, contact, contact-us, finance, financing,
    why-honda, find-a-dealer, dealers, find-a-store, stores,
    privacy, privacy-policy, terms, terms-and-conditions,
    careers, jobs, news, blog, articles, faq, faqs, help,
    support, service, servicing, warranty, warranties,
    category, categories, collection, collections, range, ranges,
    search, cart, checkout, login, account, register, sitemap, 404

**Offer URL Patterns** (regex):

    /\/offers?\//i
    /\/promotions?\//i
    /\/specials?\//i
    /\/deals?\//i
    /\/sale\//i
