-- Supplier Website Price Scraper Database Schema
-- PostgreSQL / Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Domains table
CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  root_url TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Pacific/Auckland',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product pages table
CREATE TABLE IF NOT EXISTS product_pages (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  canonical_url TEXT NOT NULL UNIQUE,
  latest_sale_price DECIMAL(10, 2),
  latest_original_price DECIMAL(10, 2),
  currency TEXT DEFAULT 'NZD',
  confidence TEXT CHECK (confidence IN ('high', 'low')) DEFAULT 'high',
  html_snippet TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  product_page_id INTEGER NOT NULL REFERENCES product_pages(id) ON DELETE CASCADE,
  sale_price DECIMAL(10, 2),
  original_price DECIMAL(10, 2),
  currency TEXT DEFAULT 'NZD',
  source TEXT CHECK (source IN ('deterministic', 'llm')) DEFAULT 'deterministic',
  confidence TEXT CHECK (confidence IN ('high', 'low')) DEFAULT 'high',
  html_snippet TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offers table
CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  start_date DATE,
  end_date DATE,
  offer_url TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shopify catalog cache table
CREATE TABLE IF NOT EXISTS shopify_catalog_cache (
  id SERIAL PRIMARY KEY,
  shopify_product_id TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL UNIQUE,
  source_url_canonical TEXT NOT NULL UNIQUE,
  shopify_price DECIMAL(10, 2) NOT NULL,
  shopify_compare_at_price DECIMAL(10, 2),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reconcile results table
CREATE TABLE IF NOT EXISTS reconcile_results (
  id SERIAL PRIMARY KEY,
  run_id UUID DEFAULT uuid_generate_v4(),
  product_type TEXT CHECK (product_type IN ('supplier_only', 'shopify_only')) NOT NULL,
  canonical_url TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'redirect', '404', 'pending')) DEFAULT 'pending',
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_pages_canonical_url ON product_pages(canonical_url);
CREATE INDEX IF NOT EXISTS idx_product_pages_domain_id ON product_pages(domain_id);
CREATE INDEX IF NOT EXISTS idx_product_pages_last_seen ON product_pages(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_history_product_page_id ON price_history(product_page_id);
CREATE INDEX IF NOT EXISTS idx_price_history_scraped_at ON price_history(scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_offers_domain_id ON offers(domain_id);
CREATE INDEX IF NOT EXISTS idx_offers_last_seen ON offers(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_catalog_source_url ON shopify_catalog_cache(source_url_canonical);
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_variant_id ON shopify_catalog_cache(shopify_variant_id);

CREATE INDEX IF NOT EXISTS idx_reconcile_results_run_id ON reconcile_results(run_id);
CREATE INDEX IF NOT EXISTS idx_reconcile_results_type ON reconcile_results(product_type);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_pages_updated_at BEFORE UPDATE ON product_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shopify_catalog_cache_updated_at BEFORE UPDATE ON shopify_catalog_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed initial domains
INSERT INTO domains (root_url, active, timezone) VALUES
  ('https://www.hondaoutdoors.co.nz', true, 'Pacific/Auckland'),
  ('https://www.hondamarine.co.nz', true, 'Pacific/Auckland'),
  ('https://www.hondamotorbikes.co.nz', true, 'Pacific/Auckland')
ON CONFLICT (root_url) DO NOTHING;

-- Row Level Security (Optional - enable if needed)
-- ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE product_pages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE shopify_catalog_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reconcile_results ENABLE ROW LEVEL SECURITY;
