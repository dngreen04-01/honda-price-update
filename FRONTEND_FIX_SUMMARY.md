# Frontend Fix - Displaying Scraped Prices

## Problem

The frontend was showing 281 products as "not in Supplier" even though the scraper successfully scraped 350 products. The SKU `0sv05hl4300` appeared missing but was actually in the database.

## Root Cause

The frontend was querying the **OLD architecture tables** (`product_pages`) instead of using the **NEW simplified architecture** (`shopify_catalog_cache` with `scraped_sale_price` columns).

### Old Architecture (Deprecated)
- Multiple tables: `domains`, `product_pages`, `price_history`
- Frontend queried: `product_pages.latest_sale_price`
- Complex joins and lookups

### New Architecture (Current)
- Single table: `shopify_catalog_cache`
- Scraped prices stored in: `scraped_sale_price`, `scraped_original_price`
- Simple, direct queries

## Solution

Updated [frontend/src/pages/Dashboard/PriceComparison.tsx](frontend/src/pages/Dashboard/PriceComparison.tsx) to query the correct table and columns.

### Changes Made

**Before:**
```typescript
// ❌ OLD - Querying deprecated product_pages table
const { data: products } = await supabase
  .from('product_pages')
  .select('latest_sale_price, latest_original_price, ...')

const { data: shopifyData } = await supabase
  .from('shopify_catalog_cache')
  .select('*')

// Join data from two sources
const supplierPrice = product?.latest_sale_price
```

**After:**
```typescript
// ✅ NEW - Single source of truth
const { data: shopifyData } = await supabase
  .from('shopify_catalog_cache')
  .select('*')

// All data in one table
const supplierPrice = item.scraped_sale_price
const supplierOriginalPrice = item.scraped_original_price
const lastScraped = item.last_scraped_at
```

### Key Changes

1. **Removed `product_pages` query** - No longer needed
2. **Use `scraped_sale_price`** instead of `latest_sale_price`
3. **Use `scraped_original_price`** instead of `latest_original_price`
4. **Use `last_scraped_at`** instead of `last_seen_at`
5. **Single table query** - Much simpler and faster

## Database Verification

Current status in `shopify_catalog_cache`:

```
📊 Total products: 369
✅ With scraped prices: 350 (94.9%)
❌ Without scraped prices: 19 (5.1%)
```

The 19 products without prices are engines/pumps where price extraction failed (not actual products with prices on website).

### Example - SKU 0SV05HL4300

```json
{
  "variant_sku": "0SV05HL4300",
  "product_title": "Pioneer 1000 Rearview Mirror",
  "shopify_price": 222,
  "scraped_sale_price": 222,
  "scrape_confidence": 0.8,
  "last_scraped_at": "2025-11-11T19:XX:XX.XXXZ"
}
```

✅ **Found in database with correct scraped price**

## Impact

### Before Fix
- Frontend showed: "281 products not in supplier"
- Missing: SKUs that were actually scraped
- Data source: Deprecated tables

### After Fix
- Frontend will show: "19 products not in supplier" (correct)
- All scraped products visible
- Data source: Current simplified architecture

## Testing

1. **Clear browser cache** to remove any cached frontend data
2. **Refresh the frontend dashboard**
3. **Verify counts**:
   - Total products: 369
   - With supplier prices: 350
   - Missing supplier prices: 19
4. **Search for SKU 0SV05HL4300** - should now appear with $222 price

## Files Modified

- [frontend/src/pages/Dashboard/PriceComparison.tsx](frontend/src/pages/Dashboard/PriceComparison.tsx:53-104)
  - Updated data loading logic
  - Changed from dual-table to single-table query
  - Updated field mappings to new column names

## Next Steps

1. ✅ Frontend updated to use simplified architecture
2. ⏳ Clear browser cache and refresh dashboard
3. ⏳ Verify all 350 scraped products appear
4. ⏳ Investigate the 19 products without prices (likely engines/pumps with no listed prices)

## Notes

- The old `product_pages` table is no longer used for price comparison
- All price data now comes from `shopify_catalog_cache`
- This aligns with the simplified scraper architecture
- Much faster queries (single table vs. multiple joins)
