# Simplified Scraper Architecture

## Overview

The scraper has been simplified to focus on what matters: **scraping prices from known Shopify product URLs**.

## New Architecture

### What Changed

**Before** (Complex):
```
1. Discover URLs (Firecrawl Map) → 2. Filter vs Shopify → 3. Scrape → 4. Store
- Multiple tables (domains, product_pages, price_history)
- Complex URL discovery and filtering
- Wasted resources on non-product pages
```

**After** (Simple):
```
1. Load Shopify URLs → 2. Scrape → 3. Store prices in shopify_catalog_cache
- Single source of truth: shopify_catalog_cache
- No discovery needed
- Only scrape what exists in Shopify
```

### Benefits

✅ **Simpler**: One table, one flow, no complex logic
✅ **Faster**: No URL discovery step
✅ **Cheaper**: Only scrape known product URLs
✅ **More Reliable**: Fewer moving parts

## Database Schema Updates

### New Columns in `shopify_catalog_cache`

Run migration: [migrations/006_add_scraped_prices_to_catalog.sql](migrations/006_add_scraped_prices_to_catalog.sql)

```sql
ALTER TABLE shopify_catalog_cache
ADD COLUMN scraped_sale_price DECIMAL(10, 2),
ADD COLUMN scraped_original_price DECIMAL(10, 2),
ADD COLUMN scrape_confidence DECIMAL(3, 2),
ADD COLUMN last_scraped_at TIMESTAMP WITH TIME ZONE;
```

Now all data is in ONE table:
- `shopify_price` - Current Shopify price
- `shopify_compare_at_price` - Shopify compare-at price
- `scraped_sale_price` - **NEW** - Scraped supplier price
- `scraped_original_price` - **NEW** - Scraped supplier compare-at price
- `scrape_confidence` - **NEW** - Extraction confidence (0.0-1.0)
- `last_scraped_at` - **NEW** - Last scrape timestamp

## How It Works

### 1. Load Shopify Products

```typescript
const shopifyProducts = await getShopifyCatalogCache();
const productsWithUrls = shopifyProducts.filter(p => p.source_url_canonical);
const urls = productsWithUrls.map(p => p.source_url_canonical);
```

### 2. Scrape All URLs

```typescript
const results = await puppeteerClient.scrapeUrls(urls, { concurrency: 3 });
```

**Bright Data handles**:
- Creating new browser session per URL (required)
- Bot protection bypass
- Residential IP rotation
- Retries with exponential backoff

### 3. Extract Prices

```typescript
const priceResult = puppeteerClient.extractPrice(url, html);
// Returns: { salePrice, originalPrice, confidence }
```

### 4. Store in Database

```typescript
await updateScrapedPrices(
  url,
  priceResult.salePrice,
  priceResult.originalPrice,
  priceResult.confidence
);
```

## Usage

### Run Full Scrape

```bash
npm run scrape
```

This will:
1. Load all Shopify products with `source_url_canonical`
2. Scrape each URL with Bright Data
3. Extract prices using Honda-specific selectors
4. Update `shopify_catalog_cache` with scraped prices

### Example Output

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
[INFO] Full scrape completed {
  "totalProducts": 850,
  "successfulExtractions": 820,
  "failedExtractions": 30,
  "successRate": "96.5%"
}
```

## Code Changes

### Files Modified

1. **[scraper-orchestrator.ts](src/scraper/scraper-orchestrator.ts)** - Completely rewritten
   - Removed URL discovery logic
   - Removed domain processing
   - Simplified to: load → scrape → store

2. **[queries.ts](src/database/queries.ts)** - Added new function
   - `updateScrapedPrices()` - Updates shopify_catalog_cache with scraped prices

3. **[puppeteer-client.ts](src/scraper/puppeteer-client.ts)** - Already optimized
   - Creates new browser session per URL (Bright Data requirement)
   - Handles retries and error recovery

### Files No Longer Used

- `firecrawl-client.ts` - No longer needed for scraping
- `firecrawl-client-v2.ts` - No longer needed for scraping
- `url-cache.ts` - Not needed (scrape frequency controlled by cron)
- `circuit-breaker.ts` - Not needed (no Firecrawl Map API)

## Discovery Process (Separate)

URL discovery and offer scraping will be handled separately:
- Run manually or on a different schedule
- Uses Firecrawl Map to discover new products
- Updates Shopify catalog accordingly

**For now**: Focus on scraping existing products efficiently.

## Performance

### Expected Performance

- **Products**: ~850 URLs
- **Concurrency**: 3 simultaneous scrapes
- **Time per URL**: ~10-15 seconds (including bot protection)
- **Total Time**: ~45-70 minutes for full scrape
- **Cost**: ~$2.13 per scrape (850 × $0.0025)

### Optimization Tips

1. **Increase Concurrency**: Can go up to 5-10 with paid plan
2. **Filter by Last Scraped**: Only scrape products not scraped in last 24h
3. **Priority Queue**: Scrape high-value products first

## Next Steps

1. ✅ **Run migration** to add columns to shopify_catalog_cache
2. ✅ **Test scraper** with small subset of products
3. ✅ **Run full scrape** and monitor results
4. ⏳ **Set up price comparison** logic to compare scraped vs Shopify prices
5. ⏳ **Add price sync** to update Shopify when prices change

## Summary

The scraper is now **radically simpler**:
- ✅ One source of truth (shopify_catalog_cache)
- ✅ No URL discovery overhead
- ✅ Direct scraping of known products
- ✅ All data in one table
- ✅ Much easier to maintain and debug

Ready to scrape! 🚀
