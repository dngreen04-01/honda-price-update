/**
 * Crawler API
 * Endpoints for triggering crawls and managing discovered products/offers
 */

import { Request, Response } from 'express';
import { crawlerOrchestrator, DiscoveredUrl, BatchStats } from '../crawler/crawler-orchestrator.js';
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
 * Run crawl asynchronously with incremental batch saves
 * Saves discoveries every 50 items or 10 minutes to prevent data loss
 */
async function runCrawlAsync(
  runId: number,
  options?: { sites?: string[]; maxPagesPerSite?: number }
): Promise<void> {
  // Track totals for products and offers saved across all batches
  let totalProductsSaved = 0;
  let totalOffersSaved = 0;

  // Initialize detectors once (they cache existing URLs)
  const productDetector = new NewProductDetector();
  const offerDetector = new OfferDetector();

  /**
   * Batch save callback - called every 50 discoveries or 10 minutes
   * Saves discoveries incrementally to database and updates crawl_run progress
   */
  const handleBatchSave = async (discoveries: DiscoveredUrl[], stats: BatchStats): Promise<void> => {
    // Separate products and offers
    const productDiscoveries = discoveries.filter((d) => !d.isOffer);
    const offerDiscoveries = discoveries.filter((d) => d.isOffer);

    // Save products
    if (productDiscoveries.length > 0) {
      const detectionResult = await productDetector.detectNewProducts(productDiscoveries);
      for (const product of detectionResult.newProducts) {
        await queries.insertDiscoveredProduct(runId, product);
      }
      totalProductsSaved += detectionResult.newProducts.length;

      logger.info('Batch: saved products', {
        runId,
        batchProducts: detectionResult.newProducts.length,
        totalProductsSaved,
      });
    }

    // Save offers
    if (offerDiscoveries.length > 0) {
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
      totalOffersSaved += offerResult.savedCount;

      logger.info('Batch: saved offers', {
        runId,
        batchOffers: offerResult.savedCount,
        totalOffersSaved,
      });
    }

    // Update crawl_run with progress (partial results)
    await queries.updateCrawlRun(runId, {
      urls_discovered: stats.totalVisited,
      new_products_found: totalProductsSaved,
      new_offers_found: totalOffersSaved,
    });

    logger.info('Batch save progress updated', {
      runId,
      urlsVisited: stats.totalVisited,
      totalProductsSaved,
      totalOffersSaved,
    });
  };

  try {
    // Execute the crawl with incremental batch saves
    const result = await crawlerOrchestrator.crawl({
      ...options,
      onBatchReady: handleBatchSave,
      batchSize: 50,           // Save every 50 discoveries
      batchIntervalMs: 600000, // Or every 10 minutes
    });

    // Flush any remaining unsaved discoveries
    await crawlerOrchestrator.flushRemainingDiscoveries();

    // Final update - mark as completed
    await queries.updateCrawlRun(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      urls_discovered: result.urlsDiscovered,
      new_products_found: totalProductsSaved,
      new_offers_found: totalOffersSaved,
    });

    logger.info('Crawl completed successfully', {
      runId,
      urlsDiscovered: result.urlsDiscovered,
      newProductsFound: totalProductsSaved,
      newOffersFound: totalOffersSaved,
      durationMinutes: Math.round(result.durationMs / 60000),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update crawl run with error - but keep any products/offers already saved!
    await queries.updateCrawlRun(runId, {
      status: 'failed',
      error_message: errorMessage,
      // Preserve the products/offers saved before failure
      new_products_found: totalProductsSaved,
      new_offers_found: totalOffersSaved,
    });

    logger.error('Crawl failed', {
      runId,
      error: errorMessage,
      // Important: log what was saved before failure
      productsSavedBeforeFailure: totalProductsSaved,
      offersSavedBeforeFailure: totalOffersSaved,
    });
  }
}

/**
 * GET /api/crawl/status/:runId
 * Get status of a specific crawl run
 */
export async function handleGetCrawlStatus(req: Request, res: Response): Promise<void> {
  try {
    const runId = parseInt(req.params.runId as string, 10);

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
    const productId = parseInt(req.params.productId as string, 10);

    if (isNaN(productId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
      return;
    }

    const { status, reviewedBy } = req.body;

    if (!['pending', 'reviewed', 'ignored', 'added'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, reviewed, ignored, added',
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

/**
 * GET /api/crawl/duplicates
 * Find duplicate discoveries that share the same product ID
 */
export async function handleFindDuplicates(_req: Request, res: Response): Promise<void> {
  try {
    const duplicates = await queries.findDuplicateDiscoveries();

    res.json({
      success: true,
      duplicateCount: duplicates.length,
      duplicates,
    });
  } catch (error) {
    logger.error('Failed to find duplicate discoveries', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to find duplicate discoveries',
    });
  }
}

/**
 * DELETE /api/crawl/duplicates
 * Remove duplicate discoveries, keeping the one with shortest URL for each product ID
 */
export async function handleCleanupDuplicates(req: Request, res: Response): Promise<void> {
  try {
    // Check for dry run mode
    const dryRun = req.query.dryRun === 'true';

    // Find all duplicates
    const duplicates = await queries.findDuplicateDiscoveries();

    if (duplicates.length === 0) {
      res.json({
        success: true,
        message: 'No duplicates found',
        duplicatesFound: 0,
        deletedCount: 0,
      });
      return;
    }

    if (dryRun) {
      // Just return what would be deleted
      res.json({
        success: true,
        dryRun: true,
        duplicatesFound: duplicates.length,
        message: `Would delete ${duplicates.length} duplicate discoveries`,
        duplicates: duplicates.map((d) => ({
          id: d.id,
          productId: d.product_id,
          url: d.url,
        })),
      });
      return;
    }

    // Delete all duplicates
    const idsToDelete = duplicates.map((d) => d.id);
    const deletedCount = await queries.deleteDiscoveredProductsByIds(idsToDelete);

    logger.info('Cleaned up duplicate discoveries', {
      duplicatesFound: duplicates.length,
      deletedCount,
    });

    res.json({
      success: true,
      duplicatesFound: duplicates.length,
      deletedCount,
      message: `Deleted ${deletedCount} duplicate discoveries`,
    });
  } catch (error) {
    logger.error('Failed to cleanup duplicate discoveries', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup duplicate discoveries',
    });
  }
}
