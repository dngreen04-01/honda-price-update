# Product Matching Methodology for Honda Crawler

This document summarizes the multi-level matching implementation and provides a repeatable methodology for handling different product types.

## Problem Summary

### Original Issue
The Honda crawler was incorrectly marking existing products as "new discoveries" due to URL path variations. The same product could appear at different URL paths:

| URL Variation | Product ID |
|---------------|------------|
| `/08l78mkse00` | 08l78mkse00 |
| `/honda-genuine-accessories/08l78mkse00` | 08l78mkse00 |
| `/motorcycles/sport/cbr1000rr` | cbr1000rr |

The original detection used **exact canonical URL matching**, which failed when category prefixes were present.

### Root Cause
Honda NZ sites use flat URL structures where:
1. Products can exist at root-level paths (`/bf225`)
2. Products can also exist under category paths (`/outboards/high-power/bf225`)
3. The product identifier (SKU) is always the **last path segment**

## Solution: Multi-Level Matching

### Matching Tiers

```
┌─────────────────────────────────────────────────────────────┐
│                    Discovered URL                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │ Tier 1: Canonical URL Match     │
            │ (Exact match - fastest)         │
            └─────────────────────────────────┘
                              │
                    Match? ───┴─── No Match
                      │               │
                      ▼               ▼
               ┌──────────┐  ┌─────────────────────────────────┐
               │ EXISTING │  │ Tier 2: Product ID / SKU Match  │
               └──────────┘  │ (Extract last path segment)     │
                             └─────────────────────────────────┘
                                              │
                                    Match? ───┴─── No Match
                                      │               │
                                      ▼               ▼
                               ┌──────────┐    ┌──────────┐
                               │ EXISTING │    │   NEW    │
                               └──────────┘    └──────────┘
```

### Implementation Components

| Component | File | Purpose |
|-----------|------|---------|
| Product ID Extractor | `src/utils/extract-product-id.ts` | Extracts last path segment as product identifier |
| SKU Lookup Query | `src/database/queries.ts` | Fetches existing SKUs from `variant_sku` column |
| Product ID Lookup Query | `src/database/queries.ts` | Extracts product IDs from existing canonical URLs |
| Multi-Level Detector | `src/crawler/new-product-detector.ts` | Implements two-tier matching logic |

## Key Discoveries

### 1. URL Structure Patterns

Honda NZ sites follow these URL patterns:

| Site | Pattern | Examples |
|------|---------|----------|
| hondamotorbikes.co.nz | `/{category}/{product-id}` or `/{product-id}` | `/sport/cbr1000rr`, `/nc750x` |
| hondaoutdoors.co.nz | `/{category}/{product-id}` or `/{product-id}` | `/generators/eu22i`, `/eu22i` |
| hondamarine.co.nz | `/{category}/{power-range}/{product-id}` or `/{product-id}` | `/outboards/high-power/bf225`, `/bf225` |

### 2. Product ID Characteristics

Product identifiers (SKUs) have these characteristics:
- Located as the **last path segment** in the URL
- Typically alphanumeric (e.g., `08l78mkse00`, `bf225`, `cbr1000rr`)
- Length usually 3-15 characters
- Often contain numbers (model numbers)
- Match the `variant_sku` in Shopify

### 3. Database Schema

The `shopify_catalog_cache` table stores:
```sql
source_url_canonical  -- Full canonical URL (for Tier 1 matching)
variant_sku           -- SKU from Shopify (for Tier 2 matching)
```

Both are indexed for fast lookups.

## Methodology for New Product Types

When adding support for a new product type (e.g., Power Equipment, ATVs):

### Step 1: Analyze URL Patterns

1. Collect sample URLs from the site
2. Identify the product identifier location (usually last segment)
3. Document any exceptions or special patterns

**Questions to answer:**
- Where is the product ID in the URL?
- Are there category prefixes?
- What characters appear in product IDs?
- Are there any URLs that look like products but aren't?

### Step 2: Verify SKU Alignment

Check that the URL product ID matches Shopify SKUs:
```sql
SELECT
  variant_sku,
  source_url_canonical,
  (regexp_match(source_url_canonical, '/([^/]+)/?$'))[1] as extracted_id
FROM shopify_catalog_cache
WHERE source_url_canonical LIKE '%{domain}%'
LIMIT 20;
```

### Step 3: Update Exclusion Patterns (if needed)

If the product type has unique non-product pages, add to `src/crawler/url-patterns.ts`:

```typescript
export const EXCLUSION_PATTERNS: string[] = [
  // Existing patterns...
  'new-pattern-to-exclude',
];
```

### Step 4: Test the Matching

Run a limited crawl and verify:
```bash
# Trigger limited crawl
curl -X POST "http://localhost:3000/api/crawl?sites={site}&maxPages=10"

# Check for false positives
curl "http://localhost:3000/api/crawl/results?status=pending"
```

### Step 5: Validate with SQL

```sql
-- Check for false positives (should return 0)
SELECT COUNT(*)
FROM discovered_products dp
WHERE dp.status = 'pending'
AND EXISTS (
  SELECT 1 FROM shopify_catalog_cache scc
  WHERE LOWER(scc.variant_sku) = LOWER(
    (regexp_match(dp.url, '/([^/]+)/?$'))[1]
  )
);
```

## Code Reference

### Product ID Extraction

```typescript
// src/utils/extract-product-id.ts
export function extractProductId(url: string): string | null {
  const urlObj = new URL(url);
  const segments = urlObj.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const lastSegment = segments[segments.length - 1].toLowerCase();
  if (lastSegment.length < 3) return null;

  return lastSegment;
}
```

### Multi-Level Detection

```typescript
// src/crawler/new-product-detector.ts
async detectNewProducts(discoveries: DiscoveredUrl[]): Promise<DetectionResult> {
  for (const discovery of discoveries) {
    // Tier 1: Exact canonical URL match
    if (this.existingCanonicalUrls.has(discovery.urlCanonical)) {
      existingProducts.push(discovery);
      continue;
    }

    // Tier 2: Product ID / SKU match
    if (this.isExistingByProductId(discovery.url)) {
      existingProducts.push(discovery);
      continue;
    }

    // Genuinely new
    newProducts.push(discovery);
  }
}
```

## Performance Considerations

The multi-level matching uses three `Set<string>` data structures for O(1) lookups:

| Set | Source | Size (typical) |
|-----|--------|----------------|
| `existingCanonicalUrls` | `source_url_canonical` column | ~500-2000 URLs |
| `existingSkus` | `variant_sku` column | ~500-2000 SKUs |
| `existingProductIds` | Extracted from URLs | ~500-2000 IDs |

All three are loaded in parallel at startup, adding minimal overhead.

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Trailing slashes | Stripped by URL parsing |
| Case variations | All comparisons use lowercase |
| Query parameters | Stripped by canonicalization |
| Very short segments | Filtered (< 3 chars) |
| Non-product pages | Filtered by exclusion patterns |
| Duplicate IDs across sites | Matched to any existing product |

## Files Modified in Implementation

| File | Change |
|------|--------|
| `src/utils/extract-product-id.ts` | **New** - Product ID extraction utility |
| `src/types/index.ts` | Added SKU columns to interface |
| `src/database/queries.ts` | Added `getExistingProductSkus()` and `getExistingProductIds()` |
| `src/crawler/new-product-detector.ts` | Implemented multi-level matching |
| `References/HONDA_CRAWLER_PLAN.md` | Documented discovery |

## Future Enhancements

1. **Fuzzy matching**: Handle typos or slight variations in product IDs
2. **Product ID normalization**: Strip common prefixes/suffixes
3. **Cross-domain deduplication**: Handle same product across different Honda sites
4. **Confidence scoring**: Rank matches by confidence level
5. **Manual override**: Allow marking false positives/negatives for learning

---

*Created: 2026-01-17*
*Last Updated: 2026-01-17*
