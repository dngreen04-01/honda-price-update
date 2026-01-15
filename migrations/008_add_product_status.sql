-- Migration: Add product status field to shopify_catalog_cache
-- This allows tracking of product lifecycle status (active, inactive, discontinued)

-- Add status column with default 'active'
ALTER TABLE shopify_catalog_cache
ADD COLUMN IF NOT EXISTS product_status TEXT
DEFAULT 'active'
CHECK (product_status IN ('active', 'inactive', 'discontinued'));

-- Add discontinued_at timestamp
ALTER TABLE shopify_catalog_cache
ADD COLUMN IF NOT EXISTS discontinued_at TIMESTAMPTZ;

-- Add discontinued_reason for tracking why product was marked discontinued
ALTER TABLE shopify_catalog_cache
ADD COLUMN IF NOT EXISTS discontinued_reason TEXT;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_status ON shopify_catalog_cache(product_status);

-- Update existing products without source_url to be marked as inactive
UPDATE shopify_catalog_cache
SET product_status = 'inactive',
    discontinued_at = NOW(),
    discontinued_reason = 'No source URL'
WHERE source_url_canonical IS NULL
  AND product_status = 'active';
