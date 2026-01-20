import { ShopifyClient } from './client.js';
import {
  buildOfferTileHtml,
  buildOffersLandingPageHtml,
  DEFAULT_INTRO_TEXT,
} from './offers-landing-builder.js';
import {
  getActiveShopifyOfferPages,
  getOfferById,
  updateShopifyOfferPageTileHtml,
} from '../database/queries.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Manages the Shopify offers landing page.
 *
 * This service maintains a landing page at `/pages/offers` (configurable)
 * that displays tiles for all active offers. When offers are added, updated,
 * or expired, this manager regenerates and pushes the landing page content.
 */
export class OffersLandingManager {
  private shopifyClient: ShopifyClient;
  private landingPageHandle: string;
  private landingPageId: string | null = null;

  constructor(shopifyClient: ShopifyClient) {
    this.shopifyClient = shopifyClient;
    this.landingPageHandle = config.offers.landingPageHandle;
  }

  /**
   * Ensure the offers landing page exists in Shopify.
   * Creates it if it doesn't exist.
   *
   * @returns The Shopify page GID
   */
  async ensureLandingPageExists(): Promise<string> {
    // Check if we already have the page ID cached
    if (this.landingPageId) {
      return this.landingPageId;
    }

    // Try to find the existing page by handle
    const existingPage = await this.shopifyClient.getPageByHandle(this.landingPageHandle);

    if (existingPage) {
      logger.info('Found existing offers landing page', {
        pageId: existingPage.id,
        handle: existingPage.handle,
      });
      this.landingPageId = existingPage.id;
      return existingPage.id;
    }

    // Create the landing page with placeholder content
    logger.info('Creating offers landing page', { handle: this.landingPageHandle });

    const placeholderHtml = buildOffersLandingPageHtml([], DEFAULT_INTRO_TEXT);

    const result = await this.shopifyClient.createPage({
      title: 'Current Offers',
      bodyHtml: placeholderHtml,
      handle: this.landingPageHandle,
      isPublished: true,
    });

    if (result) {
      logger.info('Created offers landing page', {
        pageId: result.pageId,
        handle: result.handle,
      });
      this.landingPageId = result.pageId;
      return result.pageId;
    }

    // If creation failed (possibly because handle already exists), try to find
    // the page by searching. This handles the case where the page exists but
    // getPageByHandle didn't find it (Shopify API quirk).
    logger.info('Page creation failed, searching for existing page by title');

    const searchResult = await this.shopifyClient.searchPagesByTitle('Current Offers');
    if (searchResult && searchResult.length > 0) {
      // Look for a page with matching or similar handle
      const matchingPage = searchResult.find(p =>
        p.handle === this.landingPageHandle ||
        p.handle === 'current-offers'
      ) || searchResult[0];

      logger.info('Found existing page via search', {
        pageId: matchingPage.id,
        handle: matchingPage.handle,
      });
      this.landingPageId = matchingPage.id;
      return matchingPage.id;
    }

    throw new Error('Failed to create or find offers landing page in Shopify');
  }

  /**
   * Rebuild the entire landing page content from all active offers.
   * Fetches active offer pages from the database, generates tile HTML,
   * and pushes the updated landing page to Shopify.
   */
  async rebuildLandingPage(): Promise<void> {
    logger.info('Rebuilding offers landing page');

    // Ensure the landing page exists
    const pageId = await this.ensureLandingPageExists();

    // Fetch all active offer pages from the database
    const activeOfferPages = await getActiveShopifyOfferPages();

    logger.debug('Found active offer pages', { count: activeOfferPages.length });

    // Generate tiles for each active offer
    const tiles: string[] = [];

    for (const offerPage of activeOfferPages) {
      // Use cached tile HTML if available
      if (offerPage.landing_tile_html) {
        tiles.push(offerPage.landing_tile_html);
        continue;
      }

      // Otherwise, generate the tile HTML
      const offer = await getOfferById(offerPage.offer_id);
      if (!offer) {
        logger.warn('Offer not found for offer page', { offerId: offerPage.offer_id });
        continue;
      }

      const tileHtml = buildOfferTileHtml(
        offer,
        offerPage.shopify_page_handle,
        offerPage.hero_image_shopify_url
      );

      // Cache the generated tile HTML
      await updateShopifyOfferPageTileHtml(offerPage.id, tileHtml);

      tiles.push(tileHtml);
    }

    // Build the complete landing page HTML
    const landingPageHtml = buildOffersLandingPageHtml(tiles, DEFAULT_INTRO_TEXT);

    // Update the landing page in Shopify
    const updated = await this.shopifyClient.updatePage(pageId, {
      bodyHtml: landingPageHtml,
    });

    if (!updated) {
      throw new Error('Failed to update offers landing page in Shopify');
    }

    logger.info('Rebuilt offers landing page', {
      pageId,
      tileCount: tiles.length,
    });
  }

  /**
   * Update the tile HTML for a specific offer and rebuild the landing page.
   *
   * @param offerId - The offer ID to update
   * @param tileHtml - The new tile HTML
   */
  async updateOfferTile(offerId: number, tileHtml: string): Promise<void> {
    logger.debug('Updating offer tile', { offerId });

    // Find the offer page record
    const activeOfferPages = await getActiveShopifyOfferPages();
    const offerPage = activeOfferPages.find((p) => p.offer_id === offerId);

    if (!offerPage) {
      logger.warn('No active offer page found for offer', { offerId });
      return;
    }

    // Update the cached tile HTML
    await updateShopifyOfferPageTileHtml(offerPage.id, tileHtml);

    // Rebuild the landing page to include the updated tile
    await this.rebuildLandingPage();
  }

  /**
   * Generate and cache tile HTML for an offer.
   * Called after creating a new offer page.
   *
   * @param offerId - The offer ID
   * @param shopifyOfferPageId - The shopify_offer_pages record ID
   * @param pageHandle - The Shopify page handle
   * @param heroImageUrl - Optional hero image URL
   */
  async generateAndCacheTile(
    offerId: number,
    shopifyOfferPageId: number,
    pageHandle: string,
    heroImageUrl?: string | null
  ): Promise<string> {
    const offer = await getOfferById(offerId);
    if (!offer) {
      throw new Error(`Offer not found: ${offerId}`);
    }

    const tileHtml = buildOfferTileHtml(offer, pageHandle, heroImageUrl);

    // Cache the tile HTML
    await updateShopifyOfferPageTileHtml(shopifyOfferPageId, tileHtml);

    logger.debug('Generated and cached offer tile', {
      offerId,
      shopifyOfferPageId,
      pageHandle,
    });

    return tileHtml;
  }

  /**
   * Get the landing page URL
   */
  getLandingPageUrl(): string {
    const storeDomain = config.shopify.storeDomain;
    return `https://${storeDomain}/pages/${this.landingPageHandle}`;
  }
}

// Export a factory function for creating the manager
export function createOffersLandingManager(
  shopifyClient: ShopifyClient
): OffersLandingManager {
  return new OffersLandingManager(shopifyClient);
}
