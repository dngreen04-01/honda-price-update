import { logger } from '../utils/logger.js';
import { scraperOrchestrator } from '../scraper/scraper-orchestrator.js';
import { getShopifyCatalogCache } from '../database/queries.js';

/**
 * API handler for bulk scraping products without supplier prices
 */

export interface BulkScrapeRequest {
  concurrency?: number; // Number of concurrent scrapes (default: 3)
  limit?: number; // Maximum number of products to scrape (optional)
}

export interface BulkScrapeResponse {
  success: boolean;
  message: string;
  data?: {
    totalEligible: number;
    totalScraped: number;
    successfulExtractions: number;
    failedExtractions: number;
    duration: number; // seconds
  };
}

/**
 * Bulk scrape products that have a source URL but no scraped price
 * This is useful for initial population or catching up on missing prices
 */
export async function handleBulkScrape(
  request: BulkScrapeRequest = {}
): Promise<BulkScrapeResponse> {
  const startTime = Date.now();
  const concurrency = request.concurrency || 3;
  const limit = request.limit;

  logger.info('Bulk scrape requested', { concurrency, limit });

  try {
    // Get all products from catalog
    const catalog = await getShopifyCatalogCache();

    // Filter for products that:
    // 1. Have a source URL
    // 2. Don't have a scraped price yet
    const eligibleProducts = catalog.filter(p => {
      const hasUrl = !!p.source_url_canonical;
      const hasScrapedPrice = !!(p as any).scraped_sale_price;
      return hasUrl && !hasScrapedPrice;
    });

    logger.info('Found eligible products for bulk scrape', {
      totalInCatalog: catalog.length,
      eligibleProducts: eligibleProducts.length,
      withoutUrl: catalog.filter(p => !p.source_url_canonical).length,
      alreadyScraped: catalog.filter(p => !!(p as any).scraped_sale_price).length,
    });

    if (eligibleProducts.length === 0) {
      return {
        success: true,
        message: 'No products need scraping. All products with URLs already have prices.',
        data: {
          totalEligible: 0,
          totalScraped: 0,
          successfulExtractions: 0,
          failedExtractions: 0,
          duration: (Date.now() - startTime) / 1000,
        },
      };
    }

    // Apply limit if specified
    const productsToScrape = limit
      ? eligibleProducts.slice(0, limit)
      : eligibleProducts;

    logger.info('Starting bulk scrape', {
      productsToScrape: productsToScrape.length,
      limited: !!limit,
    });

    // Extract URLs and restore www. subdomain for scraping
    const urls = productsToScrape.map(p => {
      const url = p.source_url_canonical;
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

    // Scrape all URLs
    const scrapeResults = await scraperOrchestrator.scrapeProducts(urls, {
      concurrency,
    });

    // Store results
    await scraperOrchestrator.storeProducts(scrapeResults);

    // Calculate stats
    const successfulExtractions = scrapeResults.filter(r => r.success).length;
    const failedExtractions = scrapeResults.filter(r => !r.success).length;
    const duration = (Date.now() - startTime) / 1000;

    logger.info('Bulk scrape completed', {
      totalEligible: eligibleProducts.length,
      totalScraped: productsToScrape.length,
      successfulExtractions,
      failedExtractions,
      successRate: `${((successfulExtractions / productsToScrape.length) * 100).toFixed(1)}%`,
      duration: `${duration.toFixed(2)}s`,
    });

    return {
      success: true,
      message: `Bulk scrape completed. ${successfulExtractions} of ${productsToScrape.length} products scraped successfully.`,
      data: {
        totalEligible: eligibleProducts.length,
        totalScraped: productsToScrape.length,
        successfulExtractions,
        failedExtractions,
        duration,
      },
    };

  } catch (error) {
    logger.error('Bulk scrape failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      message: `Bulk scrape failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
