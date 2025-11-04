import { firecrawlClient } from './firecrawl-client.js';
import { priceExtractor } from './price-extractor.js';
import { getActiveDomains, upsertProductPage, insertPriceHistory, upsertOffer } from '../database/queries.js';
import { canonicalizeUrl, isDomainMatch } from '../utils/canonicalize.js';
import { logger } from '../utils/logger.js';
import { ScrapedProduct } from '../types/index.js';

/**
 * Main scraper orchestrator
 */
export class ScraperOrchestrator {
  /**
   * Discover product URLs on a domain
   */
  async discoverProducts(domainUrl: string): Promise<string[]> {
    logger.info('Discovering products', { domainUrl });

    try {
      // Use Firecrawl Map to discover all URLs
      const mapResult = await firecrawlClient.map(domainUrl, {
        search: 'product',
        limit: 5000,
      });

      if (!mapResult.success) {
        throw new Error('Firecrawl Map failed');
      }

      // Filter for product pages
      // Honda sites use simple slug-based URLs: domain.com/{slug}
      // Exclude: pages with multiple path segments, system pages, category pages
      const productUrls = mapResult.links.filter(url => {
        if (!isDomainMatch(url, domainUrl)) {
          return false;
        }

        try {
          const urlObj = new URL(url);
          const pathname = urlObj.pathname;

          // Exclude system/utility pages
          const excludePatterns = [
            '/cart',
            '/checkout',
            '/account',
            '/search',
            '/collections',
            '/pages',
            '/blogs',
            '/blog',
            '/news',
            '/about',
            '/contact',
            '/category',
            '/categories',
            '/terms',
            '/privacy',
            '/shipping',
            '/returns',
            '/offers',
            '/recalls',
            '/product-enquiry',
            '/warranty',
            '/honda-advantage',
            '/store',
            '/part-',
            '/bike-servicing-repairs',
            '/bikes-accessories',
            '/trailers-machinery',
          ];

          // Also exclude "category-like" single-word paths (common on Honda sites)
          const categoryLikePaths = [
            'cordless',
            'generators',
            'versatool',
            'lawnmowers',
            'brushcutters',
            'outboards',
            'motorcycles',
            'scooters',
            'cruiser-bikes',
            'adventure-bikes',
            'touring-bikes',
            'sport-bikes',
            'naked-bikes',
            'off-road-bikes',
          ];

          const excludeMatch = excludePatterns.find(pattern => pathname.includes(pattern));
          if (excludeMatch) {
            return false;
          }

          // Include: simple product URLs with single path segment
          // e.g., /gb350, /bf40, /eu70is-32amp-plug-with-auto-start
          // Also include: /honda-genuine-accessories/{sku}
          const pathSegments = pathname.split('/').filter(s => s.length > 0);

          // Exclude category-like paths (single segment that looks like a category)
          if (pathSegments.length === 1 && categoryLikePaths.includes(pathSegments[0])) {
            return false;
          }

          // Accept URLs with 1 or 2 path segments (e.g., /product or /category/product)
          if (pathSegments.length >= 1 && pathSegments.length <= 2) {
            return true;
          }

          return false;
        } catch (error) {
          return false;
        }
      });

      logger.info('Product discovery completed', {
        domainUrl,
        totalUrls: mapResult.links.length,
        productUrls: productUrls.length,
      });

      return productUrls;
    } catch (error) {
      logger.error('Product discovery failed', {
        domainUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Scrape products from a list of URLs
   */
  async scrapeProducts(urls: string[]): Promise<ScrapedProduct[]> {
    logger.info('Scraping products', { count: urls.length });

    const scrapedProducts: ScrapedProduct[] = [];

    // Batch scrape URLs
    const scrapeResults = await firecrawlClient.batchScrape(urls, {
      formats: ['html'],
      onlyMainContent: true,
    });

    for (const result of scrapeResults) {
      if (!result.success) {
        logger.warn('Failed to scrape product', { url: result.url, error: result.error });
        continue;
      }

      try {
        // Extract price
        const extractedPrice = await priceExtractor.extract(result.url, result.html);

        // Canonicalize URL
        const canonicalUrl = canonicalizeUrl(result.url);

        scrapedProducts.push({
          url: result.url,
          canonicalUrl,
          extractedPrice,
        });

        logger.debug('Product scraped successfully', {
          url: result.url,
          canonicalUrl,
          salePrice: extractedPrice.salePrice,
          confidence: extractedPrice.confidence,
          source: extractedPrice.source,
        });
      } catch (error) {
        logger.error('Failed to extract price', {
          url: result.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Product scraping completed', {
      total: urls.length,
      successful: scrapedProducts.length,
      failed: urls.length - scrapedProducts.length,
    });

    return scrapedProducts;
  }

  /**
   * Store scraped products in database
   */
  async storeProducts(domainId: number, products: ScrapedProduct[]): Promise<void> {
    logger.info('Storing scraped products', { domainId, count: products.length });

    for (const product of products) {
      try {
        // Upsert product page
        const productPage = await upsertProductPage(
          domainId,
          product.canonicalUrl,
          product.extractedPrice.salePrice,
          product.extractedPrice.originalPrice,
          product.extractedPrice.currency,
          product.extractedPrice.confidence,
          product.extractedPrice.htmlSnippet || null
        );

        // Insert price history
        await insertPriceHistory(
          productPage.id,
          product.extractedPrice.salePrice,
          product.extractedPrice.originalPrice,
          product.extractedPrice.currency,
          product.extractedPrice.source,
          product.extractedPrice.confidence,
          product.extractedPrice.htmlSnippet || null
        );

        logger.debug('Product stored', {
          productPageId: productPage.id,
          canonicalUrl: product.canonicalUrl,
        });
      } catch (error) {
        logger.error('Failed to store product', {
          canonicalUrl: product.canonicalUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Product storage completed', { domainId, count: products.length });
  }

  /**
   * Scrape offers from a domain
   */
  async scrapeOffers(domainId: number, domainUrl: string): Promise<number> {
    logger.info('Scraping offers', { domainId, domainUrl });

    try {
      // Common offer page paths
      const offerPaths = [
        '/offers',
        '/promotions',
        '/deals',
        '/specials',
        '/sale',
      ];

      let offersFound = 0;

      for (const path of offerPaths) {
        const offerUrl = `${domainUrl}${path}`;

        try {
          const scrapeResult = await firecrawlClient.scrape(offerUrl);

          if (!scrapeResult.success) {
            continue;
          }

          // Extract offers using LLM
          const extractResult = await firecrawlClient.extract<{
            offers: Array<{
              title: string;
              summary?: string;
              startDate?: string;
              endDate?: string;
              url: string;
            }>;
          }>(offerUrl, {
            type: 'object',
            properties: {
              offers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    summary: { type: 'string' },
                    startDate: { type: 'string' },
                    endDate: { type: 'string' },
                    url: { type: 'string' },
                  },
                  required: ['title', 'url'],
                },
              },
            },
          }, {
            prompt: 'Extract promotional offers with titles, summaries, dates, and URLs',
          });

          if (extractResult.success && extractResult.data.offers) {
            for (const offer of extractResult.data.offers) {
              await upsertOffer(
                domainId,
                offer.title,
                offer.summary || null,
                offer.startDate || null,
                offer.endDate || null,
                offer.url
              );
              offersFound++;
            }
          }
        } catch (error) {
          logger.debug('Offer page not found or failed', { offerUrl });
        }
      }

      logger.info('Offer scraping completed', { domainId, offersFound });

      return offersFound;
    } catch (error) {
      logger.error('Failed to scrape offers', {
        domainId,
        domainUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Run complete scrape for all active domains
   */
  async runFullScrape(): Promise<{
    totalProducts: number;
    successfulExtractions: number;
    offersFound: number;
  }> {
    logger.info('Starting full scrape');

    const domains = await getActiveDomains();
    let totalProducts = 0;
    let successfulExtractions = 0;
    let offersFound = 0;

    for (const domain of domains) {
      try {
        logger.info('Processing domain', { domainId: domain.id, rootUrl: domain.root_url });

        // 1. Discover products
        const productUrls = await this.discoverProducts(domain.root_url);
        totalProducts += productUrls.length;

        // 2. Scrape products
        const scrapedProducts = await this.scrapeProducts(productUrls);
        successfulExtractions += scrapedProducts.length;

        // 3. Store products
        await this.storeProducts(domain.id, scrapedProducts);

        // 4. Scrape offers
        const domainOffers = await this.scrapeOffers(domain.id, domain.root_url);
        offersFound += domainOffers;

        logger.info('Domain processing completed', {
          domainId: domain.id,
          products: scrapedProducts.length,
          offers: domainOffers,
        });
      } catch (error) {
        logger.error('Failed to process domain', {
          domainId: domain.id,
          rootUrl: domain.root_url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Full scrape completed', {
      totalProducts,
      successfulExtractions,
      offersFound,
      successRate: totalProducts > 0
        ? ((successfulExtractions / totalProducts) * 100).toFixed(2) + '%'
        : '0%',
    });

    return {
      totalProducts,
      successfulExtractions,
      offersFound,
    };
  }
}

export const scraperOrchestrator = new ScraperOrchestrator();
