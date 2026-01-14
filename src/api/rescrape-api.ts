import { logger } from '../utils/logger.js';
import { scraperOrchestrator } from '../scraper/scraper-orchestrator.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';
import { getShopifyCatalogCache } from '../database/queries.js';

/**
 * API handler for re-scraping individual product URLs
 * Uses the Scrapling service for anti-bot scraping
 */

export interface RescrapeRequest {
  url: string;
}

export interface RescrapeResponse {
  success: boolean;
  message: string;
  data?: {
    url: string;
    oldPrice: number | null;
    newPrice: number | null;
    priceChanged: boolean;
  };
}

/**
 * Re-scrape a single product URL to get fresh price data
 * Uses Scrapling service for bot protection bypass
 */
export async function handleRescrape(
  request: RescrapeRequest
): Promise<RescrapeResponse> {
  logger.info('Re-scrape requested', { url: request.url });

  try {
    // Validate request
    if (!request.url || !request.url.startsWith('http')) {
      return {
        success: false,
        message: 'Invalid URL provided',
      };
    }

    // Canonicalize URL for database lookup
    const canonicalUrl = canonicalizeUrl(request.url);

    // Get the old price from database before re-scraping
    const catalog = await getShopifyCatalogCache();
    const existingProduct = catalog.find(p => p.source_url_canonical === canonicalUrl);
    const oldPrice = (existingProduct as any)?.scraped_sale_price || null;

    logger.info('Found existing product in catalog', {
      url: request.url,
      canonicalUrl,
      oldPrice,
      productTitle: (existingProduct as any)?.product_title,
    });

    // Restore www. subdomain for scraping (Honda sites require it)
    let scrapeUrl = request.url;
    try {
      const urlObj = new URL(request.url);
      if (!urlObj.hostname.startsWith('www.')) {
        urlObj.hostname = `www.${urlObj.hostname}`;
        scrapeUrl = urlObj.toString();
      }
    } catch {
      // If URL parsing fails, use original
      scrapeUrl = request.url;
    }

    logger.info('Starting fresh scrape with Scrapling', {
      originalUrl: request.url,
      scrapeUrl,
      canonicalUrl,
    });

    // Scrape using Scrapling service
    const scrapeResults = await scraperOrchestrator.scrapeProducts([scrapeUrl], {
      concurrency: 1, // Single URL
    });

    if (!scrapeResults || scrapeResults.length === 0) {
      return {
        success: false,
        message: 'Failed to scrape URL. The scraper returned no results.',
      };
    }

    const result = scrapeResults[0];

    if (!result.success || !result.salePrice) {
      const errorDetails = {
        url: request.url,
        scrapeUrl,
        success: result.success,
        salePrice: result.salePrice,
        confidence: result.confidence,
      };

      logger.error('Scrape failed or no price found', errorDetails);

      // Build detailed error message
      let errorMessage = 'Failed to extract price from URL. ';

      if (!result.success) {
        errorMessage += 'The scraper could not retrieve the page content. This may indicate bot protection or network issues.';
      } else if (result.salePrice === null) {
        errorMessage += `The page was retrieved successfully, but no price could be extracted (confidence: ${result.confidence}). `;
        errorMessage += 'The price selectors may need updating for this product page.';
      }

      return {
        success: false,
        message: errorMessage,
      };
    }

    logger.info('Scrape successful, storing results', {
      url: request.url,
      scrapeUrl,
      salePrice: result.salePrice,
      originalPrice: result.originalPrice,
      confidence: result.confidence,
    });

    // Store the scraped product in the database
    await scraperOrchestrator.storeProducts([result]);

    // Get the updated price from database
    const updatedCatalog = await getShopifyCatalogCache();
    const updatedProduct = updatedCatalog.find(p => p.source_url_canonical === canonicalUrl);
    const newPrice = (updatedProduct as any)?.scraped_sale_price || null;
    const priceChanged = oldPrice !== newPrice;

    logger.info('Re-scrape completed', {
      url: request.url,
      canonicalUrl,
      oldPrice,
      newPrice,
      priceChanged,
    });

    return {
      success: true,
      message: priceChanged
        ? `Price updated from $${oldPrice?.toFixed(2) || 'N/A'} to $${newPrice?.toFixed(2) || 'N/A'}`
        : `Price unchanged at $${newPrice?.toFixed(2) || 'N/A'}`,
      data: {
        url: request.url,
        oldPrice,
        newPrice,
        priceChanged,
      },
    };
  } catch (error) {
    logger.error('Re-scrape failed', {
      url: request.url,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      message: `Re-scrape failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
