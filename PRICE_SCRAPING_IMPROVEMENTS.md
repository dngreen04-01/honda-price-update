# Price Scraping Improvements - Re-scrape Feature

## Problem Identified

The price scraper was incorrectly extracting prices for some products. For example:
- **SKU**: `EU20I-EU22I-GENERATOR-SERVICE-KIT`
- **App showed**: Supplier Price = $1049 | Shopify Price = $44
- **Actual price on supplier website**: $44

The issue was that the scraper was picking up the wrong price from HTML meta tags or other non-visible elements instead of the actual product price displayed on the page.

## Solutions Implemented

### 1. Honda-Specific Price Selectors (Priority #1)

**File**: [src/scraper/price-extractor.ts](src/scraper/price-extractor.ts)

Added Honda domain-specific CSS selectors as the **highest priority** extraction method:
- Targets Magento 2's specific price elements (`.product-info-price .price-final_price .price`)
- Avoids generic meta tags that can contain incorrect prices
- Uses domain-aware selector mapping from `honda-selectors.ts`

**Priority Order**:
1. Honda-specific selectors (NEW - highest priority)
2. JSON-LD structured data
3. Microdata and meta tags
4. Common CSS selectors
5. LLM extraction (fallback)

### 2. Price Anomaly Detection

**File**: [src/scraper/price-extractor.ts](src/scraper/price-extractor.ts:396-422)

Added intelligent validation to detect suspicious prices:
- Rejects prices < $1 or > $50,000
- Flags suspiciously round numbers (e.g., $1000, $1049) that might be metadata
- Logs warnings for review
- Falls back to deterministic extraction when LLM returns anomalous prices

### 3. Re-scrape Feature

#### Backend API Endpoint

**File**: [src/api/rescrape-api.ts](src/api/rescrape-api.ts)

New `/api/rescrape` endpoint that:
- Accepts a single product URL
- Fetches old price from database
- Forces a fresh scrape (bypasses caching)
- Compares old vs. new price
- Returns detailed result with price change information

#### Frontend Button

**File**: [frontend/src/pages/Dashboard/PriceComparison.tsx](frontend/src/pages/Dashboard/PriceComparison.tsx)

Added "Re-scrape" button to Price Comparison table:
- **Visual Indicator**: Orange button for suspicious price differences
- **Suspicious Price Detection**: Automatically flags prices with:
  - Large differences (>$500 or >500%)
  - Round numbers combined with small prices
- **User Feedback**: Shows loading state, success confirmation, and error messages
- **Auto-refresh**: Reloads comparison table after re-scrape

### 4. Improved Honda Selectors

**File**: [src/scraper/honda-selectors.ts](src/scraper/honda-selectors.ts:23-31)

Updated selectors for `hondaoutdoors.co.nz`:
```typescript
{
  price: '.product-info-price .price-final_price .price, .product-info-main .price-box .price',
  salePrice: '.special-price .price, .product-info-price .special-price .price',
  originalPrice: '.old-price .price, .product-info-price .old-price .price',
  sku: '.product.attribute.sku .value, [itemprop="sku"]',
  name: '.page-title .base, h1.page-title, [itemprop="name"]',
}
```

## How to Use

### For End Users

1. **Navigate to Price Comparison page** in the dashboard
2. **Identify suspicious prices**:
   - Look for "Suspicious" badge in the Difference column
   - Check for large price discrepancies
3. **Click "Re-scrape" button** for the problematic product
4. **Wait for confirmation** - The button will show:
   - "Scraping..." (in progress)
   - "Done!" (success)
   - Alert message with old vs. new price
5. **Table automatically refreshes** with corrected price

### For Developers

#### Test the Re-scrape API

```bash
curl -X POST http://localhost:3000/api/rescrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.hondaoutdoors.co.nz/product/eu20i-eu22i-generator-service-kit"}'
```

#### Example Response

```json
{
  "success": true,
  "message": "Price updated from $1049.00 to $44.00",
  "data": {
    "url": "https://www.hondaoutdoors.co.nz/product/eu20i-eu22i-generator-service-kit",
    "oldPrice": 1049,
    "newPrice": 44,
    "priceChanged": true,
    "htmlSnippet": "<span class=\"price\">$44.00</span>"
  }
}
```

## Files Changed

### Backend
- ✅ [src/scraper/price-extractor.ts](src/scraper/price-extractor.ts) - Added Honda selectors priority + anomaly detection
- ✅ [src/scraper/honda-selectors.ts](src/scraper/honda-selectors.ts) - Improved Magento 2 selectors
- ✅ [src/api/rescrape-api.ts](src/api/rescrape-api.ts) - New re-scrape endpoint (NEW FILE)
- ✅ [src/server.ts](src/server.ts) - Added `/api/rescrape` route

### Frontend
- ✅ [frontend/src/pages/Dashboard/PriceComparison.tsx](frontend/src/pages/Dashboard/PriceComparison.tsx)
  - Added re-scrape button
  - Added suspicious price detection logic
  - Added visual indicators (orange button for suspicious prices)
  - Added loading states and success feedback

## Next Steps

### To Fix Existing Errors

1. **Start the backend server**:
   ```bash
   npm run dev
   ```

2. **Navigate to Price Comparison** in the dashboard

3. **Filter by "Prices Unmatched"** to see all price discrepancies

4. **Click "Re-scrape"** on products with suspicious prices (look for the "Suspicious" badge)

5. **Verify the corrected prices** in the table

### To Prevent Future Errors

The improved extraction logic now:
- **Prioritizes Honda-specific selectors** before falling back to generic methods
- **Validates prices** for anomalies before accepting them
- **Logs warnings** for review when suspicious prices are detected
- **Provides easy re-scrape** functionality for quick corrections

### For the Problematic SKU

For `EU20I-EU22I-GENERATOR-SERVICE-KIT`:
1. Find it in the Price Comparison table (search by SKU)
2. Click the orange "Re-scrape" button
3. The price should update from $1049 to $44
4. The "Suspicious" badge should disappear

## Technical Details

### Anomaly Detection Algorithm

```typescript
isSuspiciousPriceDifference(row) {
  // 1. Price difference is very large (>$500 or >500%)
  const isLargeDiff = diff > 500 || diffPercent > 500

  // 2. One price is suspiciously round (like $1000, $1049)
  const hasRoundPrice = (price > 100 && price % 100 === 0)

  // 3. The other price is small (< $100)
  const hasSmallPrice = price < 100

  // Flag if large diff OR (round + small + >100% diff)
  return isLargeDiff || (hasRoundPrice && hasSmallPrice && diffPercent > 100)
}
```

### Selector Priority

1. **Honda-specific** (confidence: high) ⭐ NEW
2. **JSON-LD** (confidence: high)
3. **Microdata** (confidence: high)
4. **DOM selectors** (confidence: low)
5. **LLM extraction** (confidence: low, with validation) ⭐ IMPROVED

## Monitoring

Watch the logs for these indicators:
- `Honda selector extraction failed` - Domain-specific selectors didn't find a price
- `LLM price appears anomalous` - Validation caught a suspicious price
- `Suspicious round price detected` - Warning flag for review
- `Re-scrape requested` - User initiated a fresh scrape

## Success Metrics

- ✅ Build passes with no TypeScript errors
- ✅ Honda-specific selectors prioritized
- ✅ Price anomaly detection implemented
- ✅ Re-scrape API endpoint created and integrated
- ✅ Frontend button added with suspicious price detection
- ✅ Visual indicators for problematic prices
- ✅ Automatic table refresh after re-scrape
