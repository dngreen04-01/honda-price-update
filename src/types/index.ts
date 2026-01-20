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
  // Added via migrations - optional for backwards compatibility
  product_title?: string;
  variant_title?: string;
  variant_sku?: string;
  scraped_sale_price?: number;
  scraped_original_price?: number;
  scrape_confidence?: number;
  last_scraped_at?: string;
  product_status?: 'active' | 'inactive' | 'discontinued';
  discontinued_at?: string;
  discontinued_reason?: string;
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

// Shopify Types
export interface ShopifyProduct {
  id: string;
  title: string;
  variants: {
    edges: Array<{
      node: {
        id: string;
        title?: string;
        sku?: string;
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
  productId: string;
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
  stats: {
    totalProductsScraped: number;
    successfulExtractions: number;
    shopifySynced: number;
    emailsSent: number;
  };
}

// User Management Types
export interface UserRole {
  id: number;
  name: 'superuser' | 'admin' | 'viewer';
  description: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  role_id: number;
  role?: UserRole;
  invited_by: string | null;
  invited_at: string | null;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  role_id: number;
  role?: UserRole;
  invited_by: string;
  invited_by_email?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

// Configuration
export interface Config {
  supabase: {
    url: string;
    serviceKey: string;
  };
  scrapling: {
    serviceUrl: string;
    timeoutMs?: number;
    maxRetries?: number;
    renderJs?: boolean;
    proxyUrl?: string;
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
  gemini: {
    apiKey: string;
    textModel: string;
    imageModel: string;
  };
  app: {
    timezone: string;
    logLevel: string;
    superuserEmail: string;
  };
  offers: {
    landingPageHandle: string;
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

// Bike Product Scraping Types (hondamotorbikes.co.nz)
export interface BikeFeature {
  title: string | null;
  description: string | null;
  image: string | null;
}

export interface BikeSpecification {
  label: string;
  value: string;
}

export interface BikeSpecificationCategory {
  category: string;
  specs: BikeSpecification[];
}

export interface BikeProductAssets {
  url: string;
  scrapedAt: string;

  images: {
    hero: string | null;
    product: string | null;
    features: (string | null)[];
  };

  content: {
    title: string | null;
    description: string | null;
    features: BikeFeature[];
  };

  specifications: BikeSpecificationCategory[];
}

// Push to Shopify Types
export interface CreateProductInput {
  title: string;
  descriptionHtml: string;
  vendor: string;
  status: 'DRAFT' | 'ACTIVE';
  templateSuffix?: string; // Theme template suffix (e.g., 'motorbikes')
  variants: CreateVariantInput[];
  metafields: CreateMetafieldInput[];
}

export interface CreateVariantInput {
  sku: string;
  price: string;
  inventoryPolicy: 'DENY' | 'CONTINUE';
  imageSrc?: string;
}

export interface CreateMetafieldInput {
  namespace: string;
  key: string;
  value: string;
  type: 'single_line_text_field' | 'multi_line_text_field' | 'url' | 'file_reference';
}

export interface PushToShopifyResult {
  success: boolean;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  shopifyProductUrl?: string;
  error?: string;
  warnings?: string[];
}

export type ProductTemplate = 'motorbikes' | 'outboard-motors' | 'default';

// Offer Page Management Types
export type OfferPageStatus = 'active' | 'hidden' | 'deleted';

export interface ShopifyOfferPage {
  id: number;
  offer_id: number;
  shopify_page_id: string;
  shopify_page_handle: string;
  hero_image_shopify_url: string | null;
  status: OfferPageStatus;
  landing_tile_html: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferProductLink {
  id: number;
  offer_id: number;
  product_id: number;
  created_at: string;
}

export interface OfferWithProducts extends Offer {
  shopifyOfferPage?: ShopifyOfferPage | null;
  linkedProducts?: ShopifyCatalogCache[];
}

// Scraped Offer Content (from supplier pages)
export interface ScrapedOfferContent {
  heroImageUrl: string | null;
  title: string;
  bodyHtml: string;
  termsText: string | null;
  endDate: Date | null;
  startDate: Date | null;
  productUrls: string[];
  sourceUrl: string;
}

// Shopify Page Types
export interface ShopifyPage {
  id: string;
  title: string;
  handle: string;
  bodyHtml: string;
  isPublished: boolean;
}

// Offer Push Workflow Types
export interface PushOfferResult {
  success: boolean;
  shopifyPageId?: string;
  shopifyPageUrl?: string;
  message?: string;
  warnings?: string[];
}

export interface ExpireResult {
  expiredCount: number;
  errors: string[];
}
