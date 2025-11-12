-- Add source_url (original, non-canonicalized) column
-- This stores the original URL from Shopify metafield custom.source_url
-- We need this for scraping because some websites require www. subdomain

ALTER TABLE shopify_catalog_cache
ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add comment
COMMENT ON COLUMN shopify_catalog_cache.source_url
IS 'Original source URL from Shopify metafield (non-canonicalized, used for scraping)';

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_source_url
ON shopify_catalog_cache(source_url);
