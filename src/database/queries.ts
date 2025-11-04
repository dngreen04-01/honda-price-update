import { supabase } from './client.js';
import {
  Domain,
  ProductPage,
  PriceHistory,
  Offer,
  ShopifyCatalogCache,
  ReconcileResult,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

// Domains
export async function getActiveDomains(): Promise<Domain[]> {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .eq('active', true)
    .order('id');

  if (error) {
    logger.error('Failed to fetch active domains', { error: error.message });
    throw error;
  }

  return data as Domain[];
}

// Product Pages
export async function upsertProductPage(
  domainId: number,
  canonicalUrl: string,
  salePrice: number | null,
  originalPrice: number | null,
  currency: string,
  confidence: 'high' | 'low',
  htmlSnippet: string | null
): Promise<ProductPage> {
  const { data, error } = await supabase
    .from('product_pages')
    .upsert(
      {
        domain_id: domainId,
        canonical_url: canonicalUrl,
        latest_sale_price: salePrice,
        latest_original_price: originalPrice,
        currency,
        confidence,
        html_snippet: htmlSnippet,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'canonical_url' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to upsert product page', { error: error.message, canonicalUrl });
    throw error;
  }

  return data as ProductPage;
}

export async function getProductPageByUrl(canonicalUrl: string): Promise<ProductPage | null> {
  const { data, error } = await supabase
    .from('product_pages')
    .select('*')
    .eq('canonical_url', canonicalUrl)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    logger.error('Failed to fetch product page', { error: error.message, canonicalUrl });
    throw error;
  }

  return data as ProductPage | null;
}

export async function getAllProductPages(): Promise<ProductPage[]> {
  const { data, error } = await supabase
    .from('product_pages')
    .select('*')
    .order('last_seen_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch all product pages', { error: error.message });
    throw error;
  }

  return data as ProductPage[];
}

// Price History
export async function insertPriceHistory(
  productPageId: number,
  salePrice: number | null,
  originalPrice: number | null,
  currency: string,
  source: 'deterministic' | 'llm',
  confidence: 'high' | 'low',
  htmlSnippet: string | null
): Promise<PriceHistory> {
  const { data, error } = await supabase
    .from('price_history')
    .insert({
      product_page_id: productPageId,
      sale_price: salePrice,
      original_price: originalPrice,
      currency,
      source,
      confidence,
      html_snippet: htmlSnippet,
      scraped_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to insert price history', { error: error.message, productPageId });
    throw error;
  }

  return data as PriceHistory;
}

export async function getPriceHistory(productPageId: number, limit = 10): Promise<PriceHistory[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_page_id', productPageId)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to fetch price history', { error: error.message, productPageId });
    throw error;
  }

  return data as PriceHistory[];
}

// Offers
export async function upsertOffer(
  domainId: number,
  title: string,
  summary: string | null,
  startDate: string | null,
  endDate: string | null,
  offerUrl: string
): Promise<Offer> {
  const { data, error } = await supabase
    .from('offers')
    .upsert(
      {
        domain_id: domainId,
        title,
        summary,
        start_date: startDate,
        end_date: endDate,
        offer_url: offerUrl,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'offer_url' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to upsert offer', { error: error.message, offerUrl });
    throw error;
  }

  return data as Offer;
}

export async function getRecentOffers(domainId?: number, days = 7): Promise<Offer[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  let query = supabase
    .from('offers')
    .select('*')
    .gte('last_seen_at', cutoffDate.toISOString())
    .order('last_seen_at', { ascending: false });

  if (domainId !== undefined) {
    query = query.eq('domain_id', domainId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch recent offers', { error: error.message });
    throw error;
  }

  return data as Offer[];
}

// Shopify Catalog Cache
export async function upsertShopifyCatalogCache(
  shopifyProductId: string,
  shopifyVariantId: string,
  sourceUrlCanonical: string,
  shopifyPrice: number,
  shopifyCompareAtPrice: number | null
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
    logger.error('Failed to insert reconcile result', { error: error.message, canonicalUrl });
    throw error;
  }

  return data as ReconcileResult;
}

export async function getReconcileResults(runId: string): Promise<ReconcileResult[]> {
  const { data, error } = await supabase
    .from('reconcile_results')
    .select('*')
    .eq('run_id', runId)
    .order('detected_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch reconcile results', { error: error.message, runId });
    throw error;
  }

  return data as ReconcileResult[];
}
