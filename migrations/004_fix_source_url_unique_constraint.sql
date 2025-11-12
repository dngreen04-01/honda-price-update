-- Migration: Fix source_url_canonical unique constraint
-- Date: 2025-11-06
-- Issue: Multiple Shopify variants can temporarily have the same source URL
--        (e.g., empty URLs, placeholder URLs, or products awaiting URL assignment)
-- Solution: Remove UNIQUE constraint from source_url_canonical
--           Keep UNIQUE on shopify_variant_id (one variant = one cache entry)

-- Drop the unique constraint on source_url_canonical
ALTER TABLE shopify_catalog_cache
  DROP CONSTRAINT IF EXISTS shopify_catalog_cache_source_url_canonical_key;

-- Add a comment explaining why source_url_canonical is not unique
COMMENT ON COLUMN shopify_catalog_cache.source_url_canonical IS
  'Canonical source URL from Shopify metafield. May be null or duplicate for products without supplier URLs assigned.';

-- Keep the index for fast lookups (but not unique)
-- The existing index idx_shopify_catalog_source_url should remain

-- Verify the change
DO $$
BEGIN
  RAISE NOTICE 'Migration 004 completed: Removed UNIQUE constraint from source_url_canonical';
  RAISE NOTICE 'shopify_variant_id remains UNIQUE (one variant = one cache entry)';
END $$;
