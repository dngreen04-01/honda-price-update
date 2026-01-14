import { getShopifyCatalogCache, updateScrapedPrices } from '../database/queries.js';
import { logger } from '../utils/logger.js';
import { scraplingClient } from './scrapling-client.js';
import { priceExtractor } from './price-extractor.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';

/**
 * Simplified scraper orchestrator
 *
 * Strategy: Scrape URLs directly from Shopify catalog
 * - Source: shopify_catalog_cache.source_url_canonical
 * - These are products that exist in Shopify with custom.source_url metafield
 * - No discovery needed - just scrape known URLs
 */
export class ScraperOrchestrator {
  /**
   * Scrape products from Shopify catalog using Scrapling service
   */
  async scrapeProducts(urls: string[], options: { concurrency?: number } = {}): Promise<Array<{
    url: string;
    success: boolean;
    salePrice: number | null;
    originalPrice: number | null;
    confidence: number;
  }>> {
    logger.info('Scraping products with Scrapling', {
      count: urls.length,
      concurrency: options.concurrency || 3,
    });

    const results = await scraplingClient.scrapeUrls(urls, options);

    // Process results sequentially since priceExtractor.extract is async
    const processedResults: Array<{
      url: string;
      success: boolean;
      salePrice: number | null;
      originalPrice: number | null;
      confidence: number;
    }> = [];

    for (const result of results) {
      if (result.success && result.html) {
        const priceResult = await priceExtractor.extract(result.url, result.html);

        processedResults.push({
          url: result.url,
          success: true,
          salePrice: priceResult.salePrice,
          originalPrice: priceResult.originalPrice,
          confidence: priceResult.confidence === 'high' ? 1 : 0.5,
        });
      } else {
        processedResults.push({
          url: result.url,
          success: false,
          salePrice: null,
          originalPrice: null,
          confidence: 0,
        });
      }
    }

    return processedResults;
  }

  /**
   * Store scraped products in database
   * Returns count of products that were actually updated in the database
   */
  async storeProducts(products: Array<{
    url: string;
    success: boolean;
    salePrice: number | null;
    originalPrice: number | null;
    confidence: number;
  }>): Promise<{ attempted: number; dbUpdated: number; notFound: number; errors: number }> {
    logger.info('Storing scraped products', { count: products.length });

    let dbUpdated = 0;
    let notFound = 0;
    let errors = 0;
    let attempted = 0;

    for (const product of products) {
      if (!product.success) {
        continue;
      }

      attempted++;

      try {
        // Canonicalize URL for database matching (removes www.)
        const canonicalUrl = canonicalizeUrl(product.url);

        // Update shopify_catalog_cache with scraped prices
        const result = await updateScrapedPrices(
          canonicalUrl,
          product.salePrice,
          product.originalPrice,
          product.confidence
        );

        if (result.updated) {
          dbUpdated++;
          logger.info('Product scraped and stored', {
            url: product.url,
            canonicalUrl,
            salePrice: product.salePrice,
            originalPrice: product.originalPrice,
            confidence: product.confidence,
          });
        } else {
          notFound++;
          logger.warn('Product scraped but NOT FOUND in database', {
            url: product.url,
            canonicalUrl,
            salePrice: product.salePrice,
          });
        }

      } catch (error) {
        errors++;
        logger.error('Failed to store product', {
          url: product.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Product storage completed', {
      attempted,
      dbUpdated,
      notFound,
      errors,
      updateRate: attempted > 0 ? `${((dbUpdated / attempted) * 100).toFixed(1)}%` : '0%',
    });

    return { attempted, dbUpdated, notFound, errors };
  }

  /**
   * Run complete scrape for all Shopify products
   * Note: This method accumulates all results in memory before storing.
   * For large catalogs, use runFullScrapeStreaming() instead.
   */
  async runFullScrape(options: { concurrency?: number } = {}): Promise<{
    totalProducts: number;
    successfulExtractions: number;
    failedExtractions: number;
  }> {
    logger.info('Starting full scrape from Shopify catalog');

    // 1. Load all Shopify products with source URLs
    const shopifyProducts = await getShopifyCatalogCache();

    // 2. Filter products that have source URLs
    const productsWithUrls = shopifyProducts.filter(p => p.source_url_canonical);

    logger.info('Shopify products loaded', {
      total: shopifyProducts.length,
      withUrls: productsWithUrls.length,
      withoutUrls: shopifyProducts.length - productsWithUrls.length,
    });

    if (productsWithUrls.length === 0) {
      logger.warn('No products with source URLs found. Run refresh-shopify-cache first.');
      return {
        totalProducts: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
      };
    }

    // 3. Extract URLs and restore www. subdomain for scraping
    const urls = productsWithUrls.map(p => {
      const url = p.source_url_canonical;
      // Restore www. subdomain if missing (Honda sites require it)
      try {
        const urlObj = new URL(url);
        if (!urlObj.hostname.startsWith('www.')) {
          urlObj.hostname = `www.${urlObj.hostname}`;
          return urlObj.toString();
        }
        return url;
      } catch {
        return url;
      }
    });

    // 4. Scrape all URLs
    const scrapedProducts = await this.scrapeProducts(urls, options);

    // 5. Store results
    await this.storeProducts(scrapedProducts);

    // 6. Calculate stats
    const successfulExtractions = scrapedProducts.filter(p => p.success).length;
    const failedExtractions = scrapedProducts.filter(p => !p.success).length;

    logger.info('Full scrape completed', {
      totalProducts: urls.length,
      successfulExtractions,
      failedExtractions,
      successRate: `${((successfulExtractions / urls.length) * 100).toFixed(1)}%`,
    });

    return {
      totalProducts: urls.length,
      successfulExtractions,
      failedExtractions,
    };
  }

  /**
   * Run complete scrape with streaming batch processing.
   *
   * Memory-efficient approach that processes URLs in batches,
   * storing results to the database after each batch and releasing
   * memory before processing the next batch.
   *
   * Recommended for large catalogs (100+ URLs) to avoid memory exhaustion.
   */
  async runFullScrapeStreaming(options: {
    concurrency?: number;
    batchSize?: number;
    onBatchComplete?: (batch: number, total: number, stats: { success: number; failed: number }) => void;
  } = {}): Promise<{
    totalProducts: number;
    successfulExtractions: number;
    failedExtractions: number;
    batchesProcessed: number;
  }> {
    const batchSize = options.batchSize ?? 25;
    const concurrency = options.concurrency ?? 2;

    logger.info('Starting streaming scrape from Shopify catalog', {
      batchSize,
      concurrency,
    });

    // 1. Load all Shopify products with source URLs
    const shopifyProducts = await getShopifyCatalogCache();

    // 2. Filter products that have source URLs
    const productsWithUrls = shopifyProducts.filter(p => p.source_url_canonical);

    logger.info('Shopify products loaded', {
      total: shopifyProducts.length,
      withUrls: productsWithUrls.length,
      withoutUrls: shopifyProducts.length - productsWithUrls.length,
    });

    if (productsWithUrls.length === 0) {
      logger.warn('No products with source URLs found. Run refresh-shopify-cache first.');
      return {
        totalProducts: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        batchesProcessed: 0,
      };
    }

    // 3. Extract URLs and restore www. subdomain for scraping
    const urls = productsWithUrls.map(p => {
      const url = p.source_url_canonical;
      // Restore www. subdomain if missing (Honda sites require it)
      try {
        const urlObj = new URL(url);
        if (!urlObj.hostname.startsWith('www.')) {
          urlObj.hostname = `www.${urlObj.hostname}`;
          return urlObj.toString();
        }
        return url;
      } catch {
        return url;
      }
    });

    // 4. Process URLs in batches with immediate storage
    const totalBatches = Math.ceil(urls.length / batchSize);
    let totalSuccess = 0;
    let totalFailed = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, urls.length);
      const batchUrls = urls.slice(start, end);
      const batchNumber = batchIndex + 1;

      logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
        batchNumber,
        totalBatches,
        batchSize: batchUrls.length,
        startIndex: start,
        endIndex: end - 1,
      });

      // 4a. Scrape this batch
      const batchResults = await this.scrapeProducts(batchUrls, { concurrency });

      // 4b. Store results immediately
      await this.storeProducts(batchResults);

      // 4c. Calculate batch stats
      const batchSuccess = batchResults.filter(p => p.success).length;
      const batchFailed = batchResults.filter(p => !p.success).length;
      totalSuccess += batchSuccess;
      totalFailed += batchFailed;

      logger.info(`Batch ${batchNumber}/${totalBatches} completed and stored`, {
        batchNumber,
        totalBatches,
        batchSuccess,
        batchFailed,
        runningTotalSuccess: totalSuccess,
        runningTotalFailed: totalFailed,
        progressPercent: `${((end / urls.length) * 100).toFixed(1)}%`,
      });

      // 4d. Call progress callback if provided
      if (options.onBatchComplete) {
        options.onBatchComplete(batchNumber, totalBatches, {
          success: batchSuccess,
          failed: batchFailed,
        });
      }

      // 4e. Memory is automatically released as batchResults goes out of scope
      // Add a small delay between batches to allow GC and avoid overwhelming the service
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 5. Final stats
    const successRate = urls.length > 0
      ? ((totalSuccess / urls.length) * 100).toFixed(1)
      : '0.0';

    logger.info('Streaming scrape completed', {
      totalProducts: urls.length,
      successfulExtractions: totalSuccess,
      failedExtractions: totalFailed,
      successRate: `${successRate}%`,
      batchesProcessed: totalBatches,
    });

    return {
      totalProducts: urls.length,
      successfulExtractions: totalSuccess,
      failedExtractions: totalFailed,
      batchesProcessed: totalBatches,
    };
  }
}

export const scraperOrchestrator = new ScraperOrchestrator();
