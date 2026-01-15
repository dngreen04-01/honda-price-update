-
- Add scraped price columns to shopify_catalog_cache
ALTER TABLE shopify_catalog_cache
ADD COLUMN IF NOT EXISTS scraped_sale_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS scraped_original_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS scrape_confidence DECIMAL(3, 2),
ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_last_scraped ON shopify_catalog_cache(last_scraped_at);

-- Add comments
COMMENT ON COLUMN shopify_catalog_cache.scraped_sale_price IS 'Current sale price scraped from supplier website';
COMMENT ON COLUMN shopify_catalog_cache.scraped_original_price IS 'Original (compare at) price scraped from supplier website';
COMMENT ON COLUMN shopify_catalog_cache.scrape_confidence IS 'Confidence score for price extraction (0.0-1.0)';
COMMENT ON COLUMN shopify_catalog_cache.last_scraped_at IS 'Timestamp of last successful scrape';
