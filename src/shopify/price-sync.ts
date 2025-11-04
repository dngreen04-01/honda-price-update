import { shopifyClient } from './client.js';
import { getProductPageByUrl, upsertShopifyCatalogCache } from '../database/queries.js';
import { logger } from '../utils/logger.js';
import { ShopifyPriceUpdate } from '../types/index.js';

/**
 * Sync prices from database to Shopify
 */
export async function syncPricesToShopify(productUrls: string[]): Promise<{
  synced: number;
  skipped: number;
  failed: number;
}> {
  logger.info('Starting Shopify price sync', { productCount: productUrls.length });

  const updates: ShopifyPriceUpdate[] = [];
  let skipped = 0;

  for (const url of productUrls) {
    try {
      // Get product from database
      const productPage = await getProductPageByUrl(url);

      if (!productPage || productPage.latest_sale_price === null) {
        logger.debug('Skipping product - no price data', { url });
        skipped++;
        continue;
      }

      // Get Shopify product by source_url metafield
      const shopifyProduct = await shopifyClient.getProductBySourceUrl(url);

      if (!shopifyProduct) {
        logger.debug('Skipping product - not found in Shopify', { url });
        skipped++;
        continue;
      }

      // Get first variant
      const variant = shopifyProduct.variants?.edges[0]?.node;

      if (!variant) {
        logger.warn('Skipping product - no variants', { url, shopifyProductId: shopifyProduct.id });
        skipped++;
        continue;
      }

      // Check if price update needed
      const currentPrice = parseFloat(variant.price);
      const currentCompareAt = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;

      const needsUpdate =
        currentPrice !== productPage.latest_sale_price ||
        currentCompareAt !== productPage.latest_original_price;

      if (!needsUpdate) {
        logger.debug('Skipping product - prices already match', { url });
        skipped++;
        continue;
      }

      // Add to update batch
      updates.push({
        variantId: variant.id,
        price: productPage.latest_sale_price.toFixed(2),
        compareAtPrice: productPage.latest_original_price?.toFixed(2) || null,
      });

      // Update cache
      await upsertShopifyCatalogCache(
        shopifyProduct.id,
        variant.id,
        url,
        productPage.latest_sale_price,
        productPage.latest_original_price
      );

      logger.debug('Queued price update', {
        url,
        oldPrice: currentPrice,
        newPrice: productPage.latest_sale_price,
      });
    } catch (error) {
      logger.error('Failed to process product for sync', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      skipped++;
    }
  }

  // Execute bulk updates
  if (updates.length === 0) {
    logger.info('No price updates needed');
    return { synced: 0, skipped, failed: 0 };
  }

  const result = await shopifyClient.updateVariantPrices(updates);

  logger.info('Shopify price sync completed', {
    synced: result.success,
    skipped,
    failed: result.failed,
  });

  return {
    synced: result.success,
    skipped,
    failed: result.failed,
  };
}

/**
 * Refresh Shopify catalog cache
 */
export async function refreshShopifyCatalogCache(): Promise<number> {
  logger.info('Refreshing Shopify catalog cache');

  const productMap = await shopifyClient.getAllProductsWithSourceUrl();

  let cached = 0;

  for (const [sourceUrl, product] of productMap.entries()) {
    try {
      const variant = product.variants?.edges[0]?.node;

      if (!variant) {
        logger.warn('Product has no variants', { shopifyProductId: product.id, sourceUrl });
        continue;
      }

      const price = parseFloat(variant.price);
      const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;

      await upsertShopifyCatalogCache(
        product.id,
        variant.id,
        sourceUrl,
        price,
        compareAtPrice
      );

      cached++;
    } catch (error) {
      logger.error('Failed to cache Shopify product', {
        sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Shopify catalog cache refreshed', { cached });

  return cached;
}
