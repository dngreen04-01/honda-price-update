# Manual Price Sync Implementation

**Status**: ✅ Complete
**Change**: Prices are no longer automatically pushed to Shopify
**Approval Method**: Manual button click on dashboard

---

## Overview

The system has been updated to require **manual approval** before pushing supplier prices to Shopify. This gives you control over which prices get updated and when.

### What Changed

**Before**:
- ❌ Nightly job automatically synced ALL supplier prices to Shopify
- ❌ No manual review or approval required
- ❌ Price changes went live immediately

**After**:
- ✅ Nightly job scrapes prices but does NOT push to Shopify
- ✅ Dashboard shows price differences with clear indicators
- ✅ Manual "Push to Shopify" button for each product
- ✅ Instant feedback when price is pushed

---

## How It Works

### 1. Automated Scraping (Unchanged)
The nightly scraper still runs automatically:
1. Discovers product URLs (Firecrawl Map API)
2. Scrapes prices (Puppeteer)
3. Stores in database
4. **NEW**: Skips automatic Shopify sync

### 2. Dashboard Price Comparison
Navigate to: `http://localhost:5173/dashboard/price-comparison`

**Features**:
- View all products side-by-side (Supplier vs Shopify)
- Filter by: Prices Unmatched, Prices Matched, Not in Shopify, etc.
- Search by URL, product title, SKU
- See price difference ($amount and %)
- Visual indicators (red/green for increases/decreases)

### 3. Manual Price Push
**"Push to Shopify" button appears when**:
- Supplier has a price
- Shopify has the product
- Prices differ by more than $0.01

**Button behavior**:
- Click → Pushing... (loading spinner)
- Success → Pushed! (green checkmark, 3 seconds)
- Error → Alert with error message
- Reloads data after push to show updated prices

---

## API Endpoints

### 1. Health Check
```bash
GET http://localhost:3000/api/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-06T05:00:00.000Z"
}
```

### 2. Manual Price Sync
```bash
POST http://localhost:3000/api/price-sync
Content-Type: application/json

{
  "urls": [
    "https://hondaoutdoors.co.nz/eg2800i"
  ]
}
```

**Response (Success)**:
```json
{
  "success": true,
  "synced": 1,
  "skipped": 0,
  "failed": 0,
  "message": "Successfully synced 1 prices to Shopify"
}
```

**Response (Failure)**:
```json
{
  "success": false,
  "synced": 0,
  "skipped": 0,
  "failed": 1,
  "message": "Price sync failed: [error details]"
}
```

---

## Running the System

### Development Mode

**Terminal 1 - API Server**:
```bash
npm run dev:api
```
This starts the Express API server on `http://localhost:3000`

**Terminal 2 - Frontend**:
```bash
cd frontend
npm run dev
```
This starts the React frontend on `http://localhost:5173`

**Terminal 3 - Scraper (optional)**:
```bash
npm run scrape  # One-time scrape
# OR
npm run dev:scheduler  # Watch mode for scheduler
```

### Production Mode

**Build everything**:
```bash
npm run build
cd frontend && npm run build
```

**Run API server**:
```bash
npm run start:api
```

**Serve frontend** (use nginx, Vercel, or similar)

---

## Files Modified

### Backend

1. **[src/index.ts](src/index.ts)** - Nightly job now skips automatic sync
   ```typescript
   // Step 3: Price sync is now manual (via dashboard)
   logger.info('Step 3: Skipping automatic price sync (manual approval required via dashboard)');
   const syncResult = { synced: 0, skipped: 0, failed: 0 };
   ```

2. **[src/server.ts](src/server.ts)** - NEW Express API server
   - Health check endpoint: `GET /api/health`
   - Price sync endpoint: `POST /api/price-sync`
   - CORS enabled for frontend

3. **[src/api/price-sync-api.ts](src/api/price-sync-api.ts)** - NEW API handler
   - `handleManualPriceSync(request)` - Validates and executes price sync
   - Returns structured response with success/failure counts

### Frontend

4. **[frontend/src/pages/Dashboard/PriceComparison.tsx](frontend/src/pages/Dashboard/PriceComparison.tsx)** - Updated dashboard
   - Added "Actions" column to table
   - "Push to Shopify" button with loading states
   - Success animation (green checkmark, 3 seconds)
   - Auto-reload data after successful push
   - Icons: Upload, Loader2, Check from lucide-react

### Configuration

5. **[package.json](package.json)** - NEW scripts
   - `npm run dev:api` - Development API server (watch mode)
   - `npm run start:api` - Production API server

---

## Workflow Example

### Scenario: Supplier lowers price from $500 to $450

**Step 1: Nightly Scrape**
- Scraper detects new price ($450)
- Stores in database
- Does NOT push to Shopify (still $500)

**Step 2: Review in Dashboard**
- Open `http://localhost:5173/dashboard/price-comparison`
- Filter: "Prices Unmatched" (shows products where prices differ)
- See product with:
  - Supplier Price: $450.00
  - Shopify Price: $500.00
  - Difference: -$50.00 (-10%)

**Step 3: Manual Approval**
- Click "Push to Shopify" button
- Button shows "Pushing..." with spinner
- API calls Shopify to update price
- Button shows "Pushed!" with green checkmark
- Page reloads automatically

**Step 4: Verification**
- Shopify Price now shows: $450.00
- Difference now shows: $0.00 (0%)
- Product moves to "Prices Matched" filter

---

## Price Sync Logic

### What Gets Pushed

When you click "Push to Shopify", the system pushes:

1. **Price** (from `supplier_current_price`)
   - Shopify field: `variant.price`

2. **Compare At Price** (from `supplier_original_price`)
   - Shopify field: `variant.compareAtPrice`
   - Shows as "was $X.XX" in Shopify storefront
   - Only set if supplier has a special/sale price

### Example

**Supplier has sale**:
- Original Price: $599.00
- Sale Price: $499.00

**Pushed to Shopify**:
- `variant.price` = 499.00
- `variant.compareAtPrice` = 599.00

**Result in Shopify storefront**:
```
$499.00 was $599.00
```

---

## Benefits

### Control
- ✅ Review prices before they go live
- ✅ Catch pricing errors or anomalies
- ✅ Selective updates (only update specific products)
- ✅ Avoid accidental price changes

### Visibility
- ✅ See all price differences at a glance
- ✅ Filter by match status
- ✅ Track when prices were last updated
- ✅ View HTML snippet where price was found

### Safety
- ✅ No automatic updates during scraper runs
- ✅ Explicit user action required
- ✅ Instant feedback on success/failure
- ✅ Database and Shopify stay in sync

---

## Troubleshooting

### Button Doesn't Appear

**Cause**: One of these conditions isn't met:
- Supplier price missing
- Shopify product missing
- Prices already match (within $0.01)

**Solution**: Check the row data to see what's missing

### "Push to Shopify" Button Stuck on "Pushing..."

**Cause**: API server not running or network error

**Solution**:
1. Check API server is running: `npm run dev:api`
2. Check health endpoint: `http://localhost:3000/api/health`
3. Check browser console for errors

### Error: "Cannot push price: Missing supplier price or Shopify product"

**Cause**: Product missing required data

**Solution**: Ensure product has both:
- Supplier price in database
- Matching Shopify product with source_url metafield

### CORS Error in Browser Console

**Cause**: Frontend can't reach API server

**Solution**:
1. Ensure API server running on `http://localhost:3000`
2. Check CORS is enabled in [src/server.ts](src/server.ts)
3. Verify frontend calls correct API URL

---

## Future Enhancements

### Batch Operations
- Select multiple products
- "Push All Unmatched" button
- Bulk approve with single click

### Approval Workflow
- Require confirmation dialog
- Show preview of changes before pushing
- Add approval notes/reasons

### Notifications
- Email when prices need review
- Slack notification for large price changes
- Alert for unusual price differences

### Audit Trail
- Log who pushed which prices
- Track price change history
- Export audit logs

---

## Testing

### Test Manual Price Push

1. **Start API server**:
   ```bash
   npm run dev:api
   ```

2. **Start frontend**:
   ```bash
   cd frontend && npm run dev
   ```

3. **Navigate to dashboard**:
   ```
   http://localhost:5173/dashboard/price-comparison
   ```

4. **Find product with price difference**:
   - Click "Prices Unmatched" filter
   - Look for "Push to Shopify" button

5. **Test push**:
   - Click "Push to Shopify"
   - Verify button shows "Pushing..."
   - Verify button shows "Pushed!" (green)
   - Verify data reloads

6. **Verify in Shopify**:
   - Click Shopify price link
   - Check price matches supplier price

---

## Documentation

- **[PUPPETEER_IMPLEMENTATION.md](PUPPETEER_IMPLEMENTATION.md)** - Scraping architecture
- **[ARCHITECTURE_UPDATE.md](ARCHITECTURE_UPDATE.md)** - System overview
- **[RUN_MIGRATIONS.md](RUN_MIGRATIONS.md)** - Database migrations
