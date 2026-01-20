-- Migration: Add tables for Shopify offer page management
-- Enables tracking offer pages pushed to Shopify and linking offers to products

-- Shopify offer pages tracking
CREATE TABLE IF NOT EXISTS shopify_offer_pages (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  shopify_page_id TEXT NOT NULL,
  shopify_page_handle TEXT NOT NULL,
  hero_image_shopify_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted')),
  landing_tile_html TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(offer_id)
);

-- Offer to product links (many-to-many)
CREATE TABLE IF NOT EXISTS offer_product_links (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES shopify_catalog_cache(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(offer_id, product_id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_shopify_offer_pages_offer_id ON shopify_offer_pages(offer_id);
CREATE INDEX IF NOT EXISTS idx_shopify_offer_pages_status ON shopify_offer_pages(status);
CREATE INDEX IF NOT EXISTS idx_shopify_offer_pages_shopify_page_id ON shopify_offer_pages(shopify_page_id);
CREATE INDEX IF NOT EXISTS idx_offer_product_links_offer_id ON offer_product_links(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_product_links_product_id ON offer_product_links(product_id);
