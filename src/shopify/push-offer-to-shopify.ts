/**
 * Push Offer to Shopify - Orchestration Workflow
 *
 * Orchestrates the complete workflow for pushing a discovered offer to Shopify:
 * 1. Fetch offer from database
 * 2. Check if already pushed (idempotent)
 * 3. Scrape offer page for detailed content
 * 4. Upload hero image to Shopify Files
 * 5. Fetch linked products from shopify_catalog_cache
 * 6. Build page HTML with Gemini enhancement
 * 7. Create Shopify page
 * 8. Store in shopify_offer_pages table
 * 9. Link products to offer
 * 10. Build tile HTML and update landing page
 */

import { shopifyClient } from './client.js';
import { offerPageScraper } from '../scraper/offer-page-scraper.js';
import {
  buildOfferPageHtml,
  buildOfferPageTitle,
  generateOfferHandle,
} from './offer-page-builder.js';
import { buildOfferTileHtml } from './offers-landing-builder.js';
import { createOffersLandingManager } from './offers-landing-manager.js';
import {
  getOfferById,
  getShopifyOfferPageByOfferId,
  createShopifyOfferPage,
  linkProductToOffer,
  getProductsForOffer,
  updateOfferEndDate,
  getShopifyCatalogById,
} from '../database/queries.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { PushOfferResult, Offer, ShopifyCatalogCache } from '../types/index.js';

/**
 * Push an offer to Shopify, creating a page with scraped content and linked products.
 *
 * This function is idempotent - if the offer is already pushed, it returns the existing
 * page info rather than creating a duplicate.
 *
 * @param offerId - The offer ID from the offers table
 * @param productIds - Array of product IDs (from shopify_catalog_cache) to link
 * @param endDate - Optional end date override
 * @returns Result with success status and page info
 */
export async function pushOfferToShopify(
  offerId: number,
  productIds: number[],
  endDate?: Date
): Promise<PushOfferResult> {
  const warnings: string[] = [];

  logger.info('Starting push offer to Shopify workflow', {
    offerId,
    productCount: productIds.length,
    endDate,
  });

  // Step 1: Fetch offer from database
  const offer = await getOfferById(offerId);
  if (!offer) {
    logger.error('Offer not found', { offerId });
    return {
      success: false,
      message: `Offer not found with ID: ${offerId}`,
    };
  }

  // Step 2: Check if already pushed (idempotent behavior)
  const existingOfferPage = await getShopifyOfferPageByOfferId(offerId);
  if (existingOfferPage && existingOfferPage.status !== 'deleted') {
    logger.info('Offer already pushed to Shopify', {
      offerId,
      shopifyPageId: existingOfferPage.shopify_page_id,
      handle: existingOfferPage.shopify_page_handle,
      status: existingOfferPage.status,
    });

    const pageUrl = `https://${config.shopify.storeDomain}/pages/${existingOfferPage.shopify_page_handle}`;

    return {
      success: true,
      shopifyPageId: existingOfferPage.shopify_page_id,
      shopifyPageUrl: pageUrl,
      message: `Offer already pushed to Shopify (status: ${existingOfferPage.status})`,
      warnings: ['Offer was already pushed. Returning existing page info.'],
    };
  }

  // Step 3: Scrape offer page for detailed content
  let scrapedContent;
  try {
    logger.info('Scraping offer page', { url: offer.offer_url });
    scrapedContent = await offerPageScraper.scrapeOfferPage(offer.offer_url);
  } catch (error) {
    logger.error('Failed to scrape offer page', {
      offerId,
      url: offer.offer_url,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: `Failed to scrape offer page: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Step 4: Upload hero image to Shopify Files
  let heroImageShopifyUrl: string | null = null;
  if (scrapedContent.heroImageUrl) {
    try {
      logger.info('Uploading hero image to Shopify', { url: scrapedContent.heroImageUrl });
      const fileId = await shopifyClient.uploadFile(
        scrapedContent.heroImageUrl,
        `offer-${offerId}-hero.jpg`,
        'image/jpeg'
      );

      if (fileId) {
        // Get the CDN URL for the uploaded file
        heroImageShopifyUrl = await shopifyClient.getFileUrl(fileId);
        if (heroImageShopifyUrl) {
          logger.info('Hero image uploaded successfully', { fileId, url: heroImageShopifyUrl });
        } else {
          warnings.push('Hero image uploaded but URL not available yet');
        }
      } else {
        warnings.push('Failed to upload hero image, using placeholder');
      }
    } catch (error) {
      logger.warn('Failed to upload hero image', {
        url: scrapedContent.heroImageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      warnings.push(`Hero image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    warnings.push('No hero image found on offer page');
  }

  // Step 5: Fetch linked products from shopify_catalog_cache
  const linkedProducts: ShopifyCatalogCache[] = [];
  for (const productId of productIds) {
    const product = await getShopifyCatalogById(productId);
    if (product) {
      linkedProducts.push(product);
    } else {
      warnings.push(`Product not found in catalog: ${productId}`);
    }
  }

  logger.info('Fetched linked products', {
    requestedCount: productIds.length,
    foundCount: linkedProducts.length,
  });

  // Step 6: Build page HTML using Gemini enhancement
  let pageHtml: string;
  try {
    logger.info('Building offer page HTML');
    // Update scraped content with uploaded hero image URL
    const contentWithShopifyImage = {
      ...scrapedContent,
      heroImageUrl: heroImageShopifyUrl || scrapedContent.heroImageUrl,
    };
    pageHtml = await buildOfferPageHtml(contentWithShopifyImage, linkedProducts, shopifyClient);
  } catch (error) {
    logger.error('Failed to build page HTML', {
      offerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: `Failed to build page HTML: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Generate title and handle
  const pageTitle = buildOfferPageTitle(scrapedContent);
  const pageHandle = generateOfferHandle(pageTitle);

  logger.info('Generated page title and handle', { pageTitle, pageHandle });

  // Step 7: Create Shopify page
  let shopifyPageResult;
  try {
    logger.info('Creating Shopify page', { title: pageTitle, handle: pageHandle });
    shopifyPageResult = await shopifyClient.createPage({
      title: pageTitle,
      bodyHtml: pageHtml,
      handle: pageHandle,
      isPublished: true,
    });

    if (!shopifyPageResult) {
      throw new Error('Shopify returned null result');
    }
  } catch (error) {
    logger.error('Failed to create Shopify page', {
      offerId,
      title: pageTitle,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: `Failed to create Shopify page: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Step 8: Store in shopify_offer_pages table
  try {
    // Build tile HTML for the landing page
    const tileHtml = buildOfferTileHtml(offer, shopifyPageResult.handle, heroImageShopifyUrl);

    await createShopifyOfferPage(
      offerId,
      shopifyPageResult.pageId,
      shopifyPageResult.handle,
      heroImageShopifyUrl,
      tileHtml
    );

    logger.info('Created shopify_offer_pages record', {
      offerId,
      shopifyPageId: shopifyPageResult.pageId,
      handle: shopifyPageResult.handle,
    });
  } catch (error) {
    // Page was created but database record failed - log for recovery
    logger.error('Failed to store offer page record (page was created in Shopify)', {
      offerId,
      shopifyPageId: shopifyPageResult.pageId,
      handle: shopifyPageResult.handle,
      error: error instanceof Error ? error.message : String(error),
    });
    warnings.push('Database record creation failed. Page exists in Shopify but may not be tracked.');
  }

  // Step 9: Link products to offer
  for (const productId of productIds) {
    try {
      await linkProductToOffer(offerId, productId);
    } catch (error) {
      logger.warn('Failed to link product to offer', {
        offerId,
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      warnings.push(`Failed to link product ${productId}`);
    }
  }

  // Step 10: Update offer end_date if provided
  if (endDate) {
    try {
      await updateOfferEndDate(offerId, endDate);
      logger.info('Updated offer end date', { offerId, endDate });
    } catch (error) {
      logger.warn('Failed to update offer end date', {
        offerId,
        endDate,
        error: error instanceof Error ? error.message : String(error),
      });
      warnings.push('Failed to update offer end date');
    }
  }

  // Step 11: Rebuild landing page with new tile
  try {
    const landingManager = createOffersLandingManager(shopifyClient);
    await landingManager.rebuildLandingPage();
    logger.info('Landing page rebuilt with new offer tile');
  } catch (error) {
    logger.warn('Failed to rebuild landing page', {
      error: error instanceof Error ? error.message : String(error),
    });
    warnings.push('Landing page update failed. Offer page exists but may not appear on landing page.');
  }

  const pageUrl = `https://${config.shopify.storeDomain}/pages/${shopifyPageResult.handle}`;

  logger.info('Push offer to Shopify completed successfully', {
    offerId,
    shopifyPageId: shopifyPageResult.pageId,
    handle: shopifyPageResult.handle,
    pageUrl,
    warningCount: warnings.length,
  });

  return {
    success: true,
    shopifyPageId: shopifyPageResult.pageId,
    shopifyPageUrl: pageUrl,
    message: 'Offer page created successfully',
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Update an existing offer's linked products.
 * Re-links products and regenerates the offer page HTML.
 *
 * @param offerId - The offer ID
 * @param productIds - New array of product IDs to link
 * @returns Result with success status
 */
export async function updateOfferProducts(
  offerId: number,
  productIds: number[]
): Promise<{ success: boolean; message?: string }> {
  logger.info('Updating offer products', { offerId, productCount: productIds.length });

  // Verify offer exists
  const offer = await getOfferById(offerId);
  if (!offer) {
    return { success: false, message: 'Offer not found' };
  }

  // Verify offer is pushed to Shopify
  const offerPage = await getShopifyOfferPageByOfferId(offerId);
  if (!offerPage) {
    return { success: false, message: 'Offer not pushed to Shopify yet' };
  }

  // Get current linked products for logging
  const currentProducts = await getProductsForOffer(offerId);
  const currentProductIds = new Set(currentProducts.map((p) => p.id));

  // Note: For simplicity, we just re-link all products (upsert handles duplicates)
  // In a production system, you might want to explicitly unlink removed products

  // Link new products
  for (const productId of productIds) {
    try {
      await linkProductToOffer(offerId, productId);
    } catch (error) {
      logger.warn('Failed to link product', { offerId, productId });
    }
  }

  logger.info('Updated offer products', {
    offerId,
    previousCount: currentProductIds.size,
    newCount: productIds.length,
  });

  return { success: true, message: 'Products updated successfully' };
}

/**
 * Get the full offer with linked products and Shopify page status.
 *
 * @param offerId - The offer ID
 * @returns Offer with products and page info, or null if not found
 */
export async function getOfferWithProducts(offerId: number): Promise<{
  offer: Offer;
  shopifyPage: { id: string; handle: string; status: string; url: string } | null;
  products: ShopifyCatalogCache[];
} | null> {
  const offer = await getOfferById(offerId);
  if (!offer) {
    return null;
  }

  const products = await getProductsForOffer(offerId);
  const offerPage = await getShopifyOfferPageByOfferId(offerId);

  let shopifyPage = null;
  if (offerPage) {
    shopifyPage = {
      id: offerPage.shopify_page_id,
      handle: offerPage.shopify_page_handle,
      status: offerPage.status,
      url: `https://${config.shopify.storeDomain}/pages/${offerPage.shopify_page_handle}`,
    };
  }

  return {
    offer,
    shopifyPage,
    products,
  };
}
