import { supabase } from './client.js';
import {
  ShopifyCatalogCache,
  ProductPage,
  PriceHistory,
  Offer,
  Domain,
  ReconcileResult
} from '../types/index.js';
import { logger } from '../utils/logger.js';

// Shopify Catalog Cache
export async function upsertShopifyCatalogCache(
  shopifyProductId: string,
  shopifyVariantId: string,
  sourceUrlCanonical: string,
  shopifyPrice: number,
  shopifyCompareAtPrice: number | null,
  productTitle?: string,
  variantTitle?: string,
  variantSku?: string
): Promise<ShopifyCatalogCache> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .upsert(
      {
        shopify_product_id: shopifyProductId,
        shopify_variant_id: shopifyVariantId,
        source_url_canonical: sourceUrlCanonical,
        shopify_price: shopifyPrice,
        shopify_compare_at_price: shopifyCompareAtPrice,
        product_title: productTitle,
        variant_title: variantTitle,
        variant_sku: variantSku,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'shopify_variant_id' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to upsert Shopify catalog cache', {
      error: error.message,
      shopifyVariantId,
    });
    throw error;
  }

  return data as ShopifyCatalogCache;
}

export async function getShopifyCatalogCache(): Promise<ShopifyCatalogCache[]> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .order('last_synced_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch Shopify catalog cache', { error: error.message });
    throw error;
  }

  return data as ShopifyCatalogCache[];
}

export async function getShopifyProductUrls(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('source_url_canonical')
    .not('source_url_canonical', 'is', null);

  if (error) {
    logger.error('Failed to fetch Shopify product URLs', { error: error.message });
    throw error;
  }

  // Return as Set for fast lookup
  return new Set(data.map(row => row.source_url_canonical));
}

export async function updateScrapedPrices(
  sourceUrlCanonical: string,
  scrapedSalePrice: number | null,
  scrapedOriginalPrice: number | null,
  scrapeConfidence: number
): Promise<{ updated: boolean; rowCount: number }> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .update({
      scraped_sale_price: scrapedSalePrice,
      scraped_original_price: scrapedOriginalPrice,
      scrape_confidence: scrapeConfidence,
      last_scraped_at: new Date().toISOString(),
    })
    .eq('source_url_canonical', sourceUrlCanonical)
    .select('id');

  if (error) {
    logger.error('Failed to update scraped prices', {
      error: error.message,
      sourceUrlCanonical,
    });
    throw error;
  }

  const rowCount = data?.length ?? 0;
  const updated = rowCount > 0;

  if (!updated) {
    logger.warn('No matching row found for scraped price update', {
      sourceUrlCanonical,
      scrapedSalePrice,
    });
  } else {
    logger.debug('Scraped prices updated', {
      sourceUrlCanonical,
      scrapedSalePrice,
      scrapeConfidence,
      rowCount,
    });
  }

  return { updated, rowCount };
}

export async function getShopifyCatalogByUrl(
  sourceUrlCanonical: string
): Promise<ShopifyCatalogCache | null> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .eq('source_url_canonical', sourceUrlCanonical)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to fetch Shopify catalog by URL', {
      error: error.message,
      sourceUrlCanonical,
    });
    throw error;
  }

  return data as ShopifyCatalogCache | null;
}

// Product Pages
export async function getAllProductPages(): Promise<ProductPage[]> {
  const { data, error } = await supabase
    .from('product_pages')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch all product pages', { error: error.message });
    throw error;
  }

  return data as ProductPage[];
}

export async function getProductPageByUrl(
  canonicalUrl: string
): Promise<ProductPage | null> {
  const { data, error } = await supabase
    .from('product_pages')
    .select('*')
    .eq('canonical_url', canonicalUrl)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to fetch product page by URL', {
      error: error.message,
      canonicalUrl,
    });
    throw error;
  }

  return data as ProductPage | null;
}

export async function archiveProductByUrl(
  canonicalUrl: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('product_pages')
    .update({
      archived: true,
      archived_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('canonical_url', canonicalUrl);

  if (error) {
    logger.error('Failed to archive product', {
      error: error.message,
      canonicalUrl,
    });
    throw error;
  }

  logger.info('Product archived', { canonicalUrl, reason });
}

// Price History
export async function getPriceHistory(
  productPageId: number,
  limit?: number
): Promise<PriceHistory[]> {
  let query = supabase
    .from('price_history')
    .select('*')
    .eq('product_page_id', productPageId)
    .order('scraped_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch price history', {
      error: error.message,
      productPageId,
    });
    throw error;
  }

  return data as PriceHistory[];
}

// Offers
export async function getRecentOffers(
  domainId?: number,
  days: number = 7
): Promise<Offer[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  let query = supabase
    .from('offers')
    .select('*')
    .gte('last_seen_at', cutoffDate.toISOString())
    .order('last_seen_at', { ascending: false });

  if (domainId) {
    query = query.eq('domain_id', domainId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch recent offers', { error: error.message });
    throw error;
  }

  return data as Offer[];
}

// Domains
export async function getActiveDomains(): Promise<Domain[]> {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .eq('active', true)
    .order('root_url', { ascending: true });

  if (error) {
    logger.error('Failed to fetch active domains', { error: error.message });
    throw error;
  }

  return data as Domain[];
}

// Reconcile Results
export async function insertReconcileResult(
  runId: string,
  productType: 'supplier_only' | 'shopify_only',
  canonicalUrl: string,
  status: 'active' | 'redirect' | '404' | 'pending'
): Promise<ReconcileResult> {
  const { data, error } = await supabase
    .from('reconcile_results')
    .insert({
      run_id: runId,
      product_type: productType,
      canonical_url: canonicalUrl,
      status,
      detected_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to insert reconcile result', {
      error: error.message,
      runId,
      canonicalUrl,
    });
    throw error;
  }

  return data as ReconcileResult;
}
