import { Request, Response } from 'express';
import { pushToShopify, pushUrlToShopify } from '../shopify/push-to-shopify.js';
import { logger } from '../utils/logger.js';
import { ProductTemplate } from '../types/index.js';

/**
 * Handle push product to Shopify request
 * POST /api/shopify/push-product
 */
export async function handlePushToShopify(req: Request, res: Response): Promise<void> {
  const { discoveredProductId, template } = req.body;

  // Validate request body
  if (!discoveredProductId || typeof discoveredProductId !== 'number') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid discoveredProductId (must be a number)',
    });
    return;
  }

  if (!template || typeof template !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid template',
    });
    return;
  }

  // Validate template value
  const validTemplates: ProductTemplate[] = ['motorbikes', 'outboard-motors', 'default'];
  if (!validTemplates.includes(template as ProductTemplate)) {
    res.status(400).json({
      success: false,
      message: `Invalid template. Must be one of: ${validTemplates.join(', ')}`,
    });
    return;
  }

  try {
    logger.info('Push to Shopify request received', {
      discoveredProductId,
      template,
    });

    const result = await pushToShopify(discoveredProductId, template as ProductTemplate);

    if (result.success) {
      res.json({
        success: true,
        shopifyProductId: result.shopifyProductId,
        shopifyVariantId: result.shopifyVariantId,
        shopifyProductUrl: result.shopifyProductUrl,
        warnings: result.warnings,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
        warnings: result.warnings,
      });
    }
  } catch (error) {
    logger.error('Failed to push product to Shopify', {
      discoveredProductId,
      template,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while pushing to Shopify',
    });
  }
}

/**
 * Handle push product to Shopify directly from URL (bypasses discovered_products)
 * POST /api/shopify/push-url
 */
export async function handlePushUrlToShopify(req: Request, res: Response): Promise<void> {
  const { url, template, price } = req.body;

  // Validate URL
  if (!url || typeof url !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid url (must be a string)',
    });
    return;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    res.status(400).json({
      success: false,
      message: 'Invalid URL format. Must be a valid HTTP/HTTPS URL.',
    });
    return;
  }

  // Validate template
  if (!template || typeof template !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid template',
    });
    return;
  }

  const validTemplates: ProductTemplate[] = ['motorbikes', 'outboard-motors', 'default'];
  if (!validTemplates.includes(template as ProductTemplate)) {
    res.status(400).json({
      success: false,
      message: `Invalid template. Must be one of: ${validTemplates.join(', ')}`,
    });
    return;
  }

  // Validate price (optional)
  let parsedPrice: number | undefined;
  if (price !== undefined && price !== null && price !== '') {
    parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid price. Must be a non-negative number.',
      });
      return;
    }
  }

  try {
    logger.info('Push URL to Shopify request received', {
      url,
      template,
      price: parsedPrice,
    });

    const result = await pushUrlToShopify(url, template as ProductTemplate, parsedPrice);

    if (result.success) {
      res.json({
        success: true,
        shopifyProductId: result.shopifyProductId,
        shopifyVariantId: result.shopifyVariantId,
        shopifyProductUrl: result.shopifyProductUrl,
        warnings: result.warnings,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
        warnings: result.warnings,
      });
    }
  } catch (error) {
    logger.error('Failed to push URL to Shopify', {
      url,
      template,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error while pushing to Shopify',
    });
  }
}
