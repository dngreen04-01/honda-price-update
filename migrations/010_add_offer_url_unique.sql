-- Migration: Add unique constraint on offer_url for upsert support
-- This enables the crawler to upsert discovered offers without duplicates

-- Add unique constraint on offer_url
ALTER TABLE offers ADD CONSTRAINT offers_offer_url_unique UNIQUE (offer_url);

-- Add index on offer_url for faster lookups
CREATE INDEX IF NOT EXISTS idx_offers_offer_url ON offers(offer_url);
