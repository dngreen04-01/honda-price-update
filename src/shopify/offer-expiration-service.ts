/**
 * Offer Expiration Service
 *
 * Manages automatic expiration of offer pages in Shopify.
 * Checks for offers past their end date and unpublishes them,
 * then rebuilds the landing page to remove expired tiles.
 */

import { ShopifyClient } from './client.js';
import { OffersLandingManager, createOffersLandingManager } from './offers-landing-manager.js';
import {
  getExpiredActiveOfferPages,
  getExpiringOffers as getExpiringOffersQuery,
  updateShopifyOfferPageStatus,
  getShopifyOfferPageByOfferId,
  getOfferById,
} from '../database/queries.js';
import { logger } from '../utils/logger.js';
import { Offer, ExpireResult, ShopifyOfferPage } from '../types/index.js';

/**
 * Service for managing offer page expiration.
 *
 * Responsibilities:
 * - Check for expired active offer pages
 * - Unpublish (hide) expired pages in Shopify
 * - Update database status to 'hidden'
 * - Rebuild landing page to remove expired tiles
 * - Query for offers expiring soon (for dashboard warnings)
 */
export class OfferExpirationService {
  private shopifyClient: ShopifyClient;
  private landingManager: OffersLandingManager;

  constructor(shopifyClient: ShopifyClient) {
    this.shopifyClient = shopifyClient;
    this.landingManager = createOffersLandingManager(shopifyClient);
  }

  /**
   * Check for and expire all active offer pages past their end date.
   *
   * Process:
   * 1. Query for active offer pages where the linked offer's end_date < today
   * 2. For each expired offer:
   *    - Unpublish the Shopify page (set isPublished=false)
   *    - Update shopify_offer_pages status to 'hidden'
   * 3. If any expired, rebuild the landing page
   *
   * @returns Result with count of expired offers and any errors
   */
  async checkAndExpireOffers(): Promise<ExpireResult> {
    logger.info('Starting offer expiration check');

    const errors: string[] = [];
    let expiredCount = 0;

    try {
      // Get all active offer pages that have expired
      const expiredPages = await getExpiredActiveOfferPages();

      if (expiredPages.length === 0) {
        logger.info('No expired offers found');
        return { expiredCount: 0, errors: [] };
      }

      logger.info('Found expired offer pages', { count: expiredPages.length });

      // Process each expired offer
      for (const expiredPage of expiredPages) {
        try {
          await this.expireOfferPage(expiredPage, expiredPage.offer);
          expiredCount++;
        } catch (error) {
          const errorMsg = `Failed to expire offer ${expiredPage.offer_id}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Rebuild landing page if any offers were expired
      if (expiredCount > 0) {
        try {
          await this.landingManager.rebuildLandingPage();
          logger.info('Landing page rebuilt after expiring offers');
        } catch (error) {
          const errorMsg = `Failed to rebuild landing page: ${
            error instanceof Error ? error.message : String(error)
          }`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      logger.info('Offer expiration check completed', {
        expiredCount,
        errorCount: errors.length,
      });

      return { expiredCount, errors };
    } catch (error) {
      const errorMsg = `Expiration check failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      return { expiredCount, errors };
    }
  }

  /**
   * Expire a single offer page.
   *
   * @param offerPage - The ShopifyOfferPage record to expire
   * @param offer - The associated Offer record
   */
  private async expireOfferPage(
    offerPage: ShopifyOfferPage,
    offer: Offer
  ): Promise<void> {
    logger.info('Expiring offer page', {
      offerId: offer.id,
      title: offer.title,
      endDate: offer.end_date,
      shopifyPageId: offerPage.shopify_page_id,
    });

    // Step 1: Unpublish the Shopify page
    const unpublished = await this.shopifyClient.updatePage(
      offerPage.shopify_page_id,
      { isPublished: false }
    );

    if (!unpublished) {
      throw new Error(
        `Failed to unpublish Shopify page ${offerPage.shopify_page_id}`
      );
    }

    // Step 2: Update database status to 'hidden'
    await updateShopifyOfferPageStatus(offerPage.id, 'hidden');

    logger.info('Offer page expired successfully', {
      offerId: offer.id,
      title: offer.title,
      shopifyPageId: offerPage.shopify_page_id,
    });
  }

  /**
   * Get offers expiring within the specified number of days.
   * Useful for dashboard warnings and notifications.
   *
   * @param withinDays - Number of days to look ahead (default: 7)
   * @returns Array of offers expiring soon
   */
  async getExpiringOffers(withinDays: number = 7): Promise<Offer[]> {
    logger.debug('Fetching expiring offers', { withinDays });
    return getExpiringOffersQuery(withinDays);
  }

  /**
   * Manually expire a specific offer by ID.
   * Useful for admin actions or testing.
   *
   * @param offerId - The offer ID to expire
   * @returns Whether the expiration was successful
   */
  async expireOfferById(offerId: number): Promise<boolean> {
    logger.info('Manually expiring offer', { offerId });

    try {
      // Get the offer page record for this specific offer
      const offerPage = await getShopifyOfferPageByOfferId(offerId);
      if (!offerPage) {
        logger.warn('No Shopify offer page found for offer', { offerId });
        return false;
      }

      if (offerPage.status !== 'active') {
        logger.info('Offer page is not active, skipping expiration', {
          offerId,
          status: offerPage.status,
        });
        return false;
      }

      const offer = await getOfferById(offerId);
      if (!offer) {
        logger.warn('Offer not found', { offerId });
        return false;
      }

      await this.expireOfferPage(offerPage, offer);
      await this.landingManager.rebuildLandingPage();

      return true;
    } catch (error) {
      logger.error('Failed to manually expire offer', {
        offerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * Factory function for creating the expiration service
 */
export function createOfferExpirationService(
  shopifyClient: ShopifyClient
): OfferExpirationService {
  return new OfferExpirationService(shopifyClient);
}
