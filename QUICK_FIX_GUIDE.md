# Quick Fix Guide - Resolve Scraper Errors

## You Have 2 Critical Issues

### ❌ Issue 1: Database Constraint Error
```
duplicate key value violates unique constraint "shopify_catalog_cache_source_url_canonical_key"
```

### ❌ Issue 2: Firecrawl Out of Credits
```
Insufficient credits to perform this request
```

---

## Fix Both Issues (5 Minutes)

### Step 1: Fix Database Constraint ⚡ CRITICAL

**Open Supabase SQL Editor**: https://supabase.com/dashboard → Your Project → SQL Editor

**Run this SQL**:
```sql
ALTER TABLE shopify_catalog_cache
  DROP CONSTRAINT IF EXISTS shopify_catalog_cache_source_url_canonical_key;
```

**Expected**: No errors, constraint dropped successfully

---

### Step 2: Fix Firecrawl Credits

**Choose ONE option**:

#### Option A: Add Credits (Quick, costs money)
1. Visit: https://firecrawl.dev/pricing
2. Add $5 worth of credits (5,000 credits)
3. Run scraper: `npm run scrape`

#### Option B: Use Cached URLs (Free, requires past data)
- If you've scraped before, you have URLs in your database
- Skip this for now, focus on Option A

---

## Verify Fixes

### Test 1: Refresh Shopify Cache

```bash
npm run shopify:refresh
```

**Expected Output**:
```
✅ Successfully updated 368 products
```

**No errors about duplicate keys!**

---

### Test 2: Run Scraper (if you added Firecrawl credits)

```bash
npm run scrape
```

**Expected Output**:
```
[INFO] Discovering products
[INFO] Firecrawl Map - Found XXX URLs
[INFO] Scraping products...
[INFO] Full scrape completed
```

**No errors about insufficient credits!**

---

## If You Don't Want to Buy Firecrawl Credits

You have 3 alternatives:

### Alternative 1: Wait and Focus on Shopify Sync Only

The URL matching fix we implemented doesn't require scraping. You can:

1. Fix the database constraint (Step 1 above) ✅
2. Run `npm run shopify:refresh` to cache existing Shopify products
3. Skip scraping for now (no new supplier data, but Shopify sync works)

**Use Case**: You just want to see if the URL matching fix works before buying credits.

---

### Alternative 2: Manual URL Lists (Free, but manual work)

Create a file with known product URLs and modify the scraper to use that instead of Firecrawl Map.

**See**: FIRECRAWL_CREDIT_ISSUE.md Option 3

---

### Alternative 3: Implement Puppeteer Now (Free long-term, 2-3 days work)

Skip Firecrawl entirely and build the Puppeteer scraper.

**See**: IMPLEMENTATION_PLAN.md Phase 2

---

## Summary

| Step | Action | Time | Cost |
|------|--------|------|------|
| **1** | Fix database constraint | 1 min | Free |
| **2** | Refresh Shopify cache | 1 min | Free |
| **3a** | Add Firecrawl credits | 2 min | $5 |
| **3b** | OR wait and skip scraping | 0 min | Free |

**Minimum to test URL matching fix**: Steps 1 + 2 (free, 2 minutes)

**Full working scraper**: Steps 1 + 2 + 3a ($5, 5 minutes)

---

## Documents Reference

- **FIX_DATABASE_CONSTRAINT.md** - Detailed database fix instructions
- **FIRECRAWL_CREDIT_ISSUE.md** - All Firecrawl alternatives and cost analysis
- **DEPLOYMENT_STEPS.md** - How to deploy the URL matching fix
- **IMPLEMENTATION_PLAN.md** - Long-term roadmap and Puppeteer migration

---

## Questions?

1. **Do I need to fix both issues?**
   - Yes, to run the full scraper
   - But you can test URL matching with just Issue 1 fixed

2. **How much do Firecrawl credits cost?**
   - $1 per 1,000 credits
   - You need ~50-150 credits per scrape
   - $5 should last 10-30 scrape runs

3. **Will the URL matching fix work without fixing these?**
   - No - the database constraint prevents Shopify refresh
   - Fix Issue 1 at minimum to test the URL matching

4. **Should I implement Puppeteer now or later?**
   - Add $5 credits NOW to unblock testing
   - Implement Puppeteer LATER (next 2 weeks) for long-term savings
