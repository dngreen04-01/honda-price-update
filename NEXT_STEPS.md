# Next Steps - Simplified Scraper Implementation

## Current Status

✅ **Completed:**
- Simplified [scraper-orchestrator.ts](src/scraper/scraper-orchestrator.ts) - removed URL discovery, now just loads from Shopify
- Updated [puppeteer-client.ts](src/scraper/puppeteer-client.ts) - fixed to create new browser session per URL (Bright Data requirement)
- Created [updateScrapedPrices()](src/database/queries.ts) - stores scraped prices in shopify_catalog_cache
- Created migration file [006_add_scraped_prices_to_catalog.sql](migrations/006_add_scraped_prices_to_catalog.sql)
- Added npm scripts for testing and verification

⏳ **Pending:**
1. Run database migration in Supabase Dashboard
2. Verify migration completed successfully
3. Test scraper with small subset (3 URLs)
4. Run full scrape on all products

---

## Step-by-Step Instructions

### Step 1: Run Database Migration (REQUIRED)

**Why**: The simplified scraper stores scraped prices directly in `shopify_catalog_cache`, but the new columns don't exist yet.

**Action:**
1. Open Supabase Dashboard: https://supabase.com/dashboard/project/fpuhbowlnupfalcgikyz
2. Go to **SQL Editor**
3. Copy the SQL from [migrations/006_add_scraped_prices_to_catalog.sql](migrations/006_add_scraped_prices_to_catalog.sql)
4. Paste and click **Run**

**Alternatively**, copy this SQL directly:

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
```

**Verify it worked:**
```bash
npm run db:verify
```

You should see:
```
✅ Migration verified successfully!
📊 New columns detected:
   - scraped_sale_price
   - scraped_original_price
   - scrape_confidence
   - last_scraped_at
```

---

### Step 2: Test Scraper (Small Subset)

**Why**: Verify everything works before running full scrape on 850+ products.

**Action:**
```bash
npm run scrape:test
```

This will:
- Load first 3 products from Shopify with source URLs
- Scrape them with Bright Data (concurrency: 2)
- Store scraped prices in shopify_catalog_cache
- Show success rate

**Expected Output:**
```
🧪 Testing simplified scraper with small subset...

📊 Total products in catalog: 1250
📊 Products with source URLs: 850

🎯 Testing with 3 URLs:
   1. https://www.hondamotorbikes.co.nz/honda-genuine-accessories/08l75mkse00
   2. https://www.hondamarine.co.nz/flush-side-mount-remote-drive-by-wire
   3. https://www.hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit

🚀 Starting scrape with Bright Data...

✅ Test scrape completed!
   Total products: 3
   Successful: 3
   Failed: 0
   Success rate: 100.0%

✅ Scraper is working correctly!
   You can now run the full scrape: npm run scrape
```

**If Test Fails:**
- Check Bright Data zone is active in dashboard
- Verify BRIGHT_DATA_BROWSER_API in .env is correct
- Check logs for specific errors

---

### Step 3: Run Full Scrape

**Why**: Scrape all 850+ products to get current supplier prices.

**Action:**
```bash
npm run scrape
```

**Expected Performance:**
- Products: ~850 URLs
- Concurrency: 3 simultaneous scrapes
- Time per URL: ~10-15 seconds
- Total Time: ~45-70 minutes
- Cost: ~$2.13 (850 × $0.0025 per request)

**What Happens:**
1. Loads all Shopify products from shopify_catalog_cache
2. Filters for products with source_url_canonical
3. Scrapes each URL with Bright Data Scraping Browser
4. Extracts prices using Honda-specific selectors
5. Stores scraped prices back in shopify_catalog_cache

**Expected Output:**
```
[INFO] Starting full scrape from Shopify catalog
[INFO] Shopify products loaded {
  "total": 1250,
  "withUrls": 850,
  "withoutUrls": 400
}
[INFO] Scraping products with Bright Data {"count":850,"concurrency":3}
[INFO] Product scraped and stored {
  "url": "https://www.hondashop.co.nz/honda-bf40",
  "salePrice": 15999,
  "originalPrice": null,
  "confidence": 0.8
}
...
[INFO] Full scrape completed {
  "totalProducts": 850,
  "successfulExtractions": 820,
  "failedExtractions": 30,
  "successRate": "96.5%"
}
```

---

## After Scraping

### Verify Results

Query Supabase to see scraped prices:

```sql
SELECT
  shopify_product_title,
  shopify_price,
  scraped_sale_price,
  scrape_confidence,
  last_scraped_at,
  source_url_canonical
FROM shopify_catalog_cache
WHERE scraped_sale_price IS NOT NULL
ORDER BY last_scraped_at DESC
LIMIT 10;
```

### Compare Prices

See products where scraped price differs from Shopify:

```sql
SELECT
  shopify_product_title,
  shopify_price,
  scraped_sale_price,
  (shopify_price - scraped_sale_price) as price_difference,
  source_url_canonical
FROM shopify_catalog_cache
WHERE scraped_sale_price IS NOT NULL
  AND scraped_sale_price != shopify_price
ORDER BY ABS(shopify_price - scraped_sale_price) DESC
LIMIT 20;
```

---

## Architecture Summary

### What Changed

**Before** (Complex):
```
1. Firecrawl Map → Discover URLs
2. Filter discovered URLs vs Shopify
3. Scrape filtered URLs
4. Store in multiple tables (domains, product_pages, price_history)
```

**After** (Simple):
```
1. Load source_url_canonical from shopify_catalog_cache
2. Scrape URLs with Bright Data
3. Store prices back in shopify_catalog_cache (same table)
```

### Benefits

✅ **Simpler**: One table, one flow, no complex logic
✅ **Faster**: No URL discovery step (~45 minutes saved)
✅ **Cheaper**: Only scrape known product URLs (no wasted credits on category pages)
✅ **More Reliable**: Fewer moving parts, easier to debug

### Database Schema

The `shopify_catalog_cache` table is now the **single source of truth**:

| Column | Purpose |
|--------|---------|
| `shopify_price` | Current Shopify price |
| `shopify_compare_at_price` | Shopify compare-at price |
| `scraped_sale_price` | **NEW** - Scraped supplier price |
| `scraped_original_price` | **NEW** - Scraped supplier original price |
| `scrape_confidence` | **NEW** - Price extraction confidence (0.0-1.0) |
| `last_scraped_at` | **NEW** - Last scrape timestamp |

### Key Files Modified

1. **[scraper-orchestrator.ts](src/scraper/scraper-orchestrator.ts)** - Completely rewritten
   - Removed URL discovery logic
   - Simplified to: load → scrape → store

2. **[puppeteer-client.ts](src/scraper/puppeteer-client.ts)** - Fixed session handling
   - Creates NEW browser session per URL (Bright Data requirement)
   - No Accept-Language override (forbidden by Scraping Browser)

3. **[queries.ts](src/database/queries.ts)** - Added storage function
   - `updateScrapedPrices()` - Stores scraped prices in shopify_catalog_cache

4. **[migrations/006_add_scraped_prices_to_catalog.sql](migrations/006_add_scraped_prices_to_catalog.sql)** - Schema update
   - Adds 4 new columns to shopify_catalog_cache

---

## Troubleshooting

### Migration Fails
**Issue**: Columns not created
**Fix**: Run SQL manually in Supabase Dashboard SQL Editor

### Test Scrape Fails
**Issue**: "zone_not_found" error
**Fix**: Activate the `honda_scrapper` zone in Bright Data dashboard

**Issue**: "Page.navigate limit reached"
**Fix**: Already fixed - each URL gets its own browser session

**Issue**: No products with source URLs
**Fix**: Run `npm run shopify:refresh` to sync Shopify catalog first

### Full Scrape Issues
**Issue**: High failure rate (>10%)
**Fix**: Check Bright Data credits and zone status

**Issue**: Slow scraping
**Fix**: Increase concurrency in scraper-orchestrator.ts (line 40): `concurrency: 5`

---

## Future Enhancements

1. **Price Comparison Dashboard**: Compare scraped vs Shopify prices
2. **Automatic Price Sync**: Update Shopify when supplier prices change
3. **Scheduling**: Run scraper weekly/daily automatically
4. **Alerting**: Email when significant price differences detected
5. **Discovery Process** (Separate): Use Firecrawl Map to find new products/offers

---

## Quick Command Reference

```bash
# Verify database migration completed
npm run db:verify

# Test scraper with 3 products
npm run scrape:test

# Run full scrape on all products
npm run scrape

# Refresh Shopify catalog cache
npm run shopify:refresh

# Verify Shopify connection
npm run verify:shopify
```

---

## Documentation

- [SIMPLIFIED_SCRAPER.md](SIMPLIFIED_SCRAPER.md) - Architecture overview
- [MIGRATION_INSTRUCTIONS.md](MIGRATION_INSTRUCTIONS.md) - Detailed migration guide
- [migrations/006_add_scraped_prices_to_catalog.sql](migrations/006_add_scraped_prices_to_catalog.sql) - SQL migration file

---

## Need Help?

Check these files for more information:
- **Configuration**: [.env](.env) - Bright Data credentials
- **Scraping Logic**: [src/scraper/scraper-orchestrator.ts](src/scraper/scraper-orchestrator.ts)
- **Price Extraction**: [src/scraper/honda-selectors.js](src/scraper/honda-selectors.js)
- **Database Operations**: [src/database/queries.ts](src/database/queries.ts)
