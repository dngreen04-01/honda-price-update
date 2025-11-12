import { getShopifyCatalogCache, updateScrapedPrices } from '../database/queries.js';
import { logger } from '../utils/logger.js';
import { puppeteerClient } from './puppeteer-client.js';
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
   * Scrape products from Shopify catalog
   */
  async scrapeProducts(urls: string[], options: { concurrency?: number } = {}): Promise<Array<{
    url: string;
    success: boolean;
    salePrice: number | null;
    originalPrice: number | null;
    confidence: number;
  }>> {
    logger.info('Scraping products with Bright Data', {
      count: urls.length,
      concurrency: options.concurrency || 3,
    });

    const results = await puppeteerClient.scrapeUrls(urls, options);

    const processedResults = results.map(result => {
      if (result.success && result.html) {
        const priceResult = puppeteerClient.extractPrice(result.url, result.html);

        return {
          url: result.url,
          success: true,
          salePrice: priceResult.salePrice,
          originalPrice: priceResult.originalPrice,
          confidence: priceResult.confidence,
        };
      }

      return {
        url: result.url,
        success: false,
        salePrice: null,
        originalPrice: null,
        confidence: 0,
      };
    });

    return processedResults;
  }

  /**
   * Store scraped products in database
   */
  async storeProducts(products: Array<{
    url: string;
    success: boolean;
    salePrice: number | null;
    originalPrice: number | null;
    confidence: number;
  }>): Promise<void> {
    logger.info('Storing scraped products', { count: products.length });

    for (const product of products) {
      if (!product.success) {
        continue;
      }

      try {
        // Canonicalize URL for database matching (removes www.)
        const canonicalUrl = canonicalizeUrl(product.url);

        // Update shopify_catalog_cache with scraped prices
        await updateScrapedPrices(
          canonicalUrl,
          product.salePrice,
          product.originalPrice,
          product.confidence
        );

        logger.info('Product scraped and stored', {
          url: product.url,
          canonicalUrl,
          salePrice: product.salePrice,
          originalPrice: product.originalPrice,
          confidence: product.confidence,
        });

      } catch (error) {
        logger.error('Failed to store product', {
          url: product.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Product storage completed', { count: products.length });
  }

  /**
   * Run complete scrape for all Shopify products
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
}

export const scraperOrchestrator = new ScraperOrchestrator();
