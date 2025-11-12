# Rescrape API Fix - Migration to Simplified Architecture

## Problem

The rescrape API endpoint (`http://localhost:3000/api/rescrape`) was using the **OLD architecture** while the main scraper had been updated to the **NEW simplified architecture**.

### User Report
```
Tried rescraping https://www.hondaoutdoors.co.nz/auger-10-250-x-800mm
Got error: "Failed to extract price from URL. The website may be blocking requests
or the product page is unavailable."
But the website is live and price is visible ($432)
```

### Root Cause

**Old Architecture Issues:**
- ❌ Used **Firecrawl** client instead of **Bright Data**
- ❌ Queried old `product_pages` table with `latest_sale_price` column
- ❌ Called `scraperOrchestrator.storeProducts(domainId, scrapeResult)` with old format
- ❌ Required domain lookup and complex data transformation
- ❌ Did not restore `www.` subdomain for scraping

**Why It Failed:**
1. Firecrawl has credit limitations and may be less reliable for Honda sites
2. The `product_pages` table is deprecated and no longer updated
3. Database schema changed - using `scraped_sale_price` instead of `latest_sale_price`
4. Missing `www.` subdomain causes HTTP 403 errors on Honda websites

## Solution Implemented

Updated [src/api/rescrape-api.ts](src/api/rescrape-api.ts) to use the **NEW simplified architecture**.

### Key Changes

#### 1. Updated Imports
**Before:**
```typescript
import axios from 'axios';
import { extractDomain } from '../utils/canonicalize.js';
// Later: import firecrawl-client.js
```

**After:**
```typescript
import { canonicalizeUrl } from '../utils/canonicalize.js';
import { getShopifyCatalogCache } from '../database/queries.js';
// Uses scraperOrchestrator which internally uses puppeteerClient
```

#### 2. Database Query Migration
**Before:**
```typescript
// ❌ OLD - Querying deprecated table
const { getProductPageByUrl } = await import('../database/queries.js');
const oldProduct = await getProductPageByUrl(request.url);
const oldPrice = oldProduct?.latest_sale_price || null;
```

**After:**
```typescript
// ✅ NEW - Single source of truth
const canonicalUrl = canonicalizeUrl(request.url);
const catalog = await getShopifyCatalogCache();
const existingProduct = catalog.find(p => p.source_url_canonical === canonicalUrl);
const oldPrice = existingProduct?.scraped_sale_price || null;
```

#### 3. URL Restoration for Scraping
**Before:**
```typescript
// ❌ OLD - Missing www. subdomain
const scrapeResponse = await firecrawlClient.scrape(request.url);
```

**After:**
```typescript
// ✅ NEW - Restore www. subdomain (Honda sites require it)
let scrapeUrl = request.url;
try {
  const urlObj = new URL(request.url);
  if (!urlObj.hostname.startsWith('www.')) {
    urlObj.hostname = `www.${urlObj.hostname}`;
    scrapeUrl = urlObj.toString();
  }
} catch {
  scrapeUrl = request.url;
}
```

#### 4. Scraper Client Migration
**Before:**
```typescript
// ❌ OLD - Firecrawl with complex error handling and fallback
const { firecrawlClient } = await import('../scraper/firecrawl-client.js');
const { priceExtractor } = await import('../scraper/price-extractor.js');

const scrapeResponse = await firecrawlClient.scrape(request.url);
// ...100+ lines of LLM fallback logic
```

**After:**
```typescript
// ✅ NEW - Bright Data with simple orchestrator call
const scrapeResults = await scraperOrchestrator.scrapeProducts([scrapeUrl], {
  concurrency: 1, // Single URL
});

const result = scrapeResults[0];

if (!result.success || !result.salePrice) {
  return {
    success: false,
    message: 'Failed to extract price from URL...',
  };
}
```

#### 5. Storage Migration
**Before:**
```typescript
// ❌ OLD - Complex conversion and domain lookup
const scrapeResult = extractedData ? [{
  url: request.url,
  canonicalUrl: canonicalizeUrl(request.url),
  extractedPrice: extractedData,
}] : [];

await scraperOrchestrator.storeProducts(domainRecord.id, scrapeResult);
```

**After:**
```typescript
// ✅ NEW - Direct storage with simplified format
await scraperOrchestrator.storeProducts([result]);
```

#### 6. Result Retrieval
**Before:**
```typescript
// ❌ OLD - Querying deprecated table
const updatedProduct = await getProductPageByUrl(request.url);
const newPrice = updatedProduct?.latest_sale_price || null;
```

**After:**
```typescript
// ✅ NEW - Query shopify_catalog_cache
const updatedCatalog = await getShopifyCatalogCache();
const updatedProduct = updatedCatalog.find(p => p.source_url_canonical === canonicalUrl);
const newPrice = updatedProduct?.scraped_sale_price || null;
```

## Architecture Alignment

### Before (OLD)
```
User → rescrape-api.ts → Firecrawl → product_pages (deprecated)
                                    ↓
                             latest_sale_price
```

### After (NEW)
```
User → rescrape-api.ts → scraperOrchestrator → Bright Data → shopify_catalog_cache
                                                             ↓
                                                     scraped_sale_price
```

## Benefits

✅ **Consistency**: Rescrape API now uses same scraper as main workflow
✅ **Reliability**: Bright Data Scraping Browser bypasses bot protection better
✅ **Cost Effective**: Uses Bright Data credits instead of limited Firecrawl credits
✅ **Simplified Code**: Removed 100+ lines of complex Firecrawl fallback logic
✅ **Correct URLs**: Restores `www.` subdomain before scraping
✅ **Single Table**: Uses `shopify_catalog_cache` as single source of truth
✅ **Maintainability**: All scraping logic in one place (scraperOrchestrator)

## Testing

### Test Case
```bash
# User's original failing request
POST http://localhost:3000/api/rescrape
{
  "url": "https://www.hondaoutdoors.co.nz/auger-10-250-x-800mm"
}
```

### Expected Result
```json
{
  "success": true,
  "message": "Price updated from $N/A to $432.00",
  "data": {
    "url": "https://www.hondaoutdoors.co.nz/auger-10-250-x-800mm",
    "oldPrice": null,
    "newPrice": 432,
    "priceChanged": true
  }
}
```

## Files Modified

- **[src/api/rescrape-api.ts](src/api/rescrape-api.ts)** - Complete rewrite using simplified architecture

## Code Reduction

- **Before**: ~250 lines with complex Firecrawl logic, LLM fallback, error handling
- **After**: ~155 lines with simple orchestrator calls
- **Reduction**: ~95 lines removed (38% reduction)

## No Breaking Changes

The API interface remains the same:
- ✅ Same request format (`RescrapeRequest`)
- ✅ Same response format (`RescrapeResponse`)
- ✅ Same endpoint (`/api/rescrape`)
- ✅ Frontend code requires no changes

## Next Steps

1. ✅ **Code Updated**: rescrape-api.ts migrated to new architecture
2. ⏳ **Test Rescrape**: User can test rescraping from frontend
3. ⏳ **Verify Results**: Check that prices update correctly in database and frontend
4. ⏳ **Monitor Logs**: Ensure Bright Data scraping works reliably for individual URLs

## Notes

- Rescrape API now uses same Bright Data Scraping Browser as main scraper
- Each rescrape request uses 1 Bright Data credit (~$0.0025)
- `www.` subdomain is automatically restored for Honda websites
- Database updates use `scraped_sale_price` columns in `shopify_catalog_cache`
- No migration or table changes required - uses existing simplified schema
