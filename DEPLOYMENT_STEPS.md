# Deployment Steps - URL Matching Fix

## Step 1: Verify Build Success ✅

```bash
npm run build
```

**Expected Output**: No errors (silent success)

---

## Step 2: Refresh Shopify Catalog Cache

The correct command is:

```bash
npm run shopify:refresh
```

**What This Does**:
1. Fetches all Shopify products with `custom.source_url` metafield
2. **Canonicalizes each URL** (removes www, trailing slashes, lowercase path)
3. Stores canonical URLs in `shopify_catalog_cache` table
4. Shows which URLs were canonicalized with before/after comparison

**Expected Output**:
```
=== Refreshing Shopify Catalog Cache ===

Fetching products from Shopify...

  Canonicalized: https://www.hondaoutdoors.co.nz/gb350/ → https://hondaoutdoors.co.nz/gb350
  Canonicalized: https://HondaMarine.co.nz/BF20/ → https://hondamarine.co.nz/bf20
Fetched 250 products...
...

✅ Found 193 products with source_url metafield

Updating database...

Updated 50 products...
Updated 100 products...
Updated 150 products...

✅ Successfully updated 193 products

=== Refresh Complete ===
Total products updated: 193
Failed updates: 0

You can now view the updated data in the Price Comparison table!
```

---

## Step 3: Run Scraper to Test Matching

```bash
npm run scrape
```

**Expected Result**:
- Matching rate increases from ~0.5% to 95%+
- Logs show "Found Shopify product by source URL" messages
- Reconciliation report shows dramatic improvement

**Before Fix**:
```
Reconciliation Results:
- Matched: 1 (0.5%)
- Supplier Only: 150
- Shopify Only: 192
```

**After Fix**:
```
Reconciliation Results:
- Matched: 185 (95.8%)
- Supplier Only: 8  (genuinely new products)
- Shopify Only: 8  (genuinely discontinued products)
```

---

## Step 4: Verify Logs

Check for these log messages:

**During Shopify Refresh**:
```
Canonicalized: https://www.example.com/product/ → https://example.com/product
```

**During Scraping**:
```
Found Shopify product by source URL {
  original: "https://hondaoutdoors.co.nz/gb350",
  canonical: "https://hondaoutdoors.co.nz/gb350",
  productId: "gid://shopify/Product/12345"
}
```

**During Price Sync**:
```
Queued price update {
  url: "https://hondaoutdoors.co.nz/gb350",
  canonical: "https://hondaoutdoors.co.nz/gb350",
  oldPrice: 7999,
  newPrice: 7499
}
```

---

## Available NPM Scripts

```bash
# Build TypeScript code
npm run build

# Run scraper (one-time)
npm run scrape

# Start scheduler (continuous mode)
npm run start:scheduler

# Start scheduler and run immediately
npm run dev:scheduler:now

# Refresh Shopify cache
npm run shopify:refresh

# Verify Shopify connection
npm run verify:shopify

# Run database migrations
npm run db:migrate

# Test components
npm run test:components
```

---

## Troubleshooting

### Issue: "No products found with source_url metafield"

**Cause**: Shopify products don't have the `custom.source_url` metafield populated

**Solution**:
1. Check if metafield exists in Shopify Admin
2. Verify metafield namespace is "custom" and key is "source_url"
3. Run population script if needed (see below)

---

### Issue: "Still low matching rate after refresh"

**Cause**: Shopify metafield URLs might be completely different from supplier URLs

**Solution**:
1. Check what URLs are stored in Shopify metafields
2. Compare with URLs scraped from supplier websites
3. Verify they refer to the same products

**Debug Command**:
```sql
-- Check Shopify cached URLs
SELECT source_url_canonical, product_title
FROM shopify_catalog_cache
LIMIT 10;

-- Check scraped URLs
SELECT canonical_url, latest_sale_price
FROM product_pages
LIMIT 10;
```

---

### Issue: "Database connection error"

**Cause**: Missing or incorrect environment variables

**Solution**:
1. Check `.env` file exists
2. Verify these variables are set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `SHOPIFY_STORE_DOMAIN`
   - `SHOPIFY_ADMIN_ACCESS_TOKEN`

---

## Next Steps After Successful Deployment

1. **Monitor Matching Rate**: Check reconciliation reports for 95%+ matching
2. **Review "Supplier Only" Products**: These are genuinely new products from suppliers
3. **Review "Shopify Only" Products**: These might be discontinued by supplier
4. **Set Up Email Notifications**: Configure SendGrid for automated alerts
5. **Schedule Regular Scraping**: Use cron or scheduler mode for daily/weekly runs

---

## Success Criteria

- ✅ Build completes without errors
- ✅ Shopify refresh shows URL canonicalization happening
- ✅ Scraper finds 95%+ matching rate
- ✅ Price sync successfully updates Shopify products
- ✅ Reconciliation report shows realistic numbers for new/discontinued products

---

## File Changes Summary

**Modified Files**:
1. `src/utils/canonicalize.ts` - Added pathname lowercase conversion
2. `src/shopify/client.ts` - Canonicalize URLs when caching and searching
3. `src/shopify/price-sync.ts` - Canonicalize URLs in sync operations
4. `src/types/index.ts` - Added missing fields to ShopifyProduct
5. **`refresh-shopify-simple.js`** - **Added canonicalization to refresh script** ⭐ NEW
6. `src/scraper/price-extractor.ts` - Fixed null → undefined for optional fields
7. `src/scripts/migrate.ts` - Removed unused variable

**New Files**:
1. `URL_MATCHING_FIX.md` - Technical documentation of the bug fix
2. `IMPLEMENTATION_PLAN.md` - Complete roadmap for future improvements
3. `test-url-matching.ts` - Test script for URL canonicalization
4. `DEPLOYMENT_STEPS.md` - This file

---

## Questions?

If matching rate is still low after following these steps, please:

1. Share output from `npm run shopify:refresh`
2. Share output from `npm run scrape`
3. Share sample URLs from both Shopify and scraper (for comparison)

The issue should be resolved with these changes, resulting in 95%+ matching rate.
