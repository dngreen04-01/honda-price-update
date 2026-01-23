/**
 * Supplier Re-scrape API
 * Endpoints for triggering batch re-scrape of all products from a specific supplier
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { getShopifyCatalogCache } from '../database/queries.js';
import { scraplingClient } from '../scraper/scrapling-client.js';
import { priceExtractor } from '../scraper/price-extractor.js';
import { scraperOrchestrator } from '../scraper/scraper-orchestrator.js';

// Domain mapping for each supplier
const SUPPLIER_DOMAINS = {
  motorbikes: 'hondamotorbikes.co.nz',
  outdoors: 'hondaoutdoors.co.nz',
  marine: 'hondamarine.co.nz',
} as const;

type SupplierType = keyof typeof SUPPLIER_DOMAINS;

// Configuration for rate limiting
const RESCRAPE_CONFIG = {
  delayBetweenRequestsMs: 2000, // 2 seconds between requests
  requestTimeoutMs: 60000, // 60 seconds per request
};

// Job interface
export interface SupplierRescrapeJob {
  id: string;
  supplier: SupplierType;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  total: number;
  current: number;
  success: number;
  failed: number;
  priceChanges: number;
  errors: Array<{ url: string; error: string }>;
}

// In-memory job storage (sufficient for single-instance server)
const activeJobs = new Map<string, SupplierRescrapeJob>();

// Track running jobs by supplier to prevent concurrent jobs
const runningSuppliers = new Set<SupplierType>();

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  return `rescrape_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/supplier-rescrape
 * Start a batch re-scrape for all products from a specific supplier
 */
export async function handleStartSupplierRescrape(req: Request, res: Response): Promise<void> {
  try {
    const { supplier } = req.body as { supplier?: string };

    // Validate supplier
    if (!supplier || !Object.keys(SUPPLIER_DOMAINS).includes(supplier)) {
      res.status(400).json({
        success: false,
        message: `Invalid supplier. Must be one of: ${Object.keys(SUPPLIER_DOMAINS).join(', ')}`,
      });
      return;
    }

    const supplierType = supplier as SupplierType;

    // Check if a job is already running for this supplier
    if (runningSuppliers.has(supplierType)) {
      res.status(409).json({
        success: false,
        message: `A re-scrape is already running for ${supplier}`,
      });
      return;
    }

    // Get products for this supplier
    const allProducts = await getShopifyCatalogCache();
    const domain = SUPPLIER_DOMAINS[supplierType];
    const supplierProducts = allProducts.filter(
      (p) => p.source_url_canonical?.includes(domain)
    );

    if (supplierProducts.length === 0) {
      res.status(404).json({
        success: false,
        message: `No products found for supplier: ${supplier}`,
      });
      return;
    }

    // Create job
    const jobId = generateJobId();
    const job: SupplierRescrapeJob = {
      id: jobId,
      supplier: supplierType,
      status: 'running',
      startedAt: new Date().toISOString(),
      total: supplierProducts.length,
      current: 0,
      success: 0,
      failed: 0,
      priceChanges: 0,
      errors: [],
    };

    activeJobs.set(jobId, job);
    runningSuppliers.add(supplierType);

    logger.info('Starting supplier re-scrape', {
      jobId,
      supplier,
      productCount: supplierProducts.length,
    });

    // Return immediately with job ID
    res.json({
      success: true,
      jobId,
      message: `Re-scrape started for ${supplierProducts.length} products from Honda ${supplier}. Poll GET /api/supplier-rescrape/${jobId} for status.`,
    });

    // Run re-scrape asynchronously
    runSupplierRescrapeAsync(job, supplierProducts);
  } catch (error) {
    logger.error('Failed to start supplier re-scrape', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to start supplier re-scrape',
    });
  }
}

/**
 * GET /api/supplier-rescrape/:jobId
 * Get status of a supplier re-scrape job
 */
export async function handleGetSupplierRescrapeStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const jobId = req.params.jobId as string;

    const job = activeJobs.get(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Job not found. Jobs are only stored in memory during the session.',
      });
      return;
    }

    res.json({
      success: true,
      job,
    });
  } catch (error) {
    logger.error('Failed to get supplier re-scrape status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get job status',
    });
  }
}

/**
 * Run the batch re-scrape asynchronously
 */
async function runSupplierRescrapeAsync(
  job: SupplierRescrapeJob,
  products: Array<{ source_url_canonical?: string | null; scraped_sale_price?: number | null }>
): Promise<void> {
  try {
    for (const product of products) {
      const url = product.source_url_canonical;
      if (!url) {
        job.current++;
        continue;
      }

      const oldPrice = product.scraped_sale_price ?? null;

      try {
        // Restore www. subdomain for scraping (Honda sites require it)
        let scrapeUrl = url;
        try {
          const urlObj = new URL(url);
          if (!urlObj.hostname.startsWith('www.')) {
            urlObj.hostname = `www.${urlObj.hostname}`;
            scrapeUrl = urlObj.toString();
          }
        } catch {
          scrapeUrl = url;
        }

        // Scrape the page
        const scrapeResult = await scraplingClient.scrape(scrapeUrl);

        if (!scrapeResult.success) {
          job.failed++;
          job.errors.push({ url, error: 'Failed to scrape page' });
          job.current++;
          logger.warn('Scrape failed for URL', { url, jobId: job.id });
          continue;
        }

        // Skip if redirected to category page (likely discontinued)
        if (
          scrapeResult.redirectDetected &&
          scrapeResult.redirectType === 'category'
        ) {
          job.failed++;
          job.errors.push({ url, error: 'Redirected to category page (likely discontinued)' });
          job.current++;
          logger.warn('URL redirected to category', { url, jobId: job.id });
          continue;
        }

        // Extract price from HTML
        const priceResult = await priceExtractor.extract(scrapeUrl, scrapeResult.html);

        if (priceResult.salePrice === null) {
          job.failed++;
          job.errors.push({ url, error: 'Could not extract price from page' });
          job.current++;
          logger.warn('Price extraction failed', { url, jobId: job.id });
          continue;
        }

        // Store the scraped product
        await scraperOrchestrator.storeProducts([
          {
            url: scrapeUrl,
            success: true,
            salePrice: priceResult.salePrice,
            originalPrice: priceResult.originalPrice,
            confidence: priceResult.confidence === 'high' ? 1 : 0.5,
          },
        ]);

        // Check if price changed
        const priceChanged = oldPrice !== priceResult.salePrice;
        if (priceChanged) {
          job.priceChanges++;
        }

        job.success++;
        job.current++;

        logger.debug('Scraped product successfully', {
          url,
          jobId: job.id,
          oldPrice,
          newPrice: priceResult.salePrice,
          priceChanged,
        });
      } catch (error) {
        job.failed++;
        job.errors.push({
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        job.current++;

        logger.error('Error scraping product', {
          url,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Rate limiting - wait before next request
      if (job.current < job.total) {
        await sleep(RESCRAPE_CONFIG.delayBetweenRequestsMs);
      }
    }

    // Mark job as completed
    job.status = 'completed';
    job.completedAt = new Date().toISOString();

    logger.info('Supplier re-scrape completed', {
      jobId: job.id,
      supplier: job.supplier,
      total: job.total,
      success: job.success,
      failed: job.failed,
      priceChanges: job.priceChanges,
      durationMs: new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime(),
    });
  } catch (error) {
    job.status = 'failed';
    job.completedAt = new Date().toISOString();

    logger.error('Supplier re-scrape failed', {
      jobId: job.id,
      supplier: job.supplier,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Remove from running suppliers set
    runningSuppliers.delete(job.supplier);

    // Keep job in activeJobs for 1 hour for status queries, then clean up
    setTimeout(() => {
      activeJobs.delete(job.id);
    }, 3600000);
  }
}
