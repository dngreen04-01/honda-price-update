# Database Migration Required

## Instructions

The simplified scraper requires new columns in the `shopify_catalog_cache` table to store scraped prices.

### Step 1: Run Migration in Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/fpuhbowlnupfalcgikyz
2. Navigate to **SQL Editor**
3. Copy and paste the following SQL:

```sql
-- Add scraped price columns to shopify_catalog_cache
ALTER TABLE shopify_catalog_cache
ADD COLUMN IF NOT EXISTS scraped_sale_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS scraped_original_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS scrape_confidence DECIMAL(3, 2),
ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_last_scraped
ON shopify_catalog_cache(last_scraped_at);

-- Add comments for documentation
COMMENT ON COLUMN shopify_catalog_cache.scraped_sale_price
IS 'Current sale price scraped from supplier website';

COMMENT ON COLUMN shopify_catalog_cache.scraped_original_price
IS 'Original (compare at) price scraped from supplier website';

COMMENT ON COLUMN shopify_catalog_cache.scrape_confidence
IS 'Confidence score for price extraction (0.0-1.0)';

COMMENT ON COLUMN shopify_catalog_cache.last_scraped_at
IS 'Timestamp of last successful scrape';
```

4. Click **Run** to execute the migration

### Step 2: Verify Migration

After running the SQL, verify the migration worked by running:

```bash
node verify-migration.js
```

This will check that the new columns exist and are ready to use.

### Step 3: Test Simplified Scraper

Once verified, test the scraper with:

```bash
npm run scrape:test
```

This will scrape a small subset of products to verify everything works before running the full scrape.

## What Changed

The scraper has been **simplified** to focus only on scraping URLs that already exist in Shopify:

**Before** (Complex):
- Discover URLs using Firecrawl Map
- Filter discovered URLs against Shopify
- Scrape filtered URLs
- Store in multiple tables

**After** (Simple):
- Load URLs directly from `shopify_catalog_cache.source_url_canonical`
- Scrape these URLs with Bright Data
- Store prices back in `shopify_catalog_cache`

**Benefits**:
- ✅ Simpler architecture (one table, one flow)
- ✅ Faster (no discovery step)
- ✅ Cheaper (only scrape known products)
- ✅ More reliable (fewer moving parts)

## New Database Schema

The `shopify_catalog_cache` table now serves as the **single source of truth**:

| Column | Type | Purpose |
|--------|------|---------|
| `shopify_price` | DECIMAL | Current Shopify price |
| `shopify_compare_at_price` | DECIMAL | Shopify compare-at price |
| `scraped_sale_price` | DECIMAL | **NEW** - Scraped supplier price |
| `scraped_original_price` | DECIMAL | **NEW** - Scraped supplier compare-at |
| `scrape_confidence` | DECIMAL | **NEW** - Extraction confidence (0.0-1.0) |
| `last_scraped_at` | TIMESTAMP | **NEW** - Last scrape timestamp |

## Next Steps

1. ✅ Run the SQL migration above
2. ⏳ Verify migration with `node verify-migration.js`
3. ⏳ Test scraper with small subset
4. ⏳ Run full scrape on all products
5. ⏳ Set up price comparison logic
6. ⏳ Add automatic price sync to Shopify
