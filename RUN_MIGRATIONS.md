# Running Migrations 004 & 005

## Quick Method (Recommended)

**Run both migrations directly in Supabase SQL Editor:**

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. **Navigate to**: Your Project → SQL Editor (left sidebar)
3. **Click "New Query"**
4. **Copy and paste both SQL statements below**:

```sql
-- Migration 004: Fix source_url_canonical unique constraint
ALTER TABLE shopify_catalog_cache
  DROP CONSTRAINT IF EXISTS shopify_catalog_cache_source_url_canonical_key;

-- Migration 005: Add archive fields to product_pages
ALTER TABLE product_pages
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;
```

5. **Click "Run"** (or press Cmd/Ctrl + Enter)
6. **Verify success** - You should see "Success. No rows returned"

---

## Alternative Method (Using Scripts)

If you prefer to see the migration details first:

### Migration 004
```bash
node run-migration-004.js
```

This will display the SQL you need to run manually.

### Migration 005
```bash
node run-migration-005.js
```

This will display the SQL you need to run manually.

---

## What These Migrations Do

### Migration 004: Fix URL Constraint
**Problem**: Database had UNIQUE constraint on `source_url_canonical`, preventing multiple products from having the same/empty URL.

**Fix**: Removes the constraint. Only `shopify_variant_id` should be unique.

**Impact**: Allows multiple Shopify products to exist without source URLs (expected for products not yet matched).

### Migration 005: Add Archive Fields
**Purpose**: Support for archiving discontinued products.

**New Columns**:
- `archived` (BOOLEAN) - Whether product is archived
- `archived_at` (TIMESTAMPTZ) - When it was archived
- `archive_reason` (TEXT) - Why it was archived (e.g., "discontinued")

**Impact**: Enables tracking of discontinued products without deleting them.

---

## After Running Migrations

Run these commands to refresh the Shopify cache with canonical URLs:

```bash
# Build the project
npm run build

# Refresh Shopify cache (fixes URL canonicalization)
npm run shopify:refresh
```

This will populate the cache with properly canonicalized URLs, fixing the 0.5% matching rate.

---

## Verification

Check that migrations succeeded:

```sql
-- Verify migration 004: No unique constraint on source_url_canonical
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'shopify_catalog_cache'
  AND constraint_name = 'shopify_catalog_cache_source_url_canonical_key';
-- Should return no rows

-- Verify migration 005: Archive columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'product_pages'
  AND column_name IN ('archived', 'archived_at', 'archive_reason');
-- Should return 3 rows
```

---

## Troubleshooting

### "Permission Denied"
- You need the service role key (SUPABASE_SERVICE_KEY in .env)
- OR run the SQL manually in Supabase SQL Editor (recommended)

### "Constraint does not exist" (Migration 004)
- This is fine - it means the constraint was already removed or never existed
- The migration uses `IF EXISTS` so it's safe to run

### "Column already exists" (Migration 005)
- This is fine - the migration uses `IF NOT EXISTS` so it's safe to run
