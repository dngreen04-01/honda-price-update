/**
 * Crawler API
 * Endpoints for triggering crawls and managing discovered products/offers
 */

import { Request, Response } from 'express';
import { crawlerOrchestrator } from '../crawler/crawler-orchestrator.js';
import { NewProductDetector } from '../crawler/new-product-detector.js';
import { OfferDetector, DiscoveredOffer } from '../crawler/offer-detector.js';
import * as queries from '../database/queries.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/crawl
 * Trigger a manual crawl of Honda NZ websites
 */
export async function handleStartCrawl(req: Request, res: Response): Promise<void> {
  try {
    // Check if crawl is already running
    if (crawlerOrchestrator.isCurrentlyRunning()) {
      res.status(409).json({
        success: false,
        message: 'A crawl is already in progress',
      });
      return;
    }

    // Parse options from query params
    const sites = req.query.sites ? String(req.query.sites).split(',') : undefined;
    const maxPages = req.query.maxPages ? parseInt(String(req.query.maxPages), 10) : undefined;

    // Create crawl run record
    const siteNames = sites || ['motorbikes', 'outdoors', 'marine'];
    const runId = await queries.createCrawlRun(siteNames);

    // Return immediately with run ID (crawl runs asynchronously)
    res.json({
      success: true,
      runId,
      status: 'started',
      message: 'Crawl started. Use GET /api/crawl/status/:runId to check progress.',
    });

    // Run crawl asynchronously
    runCrawlAsync(runId, { sites, maxPagesPerSite: maxPages });
  } catch (error) {
    logger.error('Failed to start crawl', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to start crawl',
    });
  }
}

/**
 * Run crawl asynchronously and update database with results
 */
async function runCrawlAsync(
  runId: number,
  options?: { sites?: string[]; maxPagesPerSite?: number }
): Promise<void> {
  try {
    // Execute the crawl
    const result = await crawlerOrchestrator.crawl(options);

    // Separate products and offers
    const productDiscoveries = result.discoveries.filter((d) => !d.isOffer);
    const offerDiscoveries = result.discoveries.filter((d) => d.isOffer);

    // Detect new products (not already in Shopify catalog)
    const productDetector = new NewProductDetector();
    const detectionResult = await productDetector.detectNewProducts(productDiscoveries);
    const newProducts = detectionResult.newProducts;

    // Save new products to discovered_products table
    for (const product of newProducts) {
      await queries.insertDiscoveredProduct(runId, product);
    }

    // Process and save discovered offers
    const offerDetector = new OfferDetector();
    const offersToSave: DiscoveredOffer[] = offerDiscoveries.map((d) => ({
      url: d.url,
      urlCanonical: d.urlCanonical,
      domain: d.domain,
      title: d.offerTitle || d.pageTitle || 'Untitled Offer',
      summary: d.offerSummary,
      startDate: d.offerStartDate,
      endDate: d.offerEndDate,
    }));

    const offerResult = await offerDetector.processOffers(offersToSave);

    // Update crawl run with results
    await queries.updateCrawlRun(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      urls_discovered: result.urlsDiscovered,
      new_products_found: newProducts.length,
      new_offers_found: offerResult.savedCount,
    });

    logger.info('Crawl completed successfully', {
      runId,
      urlsDiscovered: result.urlsDiscovered,
      newProductsFound: newProducts.length,
      newOffersFound: offerResult.savedCount,
      durationMinutes: Math.round(result.durationMs / 60000),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update crawl run with error
    await queries.updateCrawlRun(runId, {
      status: 'failed',
      error_message: errorMessage,
    });

    logger.error('Crawl failed', {
      runId,
      error: errorMessage,
    });
  }
}

/**
 * GET /api/crawl/status/:runId
 * Get status of a specific crawl run
 */
export async function handleGetCrawlStatus(req: Request, res: Response): Promise<void> {
  try {
    const runId = parseInt(req.params.runId, 10);

    if (isNaN(runId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid run ID',
      });
      return;
    }

    const crawlRun = await queries.getCrawlRun(runId);

    if (!crawlRun) {
      res.status(404).json({
        success: false,
        message: 'Crawl run not found',
      });
      return;
    }

    // Add real-time progress if still running
    let progress = undefined;
    if (crawlRun.status === 'running' && crawlerOrchestrator.isCurrentlyRunning()) {
      progress = {
        visitedUrls: crawlerOrchestrator.getVisitedCount(),
        discoveries: crawlerOrchestrator.getDiscoveryCount(),
      };
    }

    res.json({
      success: true,
      crawlRun,
      progress,
    });
  } catch (error) {
    logger.error('Failed to get crawl status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get crawl status',
    });
  }
}

/**
 * GET /api/crawl/results
 * Get discovered products, optionally filtered by status
 */
export async function handleGetCrawlResults(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const products = await queries.getDiscoveredProducts(status);

    res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    logger.error('Failed to get crawl results', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get crawl results',
    });
  }
}

/**
 * GET /api/crawl/offers
 * Get discovered offers
 */
export async function handleGetOffers(req: Request, res: Response): Promise<void> {
  try {
    const domainId = req.query.domainId ? parseInt(String(req.query.domainId), 10) : undefined;
    const offers = await queries.getAllOffers(domainId);

    res.json({
      success: true,
      count: offers.length,
      offers,
    });
  } catch (error) {
    logger.error('Failed to get offers', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get offers',
    });
  }
}

/**
 * POST /api/crawl/review/:productId
 * Review a discovered product (approve, ignore, or add to tracking)
 */
export async function handleReviewProduct(req: Request, res: Response): Promise<void> {
  try {
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
      return;
    }

    const { status, reviewedBy } = req.body;

    if (!['reviewed', 'ignored', 'added'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: reviewed, ignored, added',
      });
      return;
    }

    await queries.updateDiscoveredProductStatus(productId, status, reviewedBy);

    res.json({
      success: true,
      message: `Product ${productId} marked as ${status}`,
    });
  } catch (error) {
    logger.error('Failed to review product', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to review product',
    });
  }
}

/**
 * GET /api/crawl/runs
 * Get recent crawl runs
 */
export async function handleGetCrawlRuns(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
    const runs = await queries.getRecentCrawlRuns(limit);

    res.json({
      success: true,
      count: runs.length,
      runs,
    });
  } catch (error) {
    logger.error('Failed to get crawl runs', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get crawl runs',
    });
  }
}

/**
 * GET /api/crawl/stats
 * Get statistics about discovered products
 */
export async function handleGetCrawlStats(_req: Request, res: Response): Promise<void> {
  try {
    const counts = await queries.getDiscoveredProductCounts();

    res.json({
      success: true,
      stats: counts,
    });
  } catch (error) {
    logger.error('Failed to get crawl stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get crawl stats',
    });
  }
}
