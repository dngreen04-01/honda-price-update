# Bulk Scrape - Products Without Supplier Prices

Bulk scraping command to scrape all products that have a source URL but no supplier price yet.

## Overview

This feature allows you to:
- Scrape all products with URLs that don't have prices
- Limit the number of products to scrape (for testing)
- Control concurrency for faster/slower scraping
- Track progress and success rates

## Usage

### CLI Command

```bash
# Scrape all eligible products (no limit)
npm run scrape:bulk

# Scrape only first 10 products (for testing)
npm run scrape:bulk -- --limit=10

# Scrape with higher concurrency (faster but more resource intensive)
npm run scrape:bulk -- --concurrency=5

# Combine options
npm run scrape:bulk -- --limit=20 --concurrency=5
```

### API Endpoint

**POST** `/api/bulk-scrape`

Request body:
```json
{
  "concurrency": 3,  // Optional, default: 3
  "limit": 10        // Optional, no default (scrapes all)
}
```

Response:
```json
{
  "success": true,
  "message": "Bulk scrape completed. 10 of 10 products scraped successfully.",
  "data": {
    "totalEligible": 127,        // Total products without prices
    "totalScraped": 10,           // Products scraped in this run
    "successfulExtractions": 9,   // Successfully extracted prices
    "failedExtractions": 1,       // Failed to extract prices
    "duration": 45.23             // Seconds
  }
}
```

## How It Works

### Product Selection

The bulk scraper finds products that:
1. ✅ Have a `source_url_canonical` (linked to supplier website)
2. ❌ Don't have a `scraped_sale_price` (no price scraped yet)

### Scraping Process

1. **Load Catalog**: Get all products from `shopify_catalog_cache`
2. **Filter Eligible**: Find products matching criteria above
3. **Apply Limit**: If specified, take only first N products
4. **Restore www**: Add www. subdomain for scraping (Honda sites require it)
5. **Scrape**: Use Bright Data Scraping Browser with specified concurrency
6. **Store Results**: Save prices to database with confidence scores
7. **Report Stats**: Show success rate and duration

### Performance

- **Concurrency 3** (default): ~10 seconds per product (safer, lower resource usage)
- **Concurrency 5**: ~7 seconds per product (faster, higher resource usage)
- **Concurrency 10**: ~4 seconds per product (fastest, may hit rate limits)

Example: Scraping 100 products
- Concurrency 3: ~16-17 minutes
- Concurrency 5: ~11-12 minutes
- Concurrency 10: ~6-7 minutes

## Use Cases

### Initial Setup
Scrape all products when first setting up the system:
```bash
npm run scrape:bulk
```

### Testing Selectors
Test with a small batch before full scrape:
```bash
npm run scrape:bulk -- --limit=5
```

### Catch-Up Scraping
After adding new products to Shopify:
```bash
npm run scrape:bulk
```

### Fast One-Time Scrape
For urgent price updates:
```bash
npm run scrape:bulk -- --concurrency=10
```

## Error Handling

### Common Issues

**No products to scrape**:
- All products already have prices
- No products have source URLs
- Check with: `npm run verify:shopify`

**Rate limiting**:
- Reduce concurrency: `--concurrency=2`
- Add delay between batches (automatic)
- Bright Data handles most rate limiting automatically

**Price extraction failures**:
- Check selector accuracy with single rescrape
- Some products may need manual selector updates
- See detailed logs for specific failures

## Integration

### With Nightly Scheduler

The bulk scrape is separate from the nightly full scrape. Use it for:
- Initial population
- Catching up on missed products
- Testing new selectors

### With Manual Rescrape

After bulk scraping:
- Individual products can be rescraped via dashboard
- Bulk scrape won't re-scrape products with existing prices
- Use rescrape API for specific product updates

## Monitoring

### Logs

Logs include:
- Total products in catalog
- Eligible products (without prices)
- Products already scraped (with prices)
- Products without URLs
- Scraping progress and success rate

### Success Metrics

- **100% success rate**: All selectors working correctly
- **>90% success rate**: Good, minor selector issues
- **<90% success rate**: Check selector accuracy, may need updates

## Cost Considerations

### Bright Data Usage

- ~$0.0025 per product scraped
- 100 products = ~$0.25
- 500 products = ~$1.25
- 1000 products = ~$2.50

### Recommendations

1. **Test first**: Use `--limit=10` before full scrape
2. **Monitor costs**: Check Bright Data dashboard
3. **Optimize concurrency**: Balance speed vs. cost
4. **Batch processing**: Scrape in smaller batches if needed
