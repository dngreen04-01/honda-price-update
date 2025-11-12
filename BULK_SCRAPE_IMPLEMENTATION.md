# Bulk Scrape Implementation Summary

Implementation of bulk scraping functionality for products without supplier prices.

## Files Created

### 1. API Handler
**File**: `src/api/bulk-scrape-api.ts`

Core functionality:
- Filters products with URLs but no scraped prices
- Supports concurrency control (default: 3)
- Supports limit parameter for testing
- Returns detailed statistics

### 2. CLI Script
**File**: `src/scripts/bulk-scrape.ts`

Command-line interface:
- User-friendly output
- Argument parsing for `--concurrency` and `--limit`
- Progress reporting
- Exit codes for success/failure

### 3. API Route
**File**: `src/server.ts` (modified)

Added endpoint:
- **POST** `/api/bulk-scrape`
- Accepts `{ concurrency?, limit? }`
- Returns success status and statistics

### 4. Documentation
- `BULK_SCRAPE.md` - User guide and reference
- `BULK_SCRAPE_IMPLEMENTATION.md` - This file
- `test-bulk-scrape-api.js` - API test script

### 5. Package Script
**File**: `package.json` (modified)

Added script:
```json
"scrape:bulk": "tsx src/scripts/bulk-scrape.ts"
```

## Usage Examples

### CLI Usage

```bash
# Scrape all products without prices
npm run scrape:bulk

# Test with 5 products
npm run scrape:bulk -- --limit=5

# Fast scrape with higher concurrency
npm run scrape:bulk -- --concurrency=10 --limit=20
```

### API Usage

```javascript
// POST /api/bulk-scrape
const response = await fetch('http://localhost:3000/api/bulk-scrape', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    concurrency: 3,
    limit: 10
  })
});

const result = await response.json();
// {
//   success: true,
//   message: "Bulk scrape completed. 10 of 10 products scraped successfully.",
//   data: {
//     totalEligible: 127,
//     totalScraped: 10,
//     successfulExtractions: 9,
//     failedExtractions: 1,
//     duration: 45.23
//   }
// }
```

## Architecture

### Selection Logic

```typescript
// Filter eligible products
const eligibleProducts = catalog.filter(p => {
  const hasUrl = !!p.source_url_canonical;
  const hasScrapedPrice = !!(p as any).scraped_sale_price;
  return hasUrl && !hasScrapedPrice;
});
```

### Processing Flow

1. **Load catalog** from database
2. **Filter eligible** products (URL + no price)
3. **Apply limit** if specified
4. **Restore www.** subdomain for scraping
5. **Scrape in batches** using Bright Data
6. **Store results** in database
7. **Return statistics**

### Error Handling

- Catches and logs all errors
- Returns success: false with error message
- Individual product failures don't stop batch
- Detailed logging for debugging

## Testing

### Test Results

**Test Date**: 2025-11-12

**Sample Test** (limit=2):
```
Total eligible products: 127
Products scraped: 2
Successful extractions: 2
Failed extractions: 0
Success rate: 100.0%
Duration: 21.07s
```

**Products Scraped**:
1. ✅ HRX217 Premium Lawnmower: $2,399
2. ⚠️ GX50 Engine: No price (confidence: 0.3)

### Performance Metrics

- Average scrape time: ~10-11 seconds per product (concurrency 3)
- Success rate: 100% (scraping), 50% (price extraction)
- Database storage: <1 second per product

## Integration Points

### With Existing Systems

1. **Scraper Orchestrator**: Reuses existing `scrapeProducts()` method
2. **Database**: Uses `getShopifyCatalogCache()` and `storeProducts()`
3. **Logging**: Integrates with Winston logger
4. **API Server**: Follows existing endpoint patterns

### Future Enhancements

1. **Progress Tracking**: Add WebSocket for real-time progress
2. **Scheduling**: Add to cron jobs for automatic catch-up
3. **Filtering**: Add domain or product type filters
4. **Retry Logic**: Add automatic retry for failed products
5. **Queue System**: Add job queue for large batches

## Cost Considerations

### Bright Data Usage

Based on test with 2 products:
- Time: 21.07 seconds
- Cost: ~$0.005 (2 products × $0.0025)

Projected costs:
- 50 products: ~$0.13, ~5-6 minutes
- 127 products (all eligible): ~$0.32, ~14-15 minutes
- 500 products: ~$1.25, ~50-55 minutes

### Optimization Tips

1. Start with small limits for testing
2. Use concurrency=3 for normal operations
3. Increase to concurrency=5-10 for urgent updates
4. Monitor Bright Data dashboard for usage

## Known Issues and Limitations

### Current Limitations

1. **No Resume**: If interrupted, starts from beginning
2. **No Queue**: All products scraped in one session
3. **No Priority**: First-come-first-served order
4. **No Filtering**: Can't filter by domain or category

### Workarounds

1. **Use `--limit`**: Scrape in smaller batches
2. **Manual Priority**: Manually scrape important products first via dashboard
3. **Domain Filtering**: Can be added if needed

### Future Improvements

1. Add checkpoint/resume functionality
2. Add priority queue based on product importance
3. Add filtering by domain, category, or SKU pattern
4. Add progress bar for CLI
5. Add email notification when complete

## Monitoring and Maintenance

### Health Checks

1. **Success Rate**: Should be >90% for price extraction
2. **Duration**: ~10s per product is normal
3. **Error Logs**: Check for selector issues

### Troubleshooting

**Low success rate**:
- Check selector accuracy with individual rescrape
- Review logs for common error patterns
- Test specific domains separately

**Slow performance**:
- Check Bright Data connection
- Reduce concurrency if hitting rate limits
- Check network connectivity

**Database issues**:
- Verify Supabase connection
- Check database permissions
- Review query performance
