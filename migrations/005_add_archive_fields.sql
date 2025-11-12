-- Migration: Add archive functionality to product_pages
-- Date: 2025-11-06
-- Purpose: Track discontinued products

-- Add archived fields to product_pages table
ALTER TABLE product_pages
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Add index for querying active products
CREATE INDEX IF NOT EXISTS idx_product_pages_archived ON product_pages(archived, last_seen_at);

-- Add comment
COMMENT ON COLUMN product_pages.archived IS 'Whether this product has been archived (discontinued)';
COMMENT ON COLUMN product_pages.archived_at IS 'When the product was archived';
COMMENT ON COLUMN product_pages.archive_reason IS 'Reason for archiving (e.g., discontinued, unavailable)';

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Migration 005 completed: Added archive fields to product_pages';
END $$;
