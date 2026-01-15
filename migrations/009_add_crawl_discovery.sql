-- Migration: Add crawl discovery tables for new product and offer detection
-- This enables the crawler to track discovered URLs and present them for review

-- Crawl run tracking
CREATE TABLE IF NOT EXISTS crawl_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'running',
  sites_crawled TEXT[],
  urls_discovered INTEGER DEFAULT 0,
  new_products_found INTEGER DEFAULT 0,
  new_offers_found INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Discovered products awaiting review
CREATE TABLE IF NOT EXISTS discovered_products (
  id SERIAL PRIMARY KEY,
  crawl_run_id INTEGER REFERENCES crawl_runs(id),
  url TEXT NOT NULL,
  url_canonical TEXT NOT NULL,
  domain TEXT NOT NULL,
  page_title TEXT,
  detected_price DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  reviewed_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(url_canonical)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_discovered_products_status ON discovered_products(status);
CREATE INDEX IF NOT EXISTS idx_discovered_products_domain ON discovered_products(domain);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_status ON crawl_runs(status);
