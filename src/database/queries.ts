import { supabase } from './client.js';
import {
  ShopifyCatalogCache,
  ProductPage,
  PriceHistory,
  Offer,
  Domain,
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

