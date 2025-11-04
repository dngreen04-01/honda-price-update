// Database Models
export interface Domain {
  id: number;
  root_url: string;
  active: boolean;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ProductPage {
  id: number;
  domain_id: number;
  canonical_url: string;
  latest_sale_price: number | null;
  latest_original_price: number | null;
  currency: string;
  confidence: 'high' | 'low';
  html_snippet: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: number;
  product_page_id: number;
  sale_price: number | null;
  original_price: number | null;
  currency: string;
  source: 'deterministic' | 'llm';
  confidence: 'high' | 'low';
  html_snippet: string | null;
  scraped_at: string;
}

export interface Offer {
  id: number;
  domain_id: number;
  title: string;
  summary: string | null;
  start_date: string | null;
  end_date: string | null;
  offer_url: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyCatalogCache {
  id: number;
  shopify_product_id: string;
  shopify_variant_id: string;
  source_url_canonical: string;
  shopify_price: number;
  shopify_compare_at_price: number | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface ReconcileResult {
  id: number;
  run_id: string;
  product_type: 'supplier_only' | 'shopify_only';
  canonical_url: string;
  status: 'active' | 'redirect' | '404' | 'pending';
  detected_at: string;
  resolved_at: string | null;
}

// Scraper Types
export interface ExtractedPrice {
  salePrice: number | null;
  originalPrice: number | null;
  currency: string;
  confidence: 'high' | 'low';
  source: 'deterministic' | 'llm';
  htmlSnippet?: string;
}

export interface ScrapedProduct {
  url: string;
  canonicalUrl: string;
  extractedPrice: ExtractedPrice;
}

export interface FirecrawlMapResult {
  success: boolean;
  links: string[];
}

export interface FirecrawlCrawlResult {
  success: boolean;
  data: Array<{
    url: string;
    html: string;
    metadata?: {
      title?: string;
      description?: string;
    };
  }>;
}

// Shopify Types
export interface ShopifyProduct {
  id: string;
  variants: {
    edges: Array<{
      node: {
        id: string;
        price: string;
        compareAtPrice: string | null;
      };
    }>;
  };
  metafields: {
    edges: Array<{
      node: {
        namespace: string;
        key: string;
        value: string;
      };
    }>;
  };
}

export interface ShopifyPriceUpdate {
  variantId: string;
  price: string;
  compareAtPrice: string | null;
}

// Email Types
export interface PriceChange {
  productUrl: string;
  oldSalePrice: number | null;
  newSalePrice: number | null;
  oldOriginalPrice: number | null;
  newOriginalPrice: number | null;
  changePercent: number;
}

export interface EmailDigestData {
  priceChanges: PriceChange[];
  newOffers: Offer[];
  supplierOnlyProducts: string[];
  shopifyOnlyProducts: string[];
  stats: {
    totalProductsScraped: number;
    successfulExtractions: number;
    shopifySynced: number;
    emailsSent: number;
  };
}

// Configuration
export interface Config {
  supabase: {
    url: string;
    serviceKey: string;
  };
  firecrawl: {
    apiKey: string;
  };
  shopify: {
    storeDomain: string;
    accessToken: string;
    apiVersion: string;
  };
  sendgrid: {
    apiKey: string;
    fromEmail: string;
    templateId: string;
    recipients: string[];
  };
  app: {
    timezone: string;
    logLevel: string;
  };
}

// Utility Types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
