# Setup Guide

Quick start guide for local development and testing.

## Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- Firecrawl API key ([get one here](https://firecrawl.dev))
- Shopify store with custom app access
- SendGrid account (free tier works)

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your favorite editor
```

Required environment variables:

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
SENDGRID_RECIPIENT_EMAILS=you@example.com,admin@example.com

# App Settings
TIMEZONE=Pacific/Auckland
LOG_LEVEL=info
```

### 3. Setup Database

**Option A: Automated Migration**

```bash
npm run db:migrate
```

**Option B: Manual Migration**

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy contents of `src/database/schema.sql`
4. Paste and execute

### 4. Build Project

```bash
npm run build
```

## Getting API Keys

### Firecrawl API Key

1. Go to [firecrawl.dev](https://firecrawl.dev)
2. Sign up for free account
3. Navigate to API Keys section
4. Copy your API key

### Shopify Admin Access Token

1. Shopify Admin → Settings → Apps and sales channels
2. Click "Develop apps"
3. Create new app
4. Configure Admin API scopes:
   - `read_products`
   - `write_products`
   - `read_product_listings`
5. Install app to your store
6. Copy "Admin API access token"

### SendGrid API Key

1. Go to [sendgrid.com](https://sendgrid.com)
2. Sign up for free account
3. Settings → API Keys
4. Create new API key with "Full Access"
5. Copy key (shown only once!)

## Initial Configuration

### 1. Verify Shopify Metafield

Run this test to verify `source_url` metafield exists:

```bash
npm run dev -- --verify-metafield
```

If it doesn't exist, create it:
1. Shopify Admin → Settings → Custom data → Products
2. Add definition: `custom.source_url` (type: Single line text, filterable)

### 2. Link Shopify Products

For each product you want to sync:
1. Edit product in Shopify Admin
2. Scroll to "Metafields" section
3. Add `custom.source_url` metafield
4. Value: Canonical supplier URL
   - Example: `https://hondaoutdoors.co.nz/products/lawn-mower-xyz`
   - Must match exactly (case-sensitive)

### 3. Create SendGrid Template

See `sendgrid-template-example.html` for a complete template.

Quick setup:
1. SendGrid Dashboard → Email API → Dynamic Templates
2. Create new template
3. Name it "Nightly Price Digest"
4. Copy template ID (e.g., `d-xxxxx`)
5. Add to `.env` as `SENDGRID_DIGEST_TEMPLATE_ID`

### 4. Verify Sender Email

1. SendGrid → Settings → Sender Authentication
2. Add and verify your `SENDGRID_FROM_EMAIL` address

## Running Locally

### Manual Scrape

Run a complete scrape cycle:

```bash
npm run scrape
```

This will:
1. Discover products on all active domains
2. Scrape prices and offers
3. Store in database
4. Sync to Shopify
5. Run reconciliation
6. Send email digest

### Development Mode

Run with hot reload:

```bash
npm run dev
```

### Run Specific Components

```typescript
// Test scraper only
import { scraperOrchestrator } from './src/scraper/scraper-orchestrator.js';
await scraperOrchestrator.runFullScrape();

// Test Shopify sync only
import { syncPricesToShopify } from './src/shopify/price-sync.js';
await syncPricesToShopify(['https://...']);

// Test email only
import { sendgridClient } from './src/email/sendgrid-client.js';
await sendgridClient.sendAlertEmail('Test', 'Testing email integration');
```

## Testing

### Unit Tests

```bash
npm test
```

### Test with Sample Data

```bash
# Test price extraction
npm run test:extraction

# Test Shopify sync
npm run test:shopify

# Test email generation
npm run test:email
```

## Debugging

### Enable Debug Logging

```env
LOG_LEVEL=debug
```

### Common Issues

**"Failed to fetch active domains"**
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct
- Check database migrations ran successfully

**"Firecrawl API rate limit"**
- Upgrade Firecrawl plan or reduce scrape frequency
- Check rate limits in Firecrawl dashboard

**"No Shopify product found for source URL"**
- Verify product has `custom.source_url` metafield set
- URL must match exactly (canonical form)
- Check metafield is filterable

**"Email not sent"**
- Verify `SENDGRID_API_KEY` is valid
- Check sender email is verified
- Template ID must be correct

## Database Queries

Useful queries for debugging:

```sql
-- View all domains
SELECT * FROM domains;

-- View recent products
SELECT * FROM product_pages ORDER BY last_seen_at DESC LIMIT 10;

-- View price history
SELECT * FROM price_history ORDER BY scraped_at DESC LIMIT 10;

-- View recent offers
SELECT * FROM offers ORDER BY last_seen_at DESC LIMIT 10;

-- View Shopify catalog
SELECT * FROM shopify_catalog_cache ORDER BY last_synced_at DESC LIMIT 10;

-- View reconciliation results
SELECT * FROM reconcile_results ORDER BY detected_at DESC LIMIT 10;
```

## Performance Tips

### Speed Up Development

1. **Reduce scrape scope**: Edit `domains` table to disable domains temporarily
2. **Use cached results**: Comment out scraping, use existing database data
3. **Skip email**: Comment out email sending during testing
4. **Increase rate limits**: Add delays between requests

### Optimize Production

1. **Enable caching**: Reuse Firecrawl results when possible
2. **Batch operations**: Group Shopify updates
3. **Parallel processing**: Scrape domains concurrently
4. **Incremental updates**: Only sync changed products

## Next Steps

1. Run manual scrape to test end-to-end: `npm run scrape`
2. Review results in Supabase tables
3. Check Shopify products updated
4. Verify email received
5. Deploy to production (see `DEPLOYMENT.md`)

## Support Resources

- **Firecrawl Docs**: https://docs.firecrawl.dev
- **Shopify Admin API**: https://shopify.dev/docs/api/admin-graphql
- **SendGrid API**: https://docs.sendgrid.com/api-reference
- **Supabase Docs**: https://supabase.com/docs

## Troubleshooting Checklist

- [ ] Node.js 18+ installed
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` configured with all keys
- [ ] Database migrations completed
- [ ] Domains seeded in database
- [ ] Shopify metafield created and filterable
- [ ] Products linked with `source_url` metafield
- [ ] SendGrid template created
- [ ] Sender email verified
- [ ] Manual test run successful

Need help? Check the logs in console output and Supabase dashboard.
