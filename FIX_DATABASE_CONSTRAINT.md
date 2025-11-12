# URGENT: Fix Database Constraint Issue

## Problem

The scraper is failing with this error:
```
duplicate key value violates unique constraint "shopify_catalog_cache_source_url_canonical_key"
```

**Root Cause**: Multiple Shopify products have the same (or empty) `custom.source_url` metafield, but the database requires each URL to be unique. This is the wrong constraint.

## Solution

The `shopify_variant_id` should be the unique key (one variant = one cache entry).
The `source_url_canonical` should NOT be unique (multiple products might have the same or empty URL).

---

## Fix Method 1: Run SQL in Supabase Dashboard (RECOMMENDED)

1. **Open Supabase SQL Editor**: https://supabase.com/dashboard → Your Project → SQL Editor

2. **Run this SQL**:

```sql
-- Drop the incorrect UNIQUE constraint on source_url_canonical
ALTER TABLE shopify_catalog_cache
  DROP CONSTRAINT IF EXISTS shopify_catalog_cache_source_url_canonical_key;

-- Add comment explaining why it's not unique
COMMENT ON COLUMN shopify_catalog_cache.source_url_canonical IS
  'Canonical source URL from Shopify metafield. May be null or duplicate for products without supplier URLs assigned.';

-- Verify the constraint is gone
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'shopify_catalog_cache'::regclass;
```

3. **Expected Output**:
```
conname                                    | contype
-------------------------------------------+---------
shopify_catalog_cache_pkey                | p
shopify_catalog_cache_shopify_variant_id_key | u
```

You should see `shopify_variant_id` has unique constraint (contype='u'), but `source_url_canonical` does NOT.

---

## Fix Method 2: Alternative via Database URL (if you have connection string)

If you have a direct database connection string, run:

```bash
psql "your-supabase-database-url-here" <<EOF
ALTER TABLE shopify_catalog_cache
  DROP CONSTRAINT IF EXISTS shopify_catalog_cache_source_url_canonical_key;
EOF
```

---

## After Fixing

1. **Clear the cache table** (optional, to start fresh):
```sql
TRUNCATE shopify_catalog_cache;
```

2. **Re-run the Shopify refresh**:
```bash
npm run shopify:refresh
```

3. **Verify no errors**:
   - Should see "✅ Successfully updated XXX products"
   - No "duplicate key" errors

---

## Why This Happened

Your Shopify products likely have:
- Empty `custom.source_url` metafields (→ becomes "" after canonicalization)
- Placeholder URLs (→ many products with same placeholder)
- Incomplete metafield population

The database was incorrectly enforcing uniqueness on URLs, when it should enforce uniqueness on Shopify variant IDs.

---

## What's the Correct Schema?

**Before** (INCORRECT):
```sql
shopify_variant_id TEXT NOT NULL UNIQUE,    ← Correct
source_url_canonical TEXT NOT NULL UNIQUE,   ← WRONG!
```

**After** (CORRECT):
```sql
shopify_variant_id TEXT NOT NULL UNIQUE,    ← Correct (one variant = one entry)
source_url_canonical TEXT,                   ← Correct (can be null/duplicate)
```

---

## Verification

After running the fix, check the table:

```sql
-- Should return products with same source_url_canonical
SELECT source_url_canonical, COUNT(*)
FROM shopify_catalog_cache
GROUP BY source_url_canonical
HAVING COUNT(*) > 1;
```

If you see results, that's NORMAL - it means products without proper URLs are being stored correctly.

---

## Next Steps

1. Fix this constraint issue (run the SQL above)
2. Address Firecrawl credit issue (see separate document)
3. Populate missing `custom.source_url` metafields in Shopify
