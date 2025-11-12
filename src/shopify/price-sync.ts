import { shopifyClient } from './client.js';
import {
  getProductPageByUrl,
  upsertShopifyCatalogCache,
  archiveProductByUrl,
} from '../database/queries.js';
import { supabase } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { ShopifyPriceUpdate } from '../types/index.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';

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
      // CRITICAL: Canonicalize URL for consistent matching
      const canonicalUrl = canonicalizeUrl(url);

      // Get product from cache (primary source of truth)
      // Note: Order by variant_sku to prioritize entries with SKUs over null SKUs
      const { data: cacheDataArray, error: cacheError } = await supabase
        .from('shopify_catalog_cache')
        .select('*')
        .eq('source_url_canonical', canonicalUrl)
        .order('variant_sku', { ascending: false, nullsFirst: false });

      if (cacheError || !cacheDataArray || cacheDataArray.length === 0) {
        logger.debug('Skipping product - not found in cache', { url, canonical: canonicalUrl });
        skipped++;
        continue;
      }

      // Use the first result (prioritizes entries with SKUs)
      const cacheData = cacheDataArray[0];

      if (cacheDataArray.length > 1) {
        logger.warn('Multiple cache entries found for URL, using first match', {
          url: canonicalUrl,
          count: cacheDataArray.length,
          selectedSku: cacheData.variant_sku,
        });
      }

      // Use scraped prices from cache if available, otherwise fall back to product_pages
      let salePrice: number | null = cacheData.scraped_sale_price;
      let originalPrice: number | null = cacheData.scraped_original_price;

      // Fallback to product_pages if cache doesn't have scraped prices
      if (salePrice === null) {
        const productPage = await getProductPageByUrl(canonicalUrl);
        if (productPage && productPage.latest_sale_price !== null) {
          salePrice = productPage.latest_sale_price;
          originalPrice = productPage.latest_original_price;
        }
      }

      if (salePrice === null) {
        logger.debug('Skipping product - no price data', { url, canonical: canonicalUrl });
        skipped++;
        continue;
      }

      // Check if cache has Shopify IDs (required for sync)
      if (!cacheData.shopify_product_id || !cacheData.shopify_variant_id) {
        logger.debug('Skipping product - no Shopify IDs in cache', { url, canonical: canonicalUrl });
        skipped++;
        continue;
      }

      // Use cached Shopify prices for comparison (faster and more reliable than querying)
      const currentPrice = cacheData.shopify_price;
      const currentCompareAt = cacheData.shopify_compare_at_price;

      // Determine if there's an active sale (original price exists and is higher than sale price)
      const hasActiveSale =
        originalPrice !== null &&
        originalPrice > salePrice;

      // Calculate what compareAtPrice should be
      const targetCompareAt = hasActiveSale ? originalPrice : null;

      const needsUpdate =
        currentPrice !== salePrice ||
        currentCompareAt !== targetCompareAt;

      if (!needsUpdate) {
        logger.debug('Skipping product - prices already match', { url, canonical: canonicalUrl });
        skipped++;
        continue;
      }

      // Add to update batch using cached Shopify IDs
      updates.push({
        productId: cacheData.shopify_product_id,
        variantId: cacheData.shopify_variant_id,
        price: salePrice.toFixed(2),
        compareAtPrice: hasActiveSale && originalPrice ? originalPrice.toFixed(2) : null,
      });

      // Update cache with new scraped prices (keep existing Shopify data)
      await upsertShopifyCatalogCache(
        cacheData.shopify_product_id,
        cacheData.shopify_variant_id,
        canonicalUrl,
        salePrice, // This will update shopify_price after successful sync
        hasActiveSale ? originalPrice : null, // This will update shopify_compare_at_price
        cacheData.product_title,
        cacheData.variant_title,
        cacheData.variant_sku
      );

      logger.debug('Queued price update', {
        url,
        canonical: canonicalUrl,
        oldPrice: currentPrice,
        newPrice: salePrice,
        oldCompareAt: currentCompareAt,
        newCompareAt: targetCompareAt,
        hasActiveSale,
        source: cacheData.scraped_sale_price !== null ? 'cache' : 'product_pages',
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
 * Note: getAllProductsWithSourceUrl() already returns canonicalized URLs as keys
 */
export async function refreshShopifyCatalogCache(): Promise<number> {
  logger.info('Refreshing Shopify catalog cache');

  // getAllProductsWithSourceUrl() now returns Map with canonical URLs as keys
  const productMap = await shopifyClient.getAllProductsWithSourceUrl();

  let cached = 0;

  for (const [canonicalUrl, product] of productMap.entries()) {
    try {
      const variant = product.variants?.edges[0]?.node;

      if (!variant) {
        logger.warn('Product has no variants', { shopifyProductId: product.id, canonicalUrl });
        continue;
      }

      const price = parseFloat(variant.price);
      const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;

      // Store with canonical URL
      await upsertShopifyCatalogCache(
        product.id,
        variant.id,
        canonicalUrl,
        price,
        compareAtPrice,
        product.title,
        (variant as any).title || product.title,
        (variant as any).sku
      );

      cached++;
      logger.debug('Cached Shopify product', {
        canonicalUrl,
        productId: product.id,
        title: product.title
      });
    } catch (error) {
      logger.error('Failed to cache Shopify product', {
        canonicalUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Shopify catalog cache refreshed', { cached });

  return cached;
}

/**
 * Archive discontinued products in both database and Shopify
 */
export async function archiveShopifyProducts(
  productUrls: string[]
): Promise<{
  archived: number;
  failed: number;
  errors: string[];
}> {
  logger.info('Archiving Shopify products', { productCount: productUrls.length });

  let archived = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const url of productUrls) {
    try {
      const canonicalUrl = canonicalizeUrl(url);

      // Archive in database first
      await archiveProductByUrl(canonicalUrl, 'discontinued');

      // Get Shopify product to archive
      const shopifyProduct = await shopifyClient.getProductBySourceUrl(canonicalUrl);

      if (shopifyProduct) {
        // Archive in Shopify
        const result = await shopifyClient.updateProductStatus(shopifyProduct.id, 'ARCHIVED');

        if (result.success) {
          archived++;
          logger.info('Product archived successfully', {
            url: canonicalUrl,
            shopifyProductId: shopifyProduct.id,
          });
        } else {
          failed++;
          errors.push(...result.errors);
          logger.warn('Failed to archive product in Shopify', {
            url: canonicalUrl,
            errors: result.errors,
          });
        }
      } else {
        // Product exists in database but not in Shopify - still mark as archived
        archived++;
        logger.info('Product archived in database only (not found in Shopify)', {
          url: canonicalUrl,
        });
      }
    } catch (error) {
      failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      logger.error('Failed to archive product', {
        url,
        error: errorMsg,
      });
    }
  }

  logger.info('Archive operation completed', {
    archived,
    failed,
    errorCount: errors.length,
  });

  return { archived, failed, errors };
}
