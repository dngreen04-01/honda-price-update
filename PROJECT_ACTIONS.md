# Project Outstanding Actions

**Current Blocker:** 🛑 **Bright Data Credits Exhausted**
*Cannot proceed with `npm run scrape` or `npm run scrape:test` until credits are added.*

---

## 1. Restore Scraping Capability
**Status:** 🔴 **To Do**
**Priority:** 🚨 **Critical**
**Assignee:** User / Billing Admin

**Context:**
The scraping architecture now relies entirely on Puppeteer + Bright Data (Residential Proxies). The test run failed with `403 Forbidden`, and the user confirmed credits are exhausted.

**Session Plan:**
1.  Log in to [Bright Data Dashboard](https://brightdata.com).
2.  Add credits to the account.
3.  Ensure the "Scraping Browser" zone (`honda_scrapper`) is Active.
4.  Run `node test-bright-data.js` locally to verify connection.
5.  Run `npm run scrape:bulk -- --limit=2` to confirm full pipeline works.

---

## 2. Implement Archive Functionality
**Status:** 🔴 **To Do**
**Priority:** 🔴 **High**
**Assignee:** Developer

**Context:**
The system currently lacks a way to handle discontinued products (404s) or manually hide products that shouldn't be tracked. This was a Phase 1 requirement.

**Session Plan:**
1.  **Backend (`src/database/queries.ts`):**
    *   Create `archiveProductByUrl(canonicalUrl: string)` function.
    *   Update `shopify_catalog_cache` table to include `archived` (boolean) and `archived_at` (timestamp) columns if missing.
2.  **API (`src/server.ts`):**
    *   Add `POST /api/archive` endpoint.
3.  **Frontend (`frontend/src/pages/Dashboard/PriceComparison.tsx`):**
    *   Add an "Archive" button to the product row.
    *   Connect button to the API endpoint.
4.  **Verification:**
    *   Archive a test product and ensure it disappears from the "Active" list but remains in history.

---

## 3. Frontend Data Alignment
**Status:** 🟡 **To Do**
**Priority:** 🟠 **Medium**
**Assignee:** Developer

**Context:**
The backend has migrated to storing scraped prices in `shopify_catalog_cache` (new columns: `scraped_sale_price`, `scrape_confidence`), but the Frontend Dashboard might still be reading from the old `product_pages` table or legacy logic.

**Session Plan:**
1.  **Analyze Frontend Queries:**
    *   Check `frontend/src/lib/supabase.ts` or wherever data is fetched.
2.  **Update Types:**
    *   Update frontend TypeScript interfaces to match the new `shopify_catalog_cache` schema.
3.  **Update Views:**
    *   Ensure "Price Comparison" and "Scraping Tasks" widgets pull from `scraped_sale_price` instead of the old tables.
4.  **Verification:**
    *   Manually update a record in the DB and see if it reflects on the Dashboard.

---

## 4. Full Data Population (Bulk Scrape)
**Status:** 🟡 **To Do** (Blocked by #1)
**Priority:** 🔴 **High**
**Assignee:** Developer / System

**Context:**
The new "Simplified Scraper" logic is built but has not run on the full catalog of 850+ products. The database currently has `null` for most `scraped_sale_price` records.

**Session Plan:**
1.  **Pre-requisite:** Ensure Task #1 (Credits) is done.
2.  **Execution:**
    *   Run `npm run scrape:bulk` (scrapes only products with missing prices).
    *   Monitor logs for 403/429 errors.
3.  **Reconciliation:**
    *   Run `npm run verify:shopify` or check the Dashboard to see how many products matched.
    *   Identify products with low confidence scores (< 0.8) for manual review.

---

## 5. Production Configuration Check
**Status:** 🟡 **To Do**
**Priority:** 🟢 **Low** (until deployment)
**Assignee:** DevOps / Developer

**Context:**
We verified local `.env` has Bright Data credentials, but we must ensure the production environment (Supabase Edge Functions, VPS, or wherever this deploys) has them too.

**Session Plan:**
1.  **Audit Secrets:**
    *   If using Supabase Edge Functions: `supabase secrets list`.
    *   If using VPS/Docker: Check remote `.env` or Docker environment vars.
2.  **Set Missing Variables:**
    *   `BRIGHT_DATA_BROWSER_API`
    *   `BRIGHT_DATA_USERNAME`
    *   `BRIGHT_DATA_PROXY_PASSWORD`
3.  **Smoke Test:**
    *   Trigger a manual job in production (if possible) to confirm connectivity.
