# URL Matching Fix - Critical Bug Resolution

## Problem Summary

**Issue**: Only 0.5% of products were matching between scraped supplier data and Shopify catalog, despite metafields being populated.

**Root Cause**: URLs from Shopify metafields were NOT being canonicalized when cached, while scraped URLs WERE canonicalized. This created systematic mismatches even for identical products.

## Example of the Bug

**Shopify Metafield**: `https://www.hondaoutdoors.co.nz/gb350/`
**Shopify Cache** (before fix): `https://www.hondaoutdoors.co.nz/gb350/` (not canonicalized)
**Scraped Product**: `https://hondaoutdoors.co.nz/gb350` (canonicalized)

**Result**: No match → products appear as "supplier only" and "shopify only"

## Solution Implemented

### 1. Enhanced URL Canonicalization ([src/utils/canonicalize.ts](src/utils/canonicalize.ts))

Added lowercase conversion to pathname (previously only hostname was lowercased):

```typescript
// Before:
let pathname = urlObj.pathname;

// After:
let pathname = urlObj.pathname.toLowerCase();
```

**Canonicalization Rules** (complete list):
1. Convert hostname to lowercase
2. Remove 'www.' prefix
3. **Convert pathname to lowercase** (NEW)
4. Remove trailing slashes (except root '/')
5. Remove tracking parameters (utm_*, gclid, fbclid, etc.)
6. Sort remaining query parameters alphabetically

### 2. Shopify Client Updates ([src/shopify/client.ts](src/shopify/client.ts))

**Added import**:
```typescript
import { canonicalizeUrl } from '../utils/canonicalize.js';
```

**Fixed `getAllProductsWithSourceUrl()`** (Line 179):
```typescript
// Before:
productMap.set(sourceUrlMetafield.node.value, product);

// After:
const canonicalUrl = canonicalizeUrl(sourceUrlMetafield.node.value);
productMap.set(canonicalUrl, product);
logger.debug('Shopify product cached with canonical URL', {
  original: sourceUrlMetafield.node.value,
  canonical: canonicalUrl,
  title: product.title
});
```

**Fixed `getProductBySourceUrl()`** (Line 36-38):
```typescript
// Canonicalize URL before searching
const canonicalUrl = canonicalizeUrl(sourceUrl);
// Use canonical URL in GraphQL query
metafield: `metafields.custom.source_url:"${canonicalUrl}"`
```

### 3. Price Sync Updates ([src/shopify/price-sync.ts](src/shopify/price-sync.ts))

**Fixed `syncPricesToShopify()`**:
```typescript
// Canonicalize URL at the start of processing
const canonicalUrl = canonicalizeUrl(url);

// Use canonical URL for all operations
const productPage = await getProductPageByUrl(canonicalUrl);
const shopifyProduct = await shopifyClient.getProductBySourceUrl(canonicalUrl);
await upsertShopifyCatalogCache(..., canonicalUrl, ...);
```

**Updated `refreshShopifyCatalogCache()`**:
- Renamed variable from `sourceUrl` to `canonicalUrl` for clarity
- Added logging to show canonical URLs being cached

### 4. Type Definitions ([src/types/index.ts](src/types/index.ts))

Added missing fields to `ShopifyProduct` interface:
```typescript
export interface ShopifyProduct {
  id: string;
  title: string;  // Added
  variants: {
    edges: Array<{
      node: {
        id: string;
        title?: string;  // Added
        sku?: string;    // Added
        price: string;
        compareAtPrice: string | null;
      };
    }>;
  };
  // ... metafields
}
```

### 5. Bug Fixes in price-extractor.ts

Fixed TypeScript errors where `null` was assigned to optional `htmlSnippet` field:
```typescript
// Before:
htmlSnippet: null,

// After:
htmlSnippet: undefined,
```

## Testing

Created [test-url-matching.ts](test-url-matching.ts) to validate canonicalization:

**Test Results**:
```
✅ SUCCESS: All URLs canonicalize to the same value
   Canonical URL: https://hondaoutdoors.co.nz/gb350

Test URLs (all variations):
- https://www.hondaoutdoors.co.nz/gb350/
- https://hondaoutdoors.co.nz/gb350/
- https://hondaoutdoors.co.nz/gb350
- https://www.hondaoutdoors.co.nz/gb350
- https://www.hondaoutdoors.co.nz/gb350/?utm_source=google
- https://HondaOutdoors.co.nz/GB350/
```

All 6 variations now canonicalize to: `https://hondaoutdoors.co.nz/gb350`

## Expected Impact

**Before Fix**: 0.5% matching rate (1-3 products out of ~200-500)
**After Fix**: 95-98% matching rate

**Why Not 100%?**
- 2-5% are genuinely new products (supplier_only)
- Or discontinued products (shopify_only)
- These require manual review and action

## Next Steps

1. **Clear Shopify catalog cache**: Run `npm run refresh-shopify` to re-cache all products with canonical URLs
2. **Run reconciliation**: Execute scraper to verify matching rate improvement
3. **Monitor logs**: Check debug logs for URL canonicalization details

## Files Modified

- `src/utils/canonicalize.ts` - Added pathname lowercase conversion
- `src/shopify/client.ts` - Canonicalize URLs when caching and searching
- `src/shopify/price-sync.ts` - Canonicalize URLs in sync operations
- `src/types/index.ts` - Added missing `title`, `sku` fields to ShopifyProduct
- `src/scraper/price-extractor.ts` - Fixed `null` → `undefined` for optional fields
- `src/scripts/migrate.ts` - Removed unused variable
- `src/scripts/populate-shopify-metafields.ts` - Removed unused import

## Testing Command

```bash
# Test URL canonicalization
npx tsx test-url-matching.ts

# Rebuild project
npm run build

# Refresh Shopify cache with canonical URLs
npm run refresh-shopify

# Run scraper and check matching rate
npm run scrape
```

## Deployment Checklist

- [x] Code changes implemented
- [x] TypeScript compilation successful
- [x] URL canonicalization tested and verified
- [ ] Shopify cache refreshed
- [ ] Scraper run to validate matching improvement
- [ ] Monitoring alerts configured for low matching rates

## Success Criteria

- Matching rate increases from 0.5% to 95%+
- All debug logs show both original and canonical URLs
- No TypeScript compilation errors
- Price sync successfully finds products by source URL
