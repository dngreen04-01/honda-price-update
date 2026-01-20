import { supabase } from './client.js';
import {
  ShopifyCatalogCache,
  ProductPage,
  PriceHistory,
  Offer,
  Domain,
  ShopifyOfferPage,
  OfferProductLink,
  OfferPageStatus,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { extractProductId } from '../utils/extract-product-id.js';

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

/**
 * Get all variant SKUs from the Shopify catalog for product matching.
 * Used to detect if a discovered product already exists by SKU.
 *
 * @returns Set of existing SKUs (lowercase for case-insensitive matching)
 */
export async function getExistingProductSkus(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('variant_sku')
    .not('variant_sku', 'is', null);

  if (error) {
    logger.error('Failed to fetch existing product SKUs', { error: error.message });
    throw error;
  }

  // Return as Set with lowercase for case-insensitive matching
  return new Set(
    data
      .map(row => row.variant_sku?.toLowerCase())
      .filter((sku): sku is string => sku !== undefined && sku !== null)
  );
}

/**
 * Get product IDs extracted from existing canonical URLs.
 * This handles cases where the same product appears at different URL paths
 * (e.g., /08l78mkse00 vs /honda-genuine-accessories/08l78mkse00).
 *
 * @returns Set of product IDs extracted from URL paths (lowercase)
 */
export async function getExistingProductIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('source_url_canonical')
    .not('source_url_canonical', 'is', null);

  if (error) {
    logger.error('Failed to fetch existing product URLs for ID extraction', {
      error: error.message,
    });
    throw error;
  }

  const productIds = new Set<string>();
  for (const row of data) {
    const productId = extractProductId(row.source_url_canonical);
    if (productId) {
      productIds.add(productId);
    }
  }

  logger.debug('Extracted product IDs from existing URLs', {
    urlCount: data.length,
    productIdCount: productIds.size,
  });

  return productIds;
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

// Product URL Management
export async function updateProductSourceUrl(
  productId: number,
  newSourceUrl: string
): Promise<{ updated: boolean }> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .update({
      source_url_canonical: newSourceUrl,
      // Clear scraped prices since URL changed - need fresh scrape
      scraped_sale_price: null,
      scraped_original_price: null,
      scrape_confidence: null,
      last_scraped_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .select('id');

  if (error) {
    logger.error('Failed to update product source URL', {
      error: error.message,
      productId,
      newSourceUrl,
    });
    throw new Error(error.message || 'Database error updating product URL');
  }

  const updated = (data?.length ?? 0) > 0;

  if (updated) {
    logger.info('Product source URL updated', {
      productId,
      newSourceUrl,
    });
  }

  return { updated };
}

export async function markProductDiscontinued(
  productId: number,
  reason?: string
): Promise<{ updated: boolean; shopifyProductId?: string }> {
  // Mark product as discontinued by setting status and clearing the source URL
  // This removes it from the scraping list
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .update({
      product_status: 'discontinued',
      discontinued_at: new Date().toISOString(),
      discontinued_reason: reason || 'URL redirected to category page',
      source_url_canonical: null,
      scraped_sale_price: null,
      scraped_original_price: null,
      scrape_confidence: null,
      last_scraped_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .select('id, shopify_product_id');

  if (error) {
    logger.error('Failed to mark product as discontinued', {
      error: error.message,
      productId,
      reason,
    });
    throw new Error(error.message || 'Database error marking product discontinued');
  }

  const updated = (data?.length ?? 0) > 0;
  const shopifyProductId = data?.[0]?.shopify_product_id;

  if (updated) {
    logger.info('Product marked as discontinued', {
      productId,
      shopifyProductId,
      reason,
    });
  }

  return { updated, shopifyProductId };
}

export async function getShopifyCatalogById(
  productId: number
): Promise<ShopifyCatalogCache | null> {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .eq('id', productId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to fetch Shopify catalog by ID', {
      error: error.message,
      productId,
    });
    throw error;
  }

  return data as ShopifyCatalogCache | null;
}

// ============================================================================
// Crawl Discovery Queries
// ============================================================================

/**
 * Crawl run record from the database
 */
export interface CrawlRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  sites_crawled: string[] | null;
  urls_discovered: number;
  new_products_found: number;
  new_offers_found: number;
  error_message: string | null;
  created_at: string;
}

/**
 * Discovered product record from the database
 */
export interface DiscoveredProduct {
  id: number;
  crawl_run_id: number | null;
  url: string;
  url_canonical: string;
  domain: string;
  page_title: string | null;
  detected_price: number | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

/**
 * Create a new crawl run record
 * @param sites - Array of site names being crawled
 * @returns The ID of the created crawl run
 */
export async function createCrawlRun(sites: string[]): Promise<number> {
  const { data, error } = await supabase
    .from('crawl_runs')
    .insert({
      sites_crawled: sites,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to create crawl run', { error: error.message });
    throw error;
  }

  logger.info('Created crawl run', { runId: data.id, sites });
  return data.id;
}

/**
 * Update an existing crawl run record
 * @param id - The crawl run ID to update
 * @param updates - Fields to update
 */
export async function updateCrawlRun(
  id: number,
  updates: {
    status?: string;
    completed_at?: string;
    urls_discovered?: number;
    new_products_found?: number;
    new_offers_found?: number;
    error_message?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('crawl_runs')
    .update(updates)
    .eq('id', id);

  if (error) {
    logger.error('Failed to update crawl run', {
      error: error.message,
      runId: id,
    });
    throw error;
  }

  logger.debug('Updated crawl run', { runId: id, updates });
}

/**
 * Clean up stale crawl runs that have been "running" for too long
 * This handles orphaned runs from crashed processes
 * @param maxAgeHours - Maximum age in hours for a "running" crawl (default: 24)
 * @returns Number of runs cleaned up
 */
export async function cleanupStaleCrawlRuns(maxAgeHours: number = 24): Promise<number> {
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('crawl_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: `Orphaned run - marked as failed after ${maxAgeHours}h without completion`,
    })
    .eq('status', 'running')
    .lt('started_at', cutoffTime)
    .select('id');

  if (error) {
    logger.error('Failed to cleanup stale crawl runs', { error: error.message });
    throw error;
  }

  const cleanedCount = data?.length || 0;
  if (cleanedCount > 0) {
    logger.warn('Cleaned up stale crawl runs', {
      count: cleanedCount,
      runIds: data?.map((r) => r.id),
      maxAgeHours,
    });
  }

  return cleanedCount;
}

/**
 * Get a crawl run by ID
 * @param id - The crawl run ID
 * @returns The crawl run record or null if not found
 */
export async function getCrawlRun(id: number): Promise<CrawlRun | null> {
  const { data, error } = await supabase
    .from('crawl_runs')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to fetch crawl run', {
      error: error.message,
      runId: id,
    });
    throw error;
  }

  return data as CrawlRun | null;
}

/**
 * Get recent crawl runs
 * @param limit - Maximum number of runs to return (default: 10)
 * @returns Array of crawl run records
 */
export async function getRecentCrawlRuns(limit: number = 10): Promise<CrawlRun[]> {
  const { data, error } = await supabase
    .from('crawl_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to fetch recent crawl runs', { error: error.message });
    throw error;
  }

  return data as CrawlRun[];
}

/**
 * Insert a discovered product into the database
 * Uses upsert to handle duplicates (same url_canonical)
 * @param crawlRunId - The crawl run that discovered this product
 * @param product - The product details
 */
export async function insertDiscoveredProduct(
  crawlRunId: number,
  product: {
    url: string;
    urlCanonical: string;
    domain: string;
    pageTitle?: string;
    detectedPrice?: number;
  }
): Promise<void> {
  const { error } = await supabase
    .from('discovered_products')
    .upsert(
      {
        crawl_run_id: crawlRunId,
        url: product.url,
        url_canonical: product.urlCanonical,
        domain: product.domain,
        page_title: product.pageTitle || null,
        detected_price: product.detectedPrice || null,
        status: 'pending',
      },
      { onConflict: 'url_canonical' }
    );

  if (error) {
    logger.error('Failed to insert discovered product', {
      error: error.message,
      url: product.url,
    });
    throw error;
  }

  logger.debug('Inserted discovered product', {
    url: product.url,
    domain: product.domain,
  });
}

/**
 * Get discovered products, optionally filtered by status
 * @param status - Filter by status (pending, reviewed, ignored, added)
 * @returns Array of discovered product records
 */
export async function getDiscoveredProducts(
  status?: string
): Promise<DiscoveredProduct[]> {
  let query = supabase
    .from('discovered_products')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch discovered products', {
      error: error.message,
      status,
    });
    throw error;
  }

  return data as DiscoveredProduct[];
}

/**
 * Get discovered products by domain
 * @param domain - The domain to filter by
 * @param status - Optional status filter
 * @returns Array of discovered product records
 */
export async function getDiscoveredProductsByDomain(
  domain: string,
  status?: string
): Promise<DiscoveredProduct[]> {
  let query = supabase
    .from('discovered_products')
    .select('*')
    .eq('domain', domain)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch discovered products by domain', {
      error: error.message,
      domain,
      status,
    });
    throw error;
  }

  return data as DiscoveredProduct[];
}

/**
 * Update the status of a discovered product
 * @param id - The discovered product ID
 * @param status - New status (reviewed, ignored, added)
 * @param reviewedBy - Optional reviewer identifier
 */
export async function updateDiscoveredProductStatus(
  id: number,
  status: string,
  reviewedBy?: string
): Promise<void> {
  const { error } = await supabase
    .from('discovered_products')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy || null,
    })
    .eq('id', id);

  if (error) {
    logger.error('Failed to update discovered product status', {
      error: error.message,
      id,
      status,
    });
    throw error;
  }

  logger.info('Updated discovered product status', { id, status, reviewedBy });
}

/**
 * Get a single discovered product by ID
 * @param id - The discovered product ID
 * @returns The discovered product or null if not found
 */
export async function getDiscoveredProductById(
  id: number
): Promise<DiscoveredProduct | null> {
  const { data, error } = await supabase
    .from('discovered_products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    logger.error('Failed to fetch discovered product by ID', {
      error: error.message,
      id,
    });
    throw error;
  }

  return data as DiscoveredProduct;
}

/**
 * Get count of discovered products by status
 * @returns Object with counts per status
 */
export async function getDiscoveredProductCounts(): Promise<{
  pending: number;
  reviewed: number;
  ignored: number;
  added: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from('discovered_products')
    .select('status');

  if (error) {
    logger.error('Failed to fetch discovered product counts', {
      error: error.message,
    });
    throw error;
  }

  const counts = {
    pending: 0,
    reviewed: 0,
    ignored: 0,
    added: 0,
    total: data.length,
  };

  for (const row of data) {
    const status = row.status as keyof typeof counts;
    if (status in counts && status !== 'total') {
      counts[status]++;
    }
  }

  return counts;
}

// ============================================================================
// Offer Discovery Queries
// ============================================================================

/**
 * Discovered offer details for insertion
 */
export interface DiscoveredOfferInput {
  url: string;
  domain: string;
  title: string;
  summary?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Get domain ID by hostname
 * @param hostname - The domain hostname (e.g., 'www.hondamarine.co.nz')
 * @returns The domain ID or null if not found
 */
export async function getDomainIdByHostname(hostname: string): Promise<number | null> {
  // Try matching with and without 'www.' prefix
  const normalizedHostname = hostname.replace(/^www\./, '');

  const { data, error } = await supabase
    .from('domains')
    .select('id, root_url')
    .eq('active', true);

  if (error) {
    logger.error('Failed to fetch domains', { error: error.message });
    throw error;
  }

  // Find matching domain by comparing hostnames
  for (const domain of data) {
    try {
      const domainHostname = new URL(domain.root_url).hostname.replace(/^www\./, '');
      if (domainHostname === normalizedHostname) {
        return domain.id;
      }
    } catch {
      // Skip invalid URLs
    }
  }

  logger.warn('No matching domain found for hostname', { hostname });
  return null;
}

/**
 * Upsert a discovered offer into the offers table
 * Uses the offer_url as the unique identifier for conflict resolution
 * @param offer - The offer details to insert
 * @returns The offer ID
 */
export async function upsertDiscoveredOffer(offer: DiscoveredOfferInput): Promise<number> {
  // Get domain ID from hostname
  const domainId = await getDomainIdByHostname(offer.domain);

  if (!domainId) {
    throw new Error(`No domain found for hostname: ${offer.domain}`);
  }

  const { data, error } = await supabase
    .from('offers')
    .upsert(
      {
        domain_id: domainId,
        title: offer.title,
        summary: offer.summary || null,
        start_date: offer.startDate?.toISOString().split('T')[0] || null,
        end_date: offer.endDate?.toISOString().split('T')[0] || null,
        offer_url: offer.url,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'offer_url' }
    )
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to upsert offer', {
      error: error.message,
      url: offer.url,
    });
    throw error;
  }

  logger.info('Upserted discovered offer', {
    offerId: data.id,
    title: offer.title,
    url: offer.url,
  });

  return data.id;
}

/**
 * Get existing offer URLs for a domain
 * Used to detect new offers that aren't already tracked
 * @param domainHostname - The domain hostname to check
 * @returns Set of offer URLs already in the database
 */
export async function getExistingOfferUrls(domainHostname?: string): Promise<Set<string>> {
  let query = supabase.from('offers').select('offer_url');

  // If domain hostname provided, filter by domain
  if (domainHostname) {
    const domainId = await getDomainIdByHostname(domainHostname);
    if (domainId) {
      query = query.eq('domain_id', domainId);
    }
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch existing offer URLs', { error: error.message });
    throw error;
  }

  return new Set(data.map((row) => row.offer_url));
}

/**
 * Get all offers with optional domain filter
 * @param domainId - Optional domain ID to filter by
 * @returns Array of offer records
 */
export async function getAllOffers(domainId?: number): Promise<Offer[]> {
  let query = supabase
    .from('offers')
    .select('*')
    .order('last_seen_at', { ascending: false });

  if (domainId) {
    query = query.eq('domain_id', domainId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch all offers', { error: error.message });
    throw error;
  }

  return data as Offer[];
}

/**
 * Update offer last_seen_at timestamp
 * @param offerId - The offer ID to update
 */
export async function updateOfferLastSeen(offerId: number): Promise<void> {
  const { error } = await supabase
    .from('offers')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', offerId);

  if (error) {
    logger.error('Failed to update offer last_seen_at', {
      error: error.message,
      offerId,
    });
    throw error;
  }
}

// ============================================================================
// Discovery Deduplication Queries
// ============================================================================

/**
 * Get product IDs from existing discovered products (pending or reviewed).
 * Used to prevent re-discovering products that are already in the discoveries queue.
 *
 * @returns Set of product IDs extracted from discovered product URLs (lowercase)
 */
export async function getDiscoveredProductIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('discovered_products')
    .select('url_canonical')
    .in('status', ['pending', 'reviewed']);

  if (error) {
    logger.error('Failed to fetch discovered product URLs for ID extraction', {
      error: error.message,
    });
    throw error;
  }

  const productIds = new Set<string>();
  for (const row of data) {
    const productId = extractProductId(row.url_canonical);
    if (productId) {
      productIds.add(productId);
    }
  }

  logger.debug('Extracted product IDs from discovered products', {
    urlCount: data.length,
    productIdCount: productIds.size,
  });

  return productIds;
}

/**
 * Represents a duplicate discovery found in the database
 */
export interface DuplicateDiscovery {
  id: number;
  url: string;
  url_canonical: string;
  product_id: string;
  status: string;
}

/**
 * Find duplicate discoveries that share the same product ID (last path segment).
 * Returns duplicates that should be deleted (keeps the one with shortest URL).
 *
 * @returns Array of duplicate discoveries to delete
 */
export async function findDuplicateDiscoveries(): Promise<DuplicateDiscovery[]> {
  // Fetch all pending/reviewed discoveries
  const { data, error } = await supabase
    .from('discovered_products')
    .select('id, url, url_canonical, status, created_at')
    .in('status', ['pending', 'reviewed'])
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Failed to fetch discovered products for deduplication', {
      error: error.message,
    });
    throw error;
  }

  // Group by product ID
  const productIdMap = new Map<
    string,
    Array<{
      id: number;
      url: string;
      url_canonical: string;
      status: string;
      created_at: string;
    }>
  >();

  for (const row of data) {
    const productId = extractProductId(row.url_canonical);
    if (productId && productId.length >= 3) {
      const existing = productIdMap.get(productId) || [];
      existing.push(row);
      productIdMap.set(productId, existing);
    }
  }

  // Find duplicates - keep the one with shortest URL, mark others for deletion
  const duplicates: DuplicateDiscovery[] = [];

  for (const [productId, rows] of productIdMap) {
    if (rows.length > 1) {
      // Sort by URL length (ascending), then by created_at (ascending)
      rows.sort((a, b) => {
        const lenDiff = a.url_canonical.length - b.url_canonical.length;
        if (lenDiff !== 0) return lenDiff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      // First one is kept, rest are duplicates
      for (let i = 1; i < rows.length; i++) {
        duplicates.push({
          id: rows[i].id,
          url: rows[i].url,
          url_canonical: rows[i].url_canonical,
          product_id: productId,
          status: rows[i].status,
        });
      }

      logger.debug('Found duplicate discoveries', {
        productId,
        kept: rows[0].url_canonical,
        duplicates: rows.slice(1).map((r) => r.url_canonical),
      });
    }
  }

  logger.info('Duplicate discovery analysis complete', {
    totalProducts: productIdMap.size,
    duplicatesFound: duplicates.length,
  });

  return duplicates;
}

/**
 * Delete a discovered product by ID
 * @param id - The discovered product ID to delete
 * @returns Whether the deletion was successful
 */
export async function deleteDiscoveredProductById(id: number): Promise<boolean> {
  const { error, count } = await supabase
    .from('discovered_products')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error('Failed to delete discovered product', {
      error: error.message,
      id,
    });
    throw error;
  }

  const deleted = (count ?? 0) > 0 || !error;
  if (deleted) {
    logger.debug('Deleted discovered product', { id });
  }

  return deleted;
}

/**
 * Delete multiple discovered products by their IDs
 * @param ids - Array of discovered product IDs to delete
 * @returns Number of products deleted
 */
export async function deleteDiscoveredProductsByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;

  const { error, count } = await supabase
    .from('discovered_products')
    .delete()
    .in('id', ids);

  if (error) {
    logger.error('Failed to delete discovered products', {
      error: error.message,
      count: ids.length,
    });
    throw error;
  }

  const deletedCount = count ?? ids.length;
  logger.info('Deleted duplicate discovered products', {
    requestedCount: ids.length,
    deletedCount,
  });

  return deletedCount;
}

// ============================================================================
// Shopify Offer Pages Queries
// ============================================================================

/**
 * Create a new Shopify offer page record
 * @param offerId - The offer ID this page is for
 * @param shopifyPageId - The Shopify page GID
 * @param shopifyPageHandle - The URL handle for the page
 * @param heroImageShopifyUrl - Optional URL of the uploaded hero image
 * @param landingTileHtml - Optional cached tile HTML for the landing page
 * @returns The created ShopifyOfferPage record
 */
export async function createShopifyOfferPage(
  offerId: number,
  shopifyPageId: string,
  shopifyPageHandle: string,
  heroImageShopifyUrl?: string | null,
  landingTileHtml?: string | null
): Promise<ShopifyOfferPage> {
  const { data, error } = await supabase
    .from('shopify_offer_pages')
    .insert({
      offer_id: offerId,
      shopify_page_id: shopifyPageId,
      shopify_page_handle: shopifyPageHandle,
      hero_image_shopify_url: heroImageShopifyUrl || null,
      landing_tile_html: landingTileHtml || null,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create Shopify offer page', {
      error: error.message,
      offerId,
      shopifyPageId,
    });
    throw error;
  }

  logger.info('Created Shopify offer page', {
    id: data.id,
    offerId,
    shopifyPageId,
    handle: shopifyPageHandle,
  });

  return data as ShopifyOfferPage;
}

/**
 * Update the status of a Shopify offer page
 * @param id - The shopify_offer_pages record ID
 * @param status - New status ('active', 'hidden', 'deleted')
 * @returns Whether the update was successful
 */
export async function updateShopifyOfferPageStatus(
  id: number,
  status: OfferPageStatus
): Promise<boolean> {
  const { error, count } = await supabase
    .from('shopify_offer_pages')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    logger.error('Failed to update Shopify offer page status', {
      error: error.message,
      id,
      status,
    });
    throw error;
  }

  const updated = (count ?? 0) > 0 || !error;
  logger.info('Updated Shopify offer page status', { id, status, updated });
  return updated;
}

/**
 * Get a Shopify offer page by offer ID
 * @param offerId - The offer ID to look up
 * @returns The ShopifyOfferPage record or null if not found
 */
export async function getShopifyOfferPageByOfferId(
  offerId: number
): Promise<ShopifyOfferPage | null> {
  const { data, error } = await supabase
    .from('shopify_offer_pages')
    .select('*')
    .eq('offer_id', offerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to fetch Shopify offer page by offer ID', {
      error: error.message,
      offerId,
    });
    throw error;
  }

  return data as ShopifyOfferPage | null;
}

/**
 * Get all active Shopify offer pages
 * @returns Array of active ShopifyOfferPage records
 */
export async function getActiveShopifyOfferPages(): Promise<ShopifyOfferPage[]> {
  const { data, error } = await supabase
    .from('shopify_offer_pages')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch active Shopify offer pages', {
      error: error.message,
    });
    throw error;
  }

  return data as ShopifyOfferPage[];
}

/**
 * Update the landing tile HTML for an offer page
 * @param id - The shopify_offer_pages record ID
 * @param landingTileHtml - The new tile HTML
 * @returns Whether the update was successful
 */
export async function updateShopifyOfferPageTileHtml(
  id: number,
  landingTileHtml: string
): Promise<boolean> {
  const { error, count } = await supabase
    .from('shopify_offer_pages')
    .update({
      landing_tile_html: landingTileHtml,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    logger.error('Failed to update Shopify offer page tile HTML', {
      error: error.message,
      id,
    });
    throw error;
  }

  const updated = (count ?? 0) > 0 || !error;
  logger.debug('Updated Shopify offer page tile HTML', { id, updated });
  return updated;
}

// ============================================================================
// Offer Product Links Queries
// ============================================================================

/**
 * Link a product to an offer
 * @param offerId - The offer ID
 * @param productId - The product ID (from shopify_catalog_cache)
 * @returns The created OfferProductLink record
 */
export async function linkProductToOffer(
  offerId: number,
  productId: number
): Promise<OfferProductLink> {
  const { data, error } = await supabase
    .from('offer_product_links')
    .upsert(
      {
        offer_id: offerId,
        product_id: productId,
      },
      { onConflict: 'offer_id,product_id' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to link product to offer', {
      error: error.message,
      offerId,
      productId,
    });
    throw error;
  }

  logger.debug('Linked product to offer', { offerId, productId, linkId: data.id });
  return data as OfferProductLink;
}

/**
 * Unlink a product from an offer
 * @param offerId - The offer ID
 * @param productId - The product ID
 * @returns Whether the unlink was successful
 */
export async function unlinkProductFromOffer(
  offerId: number,
  productId: number
): Promise<boolean> {
  const { error, count } = await supabase
    .from('offer_product_links')
    .delete()
    .eq('offer_id', offerId)
    .eq('product_id', productId);

  if (error) {
    logger.error('Failed to unlink product from offer', {
      error: error.message,
      offerId,
      productId,
    });
    throw error;
  }

  const deleted = (count ?? 0) > 0 || !error;
  logger.debug('Unlinked product from offer', { offerId, productId, deleted });
  return deleted;
}

/**
 * Get all products linked to an offer
 * Returns full ShopifyCatalogCache entries for displaying product info
 * @param offerId - The offer ID
 * @returns Array of ShopifyCatalogCache entries linked to the offer
 */
export async function getProductsForOffer(
  offerId: number
): Promise<ShopifyCatalogCache[]> {
  const { data, error } = await supabase
    .from('offer_product_links')
    .select('product_id')
    .eq('offer_id', offerId);

  if (error) {
    logger.error('Failed to fetch product links for offer', {
      error: error.message,
      offerId,
    });
    throw error;
  }

  if (data.length === 0) {
    return [];
  }

  const productIds = data.map((link) => link.product_id);

  const { data: products, error: productsError } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .in('id', productIds);

  if (productsError) {
    logger.error('Failed to fetch products for offer', {
      error: productsError.message,
      offerId,
      productIds,
    });
    throw productsError;
  }

  return products as ShopifyCatalogCache[];
}

/**
 * Get all offers a product is linked to
 * @param productId - The product ID (from shopify_catalog_cache)
 * @returns Array of Offer records
 */
export async function getOffersForProduct(productId: number): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('offer_product_links')
    .select('offer_id')
    .eq('product_id', productId);

  if (error) {
    logger.error('Failed to fetch offer links for product', {
      error: error.message,
      productId,
    });
    throw error;
  }

  if (data.length === 0) {
    return [];
  }

  const offerIds = data.map((link) => link.offer_id);

  const { data: offers, error: offersError } = await supabase
    .from('offers')
    .select('*')
    .in('id', offerIds);

  if (offersError) {
    logger.error('Failed to fetch offers for product', {
      error: offersError.message,
      productId,
      offerIds,
    });
    throw offersError;
  }

  return offers as Offer[];
}

/**
 * Get offer by ID
 * @param offerId - The offer ID
 * @returns The Offer record or null if not found
 */
export async function getOfferById(offerId: number): Promise<Offer | null> {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('id', offerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to fetch offer by ID', {
      error: error.message,
      offerId,
    });
    throw error;
  }

  return data as Offer | null;
}

/**
 * Update offer end date
 * @param offerId - The offer ID
 * @param endDate - The new end date
 * @returns Whether the update was successful
 */
export async function updateOfferEndDate(
  offerId: number,
  endDate: Date
): Promise<boolean> {
  const { error, count } = await supabase
    .from('offers')
    .update({
      end_date: endDate.toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId);

  if (error) {
    logger.error('Failed to update offer end date', {
      error: error.message,
      offerId,
      endDate,
    });
    throw error;
  }

  const updated = (count ?? 0) > 0 || !error;
  logger.info('Updated offer end date', { offerId, endDate, updated });
  return updated;
}

/**
 * Get expired active offer pages (for expiration service)
 * Returns offer pages where status='active' and the linked offer's end_date is in the past
 * @returns Array of expired ShopifyOfferPage records with their offer data
 */
export async function getExpiredActiveOfferPages(): Promise<
  Array<ShopifyOfferPage & { offer: Offer }>
> {
  const today = new Date().toISOString().split('T')[0];

  // Get all active offer pages
  const { data: offerPages, error: pagesError } = await supabase
    .from('shopify_offer_pages')
    .select('*')
    .eq('status', 'active');

  if (pagesError) {
    logger.error('Failed to fetch active offer pages for expiration check', {
      error: pagesError.message,
    });
    throw pagesError;
  }

  if (offerPages.length === 0) {
    return [];
  }

  // Get the offers for these pages
  const offerIds = offerPages.map((page) => page.offer_id);
  const { data: offers, error: offersError } = await supabase
    .from('offers')
    .select('*')
    .in('id', offerIds)
    .lt('end_date', today);

  if (offersError) {
    logger.error('Failed to fetch offers for expiration check', {
      error: offersError.message,
    });
    throw offersError;
  }

  // Match expired offers with their pages
  const expiredOfferIds = new Set(offers.map((o) => o.id));
  const expiredPages = offerPages
    .filter((page) => expiredOfferIds.has(page.offer_id))
    .map((page) => ({
      ...page,
      offer: offers.find((o) => o.id === page.offer_id)!,
    })) as Array<ShopifyOfferPage & { offer: Offer }>;

  logger.debug('Found expired active offer pages', {
    totalActivePages: offerPages.length,
    expiredCount: expiredPages.length,
  });

  return expiredPages;
}

/**
 * Get offers expiring within a specified number of days
 * @param withinDays - Number of days to look ahead (default: 7)
 * @returns Array of offers expiring soon
 */
export async function getExpiringOffers(withinDays: number = 7): Promise<Offer[]> {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + withinDays);

  const todayStr = today.toISOString().split('T')[0];
  const futureDateStr = futureDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .gte('end_date', todayStr)
    .lte('end_date', futureDateStr)
    .order('end_date', { ascending: true });

  if (error) {
    logger.error('Failed to fetch expiring offers', {
      error: error.message,
      withinDays,
    });
    throw error;
  }

  return data as Offer[];
}

