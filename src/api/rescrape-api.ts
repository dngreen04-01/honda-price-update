import { logger } from '../utils/logger.js';
import { scraperOrchestrator } from '../scraper/scraper-orchestrator.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';
import {
  getShopifyCatalogCache,
  getShopifyCatalogById,
  updateProductSourceUrl,
  markProductDiscontinued,
} from '../database/queries.js';
import { scraplingClient, RedirectType } from '../scraper/scrapling-client.js';
import { priceExtractor } from '../scraper/price-extractor.js';
import { analyzeRedirect, formatRedirectInfo } from '../utils/redirect-detector.js';
import { shopifyClient } from '../shopify/client.js';

/**
 * API handler for re-scraping individual product URLs
 * Uses the Scrapling service for anti-bot scraping
 */

export interface RescrapeRequest {
  url: string;
}

export interface RedirectInfo {
  detected: boolean;
  originalUrl: string;
  finalUrl: string;
  redirectType: RedirectType;
  likelyDiscontinued: boolean;
  suggestedAction: 'update_url' | 'mark_discontinued' | 'none';
  message: string;
}

export interface RescrapeResponse {
  success: boolean;
  message: string;
  data?: {
    url: string;
    oldPrice: number | null;
    newPrice: number | null;
    priceChanged: boolean;
    productId?: number;
  };
  redirectInfo?: RedirectInfo;
}

/**
 * Re-scrape a single product URL to get fresh price data
 * Uses Scrapling service for bot protection bypass
 * Detects redirects to category pages (indicating discontinued products)
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
    const productId = (existingProduct as any)?.id || null;

    logger.info('Found existing product in catalog', {
      url: request.url,
      canonicalUrl,
      oldPrice,
      productId,
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

    // Scrape using Scrapling client directly to get redirect info
    const scrapeResult = await scraplingClient.scrape(scrapeUrl);

    if (!scrapeResult.success) {
      return {
        success: false,
        message: 'Failed to scrape URL. The scraper could not retrieve the page content. This may indicate bot protection or network issues.',
      };
    }

    // Analyze redirect information
    const redirectAnalysis = analyzeRedirect(
      scrapeUrl,
      scrapeResult.finalUrl,
      scrapeResult.redirectDetected,
      scrapeResult.redirectType
    );

    const redirectInfo = formatRedirectInfo(redirectAnalysis);

    // If redirect to category page detected, return early with redirect info
    if (redirectAnalysis.isRedirect && redirectAnalysis.redirectType === 'category') {
      logger.warn('Category redirect detected - product likely discontinued', {
        url: request.url,
        scrapeUrl,
        finalUrl: scrapeResult.finalUrl,
        redirectType: scrapeResult.redirectType,
      });

      return {
        success: false,
        message: redirectAnalysis.message,
        data: productId ? {
          url: request.url,
          oldPrice,
          newPrice: null,
          priceChanged: false,
          productId,
        } : undefined,
        redirectInfo,
      };
    }

    // Extract price from the HTML
    const priceResult = await priceExtractor.extract(scrapeUrl, scrapeResult.html);

    if (priceResult.salePrice === null) {
      const errorMessage = `The page was retrieved successfully, but no price could be extracted (confidence: ${priceResult.confidence}). The price selectors may need updating for this product page.`;

      logger.error('Price extraction failed', {
        url: request.url,
        scrapeUrl,
        confidence: priceResult.confidence,
        redirectDetected: scrapeResult.redirectDetected,
        finalUrl: scrapeResult.finalUrl,
      });

      return {
        success: false,
        message: errorMessage,
        redirectInfo,
      };
    }

    logger.info('Scrape successful, storing results', {
      url: request.url,
      scrapeUrl,
      salePrice: priceResult.salePrice,
      originalPrice: priceResult.originalPrice,
      confidence: priceResult.confidence,
      redirectDetected: scrapeResult.redirectDetected,
      finalUrl: scrapeResult.finalUrl,
    });

    // Store the scraped product in the database
    await scraperOrchestrator.storeProducts([{
      url: scrapeUrl,
      success: true,
      salePrice: priceResult.salePrice,
      originalPrice: priceResult.originalPrice,
      confidence: priceResult.confidence === 'high' ? 1 : 0.5,
    }]);

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
      redirectDetected: scrapeResult.redirectDetected,
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
        productId,
      },
      redirectInfo,
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

/**
 * Request type for updating a product URL
 */
export interface UpdateProductUrlRequest {
  productId: number;
  action: 'update_url' | 'mark_discontinued' | 'ignore';
  newUrl?: string;
  archiveOnShopify?: boolean; // If true, also archive the product on Shopify
}

/**
 * Response type for product URL updates
 */
export interface UpdateProductUrlResponse {
  success: boolean;
  message: string;
}

/**
 * Handle user's decision after redirect detection
 * Allows updating the URL or marking the product as discontinued
 */
export async function handleUpdateProductUrl(
  request: UpdateProductUrlRequest
): Promise<UpdateProductUrlResponse> {
  logger.info('Update product URL requested', {
    productId: request.productId,
    action: request.action,
    newUrl: request.newUrl,
  });

  try {
    // Validate request
    if (!request.productId || typeof request.productId !== 'number') {
      return {
        success: false,
        message: 'Invalid product ID provided',
      };
    }

    if (!['update_url', 'mark_discontinued', 'ignore'].includes(request.action)) {
      return {
        success: false,
        message: 'Invalid action. Must be one of: update_url, mark_discontinued, ignore',
      };
    }

    // Get the product to verify it exists
    const product = await getShopifyCatalogById(request.productId);

    if (!product) {
      return {
        success: false,
        message: `Product with ID ${request.productId} not found`,
      };
    }

    // Handle the action
    switch (request.action) {
      case 'update_url': {
        if (!request.newUrl || !request.newUrl.startsWith('http')) {
          return {
            success: false,
            message: 'Invalid new URL provided. URL must start with http:// or https://',
          };
        }

        // Canonicalize the new URL
        const canonicalNewUrl = canonicalizeUrl(request.newUrl);

        const result = await updateProductSourceUrl(request.productId, canonicalNewUrl);

        if (!result.updated) {
          return {
            success: false,
            message: 'Failed to update product URL',
          };
        }

        logger.info('Product URL updated successfully', {
          productId: request.productId,
          oldUrl: product.source_url_canonical,
          newUrl: canonicalNewUrl,
        });

        return {
          success: true,
          message: `Product URL updated to ${canonicalNewUrl}. The product will be scraped with the new URL on the next scrape cycle.`,
        };
      }

      case 'mark_discontinued': {
        const result = await markProductDiscontinued(
          request.productId,
          'Product redirected to category page - marked as discontinued by user'
        );

        if (!result.updated) {
          return {
            success: false,
            message: 'Failed to mark product as discontinued',
          };
        }

        logger.info('Product marked as discontinued', {
          productId: request.productId,
          previousUrl: product.source_url_canonical,
          shopifyProductId: result.shopifyProductId,
        });

        // Archive on Shopify if requested
        let shopifyArchived = false;
        let shopifyError: string | undefined;

        if (request.archiveOnShopify && result.shopifyProductId) {
          try {
            const archiveResult = await shopifyClient.updateProductStatus(
              result.shopifyProductId,
              'ARCHIVED'
            );

            if (archiveResult.success) {
              shopifyArchived = true;
              logger.info('Product archived on Shopify', {
                productId: request.productId,
                shopifyProductId: result.shopifyProductId,
              });
            } else {
              shopifyError = archiveResult.errors.join(', ');
              logger.warn('Failed to archive product on Shopify', {
                productId: request.productId,
                shopifyProductId: result.shopifyProductId,
                errors: archiveResult.errors,
              });
            }
          } catch (error) {
            shopifyError = error instanceof Error ? error.message : String(error);
            logger.error('Error archiving product on Shopify', {
              productId: request.productId,
              shopifyProductId: result.shopifyProductId,
              error: shopifyError,
            });
          }
        }

        // Build response message
        let message = 'Product has been marked as discontinued and removed from the scraping list.';
        if (request.archiveOnShopify) {
          if (shopifyArchived) {
            message += ' The product has also been archived on Shopify.';
          } else if (shopifyError) {
            message += ` However, failed to archive on Shopify: ${shopifyError}`;
          } else if (!result.shopifyProductId) {
            message += ' Could not archive on Shopify: no Shopify product ID found.';
          }
        }

        return {
          success: true,
          message,
        };
      }

      case 'ignore': {
        logger.info('User chose to ignore redirect warning', {
          productId: request.productId,
          url: product.source_url_canonical,
        });

        return {
          success: true,
          message: 'No action taken. The product URL remains unchanged.',
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown action',
        };
    }
  } catch (error) {
    // Extract error message from various error types (Error, Supabase error object, etc.)
    const errorMessage = error instanceof Error
      ? error.message
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as { message: unknown }).message)
        : String(error);

    logger.error('Update product URL failed', {
      productId: request.productId,
      action: request.action,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      message: `Update failed: ${errorMessage}`,
    };
  }
}
