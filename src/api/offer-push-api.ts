/**
 * Offer Push API
 *
 * API endpoints for managing offer pages in Shopify:
 * - POST /api/offers/push - Push an offer to Shopify
 * - POST /api/offers/:id/link-products - Link products to an offer
 * - GET /api/offers/:id/products - Get products linked to an offer
 * - POST /api/offers/:id/update-end-date - Update an offer's end date
 * - GET /api/offers/:id - Get offer with linked products and Shopify status
 */

import { Request, Response } from 'express';
import {
  pushOfferToShopify,
  getOfferWithProducts,
} from '../shopify/push-offer-to-shopify.js';
import {
  linkProductToOffer,
  unlinkProductFromOffer,
  getProductsForOffer,
  updateOfferEndDate,
  getShopifyCatalogCache,
} from '../database/queries.js';
import { logger } from '../utils/logger.js';
import { ShopifyClient } from '../shopify/client.js';
import { createOfferExpirationService } from '../shopify/offer-expiration-service.js';

/**
 * Push an offer to Shopify
 * POST /api/offers/push
 *
 * Body:
 * - offerId: number (required) - The offer ID from the offers table
 * - productIds: number[] (required) - Array of product IDs from shopify_catalog_cache
 * - endDate?: string (optional) - ISO date string for the offer end date
 */
export async function handlePushOffer(req: Request, res: Response): Promise<void> {
  const { offerId, productIds, endDate } = req.body;

  // Validate offerId
  if (!offerId || typeof offerId !== 'number') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid offerId (must be a number)',
    });
    return;
  }

  // Validate productIds
  if (!Array.isArray(productIds)) {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid productIds (must be an array)',
    });
    return;
  }

  // Validate each productId is a number
  for (const id of productIds) {
    if (typeof id !== 'number') {
      res.status(400).json({
        success: false,
        message: 'All productIds must be numbers',
      });
      return;
    }
  }

  // Parse and validate endDate if provided
  let parsedEndDate: Date | undefined;
  if (endDate) {
    parsedEndDate = new Date(endDate);
    if (isNaN(parsedEndDate.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Invalid endDate format. Must be a valid ISO date string.',
      });
      return;
    }
  }

  try {
    logger.info('Push offer to Shopify request received', {
      offerId,
      productIds,
      endDate,
    });

    const result = await pushOfferToShopify(offerId, productIds, parsedEndDate);

    if (result.success) {
      res.json({
        success: true,
        shopifyPageId: result.shopifyPageId,
        shopifyPageUrl: result.shopifyPageUrl,
        message: result.message,
        warnings: result.warnings,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        warnings: result.warnings,
      });
    }
  } catch (error) {
    logger.error('Failed to push offer to Shopify', {
      offerId,
      productIds,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while pushing offer to Shopify',
    });
  }
}

/**
 * Link products to an offer
 * POST /api/offers/:id/link-products
 *
 * Body:
 * - productIds: number[] (required) - Array of product IDs to link
 */
export async function handleLinkProducts(req: Request, res: Response): Promise<void> {
  const offerId = parseInt(req.params.id, 10);
  const { productIds } = req.body;

  if (isNaN(offerId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid offer ID',
    });
    return;
  }

  if (!Array.isArray(productIds)) {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid productIds (must be an array)',
    });
    return;
  }

  try {
    logger.info('Link products to offer request received', { offerId, productIds });

    let linkedCount = 0;
    const errors: string[] = [];

    for (const productId of productIds) {
      if (typeof productId !== 'number') {
        errors.push(`Invalid productId: ${productId}`);
        continue;
      }

      try {
        await linkProductToOffer(offerId, productId);
        linkedCount++;
      } catch (error) {
        errors.push(`Failed to link product ${productId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      linkedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error('Failed to link products to offer', {
      offerId,
      productIds,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while linking products',
    });
  }
}

/**
 * Unlink products from an offer
 * DELETE /api/offers/:id/link-products
 *
 * Body:
 * - productIds: number[] (required) - Array of product IDs to unlink
 */
export async function handleUnlinkProducts(req: Request, res: Response): Promise<void> {
  const offerId = parseInt(req.params.id, 10);
  const { productIds } = req.body;

  if (isNaN(offerId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid offer ID',
    });
    return;
  }

  if (!Array.isArray(productIds)) {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid productIds (must be an array)',
    });
    return;
  }

  try {
    logger.info('Unlink products from offer request received', { offerId, productIds });

    let unlinkedCount = 0;

    for (const productId of productIds) {
      if (typeof productId !== 'number') continue;

      try {
        const deleted = await unlinkProductFromOffer(offerId, productId);
        if (deleted) unlinkedCount++;
      } catch (error) {
        logger.warn('Failed to unlink product', { offerId, productId });
      }
    }

    res.json({
      success: true,
      unlinkedCount,
    });
  } catch (error) {
    logger.error('Failed to unlink products from offer', {
      offerId,
      productIds,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while unlinking products',
    });
  }
}

/**
 * Get products linked to an offer
 * GET /api/offers/:id/products
 */
export async function handleGetOfferProducts(req: Request, res: Response): Promise<void> {
  const offerId = parseInt(req.params.id, 10);

  if (isNaN(offerId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid offer ID',
    });
    return;
  }

  try {
    const products = await getProductsForOffer(offerId);

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    logger.error('Failed to get products for offer', {
      offerId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching products',
    });
  }
}

/**
 * Update an offer's end date
 * POST /api/offers/:id/update-end-date
 *
 * Body:
 * - endDate: string (required) - ISO date string
 */
export async function handleUpdateEndDate(req: Request, res: Response): Promise<void> {
  const offerId = parseInt(req.params.id, 10);
  const { endDate } = req.body;

  if (isNaN(offerId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid offer ID',
    });
    return;
  }

  if (!endDate || typeof endDate !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid endDate',
    });
    return;
  }

  const parsedDate = new Date(endDate);
  if (isNaN(parsedDate.getTime())) {
    res.status(400).json({
      success: false,
      message: 'Invalid endDate format. Must be a valid ISO date string.',
    });
    return;
  }

  try {
    logger.info('Update offer end date request received', { offerId, endDate });

    const updated = await updateOfferEndDate(offerId, parsedDate);

    res.json({
      success: updated,
      message: updated ? 'End date updated successfully' : 'No offer found with that ID',
    });
  } catch (error) {
    logger.error('Failed to update offer end date', {
      offerId,
      endDate,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while updating end date',
    });
  }
}

/**
 * Get offer with linked products and Shopify status
 * GET /api/offers/:id
 */
export async function handleGetOfferWithProducts(req: Request, res: Response): Promise<void> {
  const offerId = parseInt(req.params.id, 10);

  if (isNaN(offerId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid offer ID',
    });
    return;
  }

  try {
    const result = await getOfferWithProducts(offerId);

    if (!result) {
      res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
      return;
    }

    res.json({
      success: true,
      offer: result.offer,
      shopifyPage: result.shopifyPage,
      products: result.products,
    });
  } catch (error) {
    logger.error('Failed to get offer with products', {
      offerId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching offer',
    });
  }
}

/**
 * Get all products in the Shopify catalog (for product selection in UI)
 * GET /api/shopify/catalog
 */
export async function handleGetShopifyCatalog(_req: Request, res: Response): Promise<void> {
  try {
    const products = await getShopifyCatalogCache();

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    logger.error('Failed to get Shopify catalog', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching catalog',
    });
  }
}

/**
 * Check for and expire offers past their end date
 * POST /api/offers/check-expirations
 *
 * Response:
 * - expiredCount: number - Number of offers that were expired
 * - errors: string[] - Any errors encountered during expiration
 */
export async function handleCheckExpirations(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('Check expirations request received');

    const shopifyClient = new ShopifyClient();
    const expirationService = createOfferExpirationService(shopifyClient);

    const result = await expirationService.checkAndExpireOffers();

    res.json({
      success: true,
      expiredCount: result.expiredCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    logger.error('Failed to check expirations', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while checking expirations',
    });
  }
}

/**
 * Get offers expiring within a specified number of days
 * GET /api/offers/expiring
 *
 * Query params:
 * - days?: number (default: 7) - Number of days to look ahead
 *
 * Response:
 * - offers: Offer[] - Array of offers expiring soon
 */
export async function handleGetExpiringOffers(req: Request, res: Response): Promise<void> {
  const days = parseInt(req.query.days as string, 10) || 7;

  // Validate days parameter
  if (days < 1 || days > 365) {
    res.status(400).json({
      success: false,
      message: 'Days parameter must be between 1 and 365',
    });
    return;
  }

  try {
    logger.info('Get expiring offers request received', { days });

    const shopifyClient = new ShopifyClient();
    const expirationService = createOfferExpirationService(shopifyClient);

    const offers = await expirationService.getExpiringOffers(days);

    res.json({
      success: true,
      offers,
      withinDays: days,
    });
  } catch (error) {
    logger.error('Failed to get expiring offers', {
      days,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching expiring offers',
    });
  }
}

/**
 * Manually expire a specific offer by ID
 * POST /api/offers/:id/expire
 *
 * Used for admin actions when you need to manually hide an offer
 * before its end date.
 */
export async function handleExpireOffer(req: Request, res: Response): Promise<void> {
  const offerId = parseInt(req.params.id, 10);

  if (isNaN(offerId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid offer ID',
    });
    return;
  }

  try {
    logger.info('Manual expire offer request received', { offerId });

    const shopifyClient = new ShopifyClient();
    const expirationService = createOfferExpirationService(shopifyClient);

    const expired = await expirationService.expireOfferById(offerId);

    if (expired) {
      res.json({
        success: true,
        message: 'Offer expired successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Offer not found or not active',
      });
    }
  } catch (error) {
    logger.error('Failed to expire offer', {
      offerId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while expiring offer',
    });
  }
}
