# Honda Supplier Price Scraper - Project Summary

## Overview

Automated nightly scraper that monitors Honda NZ supplier websites for price changes and promotional offers, syncs prices to Shopify, and sends comprehensive email digests.

## Architecture

### Tech Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Database**: Supabase (PostgreSQL)
- **Scraping**: Firecrawl v2 API
- **E-commerce**: Shopify GraphQL Admin API
- **Email**: SendGrid v3 API
- **Orchestration**: Supabase Edge Functions + Cron

### Project Structure
```
src/
├── database/          # Supabase client, queries, schema
│   ├── client.ts
│   ├── queries.ts
│   └── schema.sql
├── scraper/          # Firecrawl integration & orchestration
│   ├── firecrawl-client.ts
│   ├── price-extractor.ts
│   └── scraper-orchestrator.ts
├── shopify/          # Shopify GraphQL client & sync
│   ├── client.ts
│   └── price-sync.ts
├── email/            # SendGrid integration & digest generation
│   ├── sendgrid-client.ts
│   └── digest-generator.ts
├── utils/            # Utilities & helpers
│   ├── config.ts
│   ├── logger.ts
│   ├── canonicalize.ts
│   └── reconciliation.ts
├── types/            # TypeScript definitions
│   └── index.ts
├── scripts/          # Setup and maintenance scripts
│   ├── migrate.ts
│   └── test-components.ts
└── index.ts          # Main orchestration entry point
```

## Key Features

### 1. Product Discovery & Scraping
- **Firecrawl Map API**: Discovers all product URLs on supplier domains
- **Batch Scraping**: Efficiently scrapes multiple products in parallel
- **Smart Filtering**: Identifies product pages vs category/blog pages

### 2. Price Extraction
- **Deterministic Parsing** (Priority 1):
  - JSON-LD structured data (`Product.offers.price`)
  - Microdata/meta tags (`itemprop="price"`)
  - Common DOM selectors (`.price`, `.sale-price`)
- **LLM Fallback** (Priority 2):
  - Firecrawl Extract API with JSON schema
  - Used when deterministic methods fail
- **Confidence Scoring**: High/low confidence tracking
- **Source Attribution**: Tracks deterministic vs LLM extraction

### 3. URL Canonicalization
- Lowercase host, remove `www.`
- Drop tracking parameters (`utm_*`, `gclid`)
- Normalize trailing slashes
- Ensures consistent matching between supplier and Shopify

### 4. Database Schema
**6 Core Tables**:
- `domains`: Supplier websites configuration
- `product_pages`: Latest product prices
- `price_history`: Historical price snapshots
- `offers`: Promotional offers with dates
- `shopify_catalog_cache`: Shopify products mapped by source_url
- `reconcile_results`: Missing product tracking

### 5. Shopify Integration
- **GraphQL Admin API**: Efficient bulk operations
- **Metafield Mapping**: Products linked via `custom.source_url`
- **Batch Updates**: `productVariantsBulkUpdate` mutation
- **Catalog Caching**: Local cache for fast lookups
- **Error Handling**: Comprehensive `userErrors` tracking

### 6. Reconciliation Engine
- **Set Operations**:
  - A \ B: Supplier-only products
  - B \ A: Shopify-only products
- **Status Tracking**: Active, redirect, 404, pending
- **Future Enhancement**: Auto-relink on URL redirects

### 7. Email Notifications
- **Dynamic Templates**: SendGrid templates with Handlebars
- **Rich Digest**: Price changes, offers, missing products, stats
- **CSV Attachments**: Detailed data exports
- **Alert System**: Failure notifications

### 8. Nightly Orchestration
**7-Step Workflow**:
1. Run full scrape (discover → crawl → extract → store)
2. Refresh Shopify catalog cache
3. Sync prices to Shopify
4. Run reconciliation
5. Generate email digest data
6. Generate CSV attachments
7. Send email digest

## Acceptance Criteria

| Metric | Target | Implementation |
|--------|--------|---------------|
| Product Discovery Rate | ≥90% | Firecrawl Map with smart filtering |
| Extraction Success Rate | ≥98% deterministic | Multi-strategy parser + LLM fallback |
| Shopify Sync Accuracy | 100% for matched | GraphQL bulk updates with validation |
| Email Delivery | 2xx status | SendGrid API with error handling |

## Configuration

### Environment Variables
```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxxx...

# Firecrawl
FIRECRAWL_API_KEY=fc-xxxxx

# Shopify
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_API_VERSION=2024-01

# SendGrid
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=notifications@yourdomain.com
SENDGRID_DIGEST_TEMPLATE_ID=d-xxxxx
SENDGRID_RECIPIENT_EMAILS=you@example.com

# App
TIMEZONE=Pacific/Auckland
LOG_LEVEL=info
```

### Supplier Domains
Configured in `domains` table:
- https://www.hondaoutdoors.co.nz/
- https://www.hondamarine.co.nz/
- https://www.hondamotorbikes.co.nz/

## Usage

### Local Development
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npm run db:migrate

# Test components
npm run test:components

# Run manual scrape
npm run scrape
```

### Production Deployment
```bash
# Deploy to Supabase Edge Functions
supabase functions deploy nightly-scraper-job

# Set secrets
supabase secrets set FIRECRAWL_API_KEY=xxx
supabase secrets set SHOPIFY_ADMIN_ACCESS_TOKEN=xxx
supabase secrets set SENDGRID_API_KEY=xxx

# Schedule cron job (02:00 NZT = 14:00 UTC)
# Via SQL in Supabase dashboard
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## Error Handling & Resilience

### Graceful Degradation
- **Partial Failures**: Continue processing on individual errors
- **LLM Fallback**: Use LLM extraction when deterministic fails
- **Alert System**: Email notifications on critical failures
- **Logging**: Comprehensive structured logging

### Rate Limiting
- **Firecrawl**: 100ms delays between requests
- **Shopify**: 500ms delays between product updates
- **Batch Operations**: Grouped for efficiency

### Validation
- **Price Parsing**: Numeric validation, currency normalization
- **URL Canonicalization**: Consistent formatting
- **Confidence Scoring**: Track extraction quality
- **Quality Gates**: Pre-deployment validation

## Monitoring & Observability

### Key Metrics
- Products scraped vs successfully extracted
- Extraction success rate (deterministic vs LLM)
- Shopify sync success/failure counts
- Email delivery status
- Processing duration

### Logging
- **Levels**: debug, info, warn, error
- **Structured**: JSON-formatted with metadata
- **Contextual**: Request IDs, product URLs, domain IDs

### Alerts
- Nightly job failures
- Discovery rate below 90%
- Extraction success rate below 98%
- Shopify sync failures
- Email delivery failures

## Future Enhancements

### Phase 2 Features
- **Auto-Relink**: Detect URL redirects and update Shopify metafields
- **Screenshots**: Capture product images for email
- **Operator UI**: Web interface for quarantined changes
- **Mid-Day Scans**: Incremental updates for hot products
- **Performance**: Parallel domain processing

### Optimizations
- **Caching**: Reuse Firecrawl results
- **Incremental**: Only sync changed products
- **Batch Processing**: Larger batch sizes
- **Connection Pooling**: Database optimization

## Testing

### Component Tests
```bash
# Test all components
npm run test:components
```

Tests verify:
- Database connection and schema
- Shopify API access and metafield
- SendGrid email delivery
- URL canonicalization logic

### Manual Testing
```bash
# Run full scrape locally
npm run scrape

# Check results
# - Supabase tables populated
# - Shopify prices updated
# - Email received
```

## Maintenance

### Weekly
- Review reconciliation results
- Monitor extraction success rates
- Check email delivery

### Monthly
- Update product URL mappings
- Check for website layout changes
- Update extraction patterns

### Quarterly
- Review database indexes
- Clean old price history
- Update dependencies

## Documentation

- **[README.md](./README.md)**: Project overview
- **[SETUP.md](./SETUP.md)**: Local development setup
- **[DEPLOYMENT.md](./DEPLOYMENT.md)**: Production deployment
- **[sendgrid-template-example.html](./sendgrid-template-example.html)**: Email template
- **[src/database/schema.sql](./src/database/schema.sql)**: Database schema

## Support Resources

- **Firecrawl Docs**: https://docs.firecrawl.dev
- **Shopify Admin API**: https://shopify.dev/docs/api/admin-graphql
- **SendGrid API**: https://docs.sendgrid.com/api-reference
- **Supabase Docs**: https://supabase.com/docs

## License

ISC

## Version

1.0.0 - Initial Release

---

**Status**: ✅ Complete and ready for deployment

**Last Updated**: 2025-01-XX
