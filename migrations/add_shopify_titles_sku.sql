-- Add product title, variant title, and SKU to shopify_catalog_cache table
-- Migration: add_shopify_titles_sku
-- Date: 2025-11-05

ALTER TABLE shopify_catalog_cache
  ADD COLUMN IF NOT EXISTS product_title TEXT,
  ADD COLUMN IF NOT EXISTS variant_title TEXT,
  ADD COLUMN IF NOT EXISTS variant_sku TEXT;

-- Create index for searching
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_product_title ON shopify_catalog_cache(product_title);
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_variant_sku ON shopify_catalog_cache(variant_sku);

-- Comment on columns
COMMENT ON COLUMN shopify_catalog_cache.product_title IS 'Shopify product title';
COMMENT ON COLUMN shopify_catalog_cache.variant_title IS 'Shopify variant title';
COMMENT ON COLUMN shopify_catalog_cache.variant_sku IS 'Shopify variant SKU';
