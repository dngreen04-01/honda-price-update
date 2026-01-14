-- Migration 002: Drop Legacy Tables
--
-- This migration removes deprecated tables from the old multi-table architecture.
-- The system now uses a simplified architecture with shopify_catalog_cache as the
-- single source of truth for price comparison.
--
-- DEPRECATED TABLES:
-- - product_pages: Replaced by shopify_catalog_cache.scraped_sale_price
-- - price_history: No longer needed (price changes tracked in shopify_catalog_cache)
-- - domains: No longer needed (URLs stored directly in shopify_catalog_cache)
-- - offers: Not used by current system
-- - reconcile_results: Depends on deprecated product_pages table
--
-- ACTIVE TABLES (NOT TOUCHED):
-- - shopify_catalog_cache: Main price comparison table
-- - user_profiles, user_invitations, user_roles: User management
--
-- To run this migration:
-- psql -d your_database -f 002_drop_legacy_tables.sql
-- OR via Supabase SQL Editor

-- Begin transaction
BEGIN;

-- Drop tables in correct order (respect foreign key constraints)
-- price_history references product_pages, so drop it first

-- 1. Drop price_history table (references product_pages)
DROP TABLE IF EXISTS price_history CASCADE;

-- 2. Drop offers table (references domains)
DROP TABLE IF EXISTS offers CASCADE;

-- 3. Drop product_pages table (references domains)
DROP TABLE IF EXISTS product_pages CASCADE;

-- 4. Drop reconcile_results table (standalone but depends on old architecture)
DROP TABLE IF EXISTS reconcile_results CASCADE;

-- 5. Drop domains table (base table for old architecture)
DROP TABLE IF EXISTS domains CASCADE;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 002 completed: Dropped legacy tables (product_pages, price_history, domains, offers, reconcile_results)';
END $$;

COMMIT;

-- Verification query (run after migration to confirm)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
