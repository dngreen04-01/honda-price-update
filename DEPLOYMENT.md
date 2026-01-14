# Deployment Guide

This guide covers deploying the Honda Supplier Price Scraper to production using Supabase Edge Functions.

## Prerequisites

- Supabase project (free or paid tier)
- Node.js 18+ installed locally
- Python 3.10+ installed locally (for Scrapling service)
- Supabase CLI installed (`npm install -g supabase`)
- API keys for Shopify and SendGrid

## Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and service role key

### 1.2 Run Database Migrations

**Option A: Manual (Recommended)**

1. Copy contents of `src/database/schema.sql`
2. Go to Supabase Dashboard → SQL Editor
3. Paste and execute the SQL

**Option B: Automated**

```bash
# Configure environment first
cp .env.example .env
# Edit .env with your credentials

# Run migration script
npm run db:migrate
```

### 1.3 Verify Tables

In Supabase Dashboard → Table Editor, verify these tables exist:
- `domains`
- `product_pages`
- `price_history`
- `offers`
- `shopify_catalog_cache`
- `reconcile_results`

### 1.4 Configure Supabase Vault (Secrets)

Store API keys securely in Supabase Vault:

```sql
-- Go to SQL Editor and run:
INSERT INTO vault.secrets (name, secret) VALUES
  ('SHOPIFY_ADMIN_ACCESS_TOKEN', 'shpat_xxxxx'),
  ('SENDGRID_API_KEY', 'SG.xxxxx'),
  ('SCRAPLING_SERVICE_URL', 'http://your-scrapling-service:8002');
```

## Step 2: Shopify Configuration

### 2.1 Create Custom App

1. Shopify Admin → Settings → Apps and sales channels
2. Develop apps → Create an app
3. Configure Admin API scopes:
   - `read_products`
   - `write_products`
   - `read_product_listings`
4. Install app and copy Admin API access token

### 2.2 Create source_url Metafield

1. Shopify Admin → Settings → Custom data → Products
2. Add definition:
   - **Namespace**: `custom`
   - **Key**: `source_url`
   - **Type**: Single line text
   - **Filterable**: ✅ Enable

### 2.3 Link Products

For each product in Shopify, add metafield:
- **Key**: `custom.source_url`
- **Value**: Canonical supplier URL (e.g., `https://hondaoutdoors.co.nz/products/lawn-mower-xyz`)

## Step 3: SendGrid Configuration

### 3.1 Create Dynamic Template

1. SendGrid Dashboard → Email API → Dynamic Templates
2. Create new template
3. Add version with design editor
4. Use these template variables:

```handlebars
<!-- Template structure -->
<h1>Nightly Price Update - {{date}}</h1>

{{#if hasPriceChanges}}
<h2>Price Changes ({{priceChanges.length}})</h2>
<table>
  <tr><th>Product</th><th>Old Price</th><th>New Price</th><th>Change</th></tr>
  {{#each priceChanges}}
  <tr>
    <td><a href="{{productUrl}}">Product</a></td>
    <td>${{oldSalePrice}}</td>
    <td>${{newSalePrice}}</td>
    <td {{#if isDecrease}}style="color:green"{{/if}}{{#if isIncrease}}style="color:red"{{/if}}>
      {{changePercent}}%
    </td>
  </tr>
  {{/each}}
</table>
{{/if}}

{{#if hasNewOffers}}
<h2>New Offers ({{newOffers.length}})</h2>
{{#each newOffers}}
<div>
  <h3>{{title}}</h3>
  <p>{{summary}}</p>
  <p>Dates: {{startDate}} - {{endDate}}</p>
  <a href="{{offerUrl}}">View Offer</a>
</div>
{{/each}}
{{/if}}

{{#if hasSupplierOnlyProducts}}
<h2>Supplier-Only Products ({{supplierOnlyProducts.length}})</h2>
<p>Products found on supplier but not in Shopify</p>
{{/if}}

{{#if hasShopifyOnlyProducts}}
<h2>Shopify-Only Products ({{shopifyOnlyProducts.length}})</h2>
<p>Products in Shopify but not found on supplier</p>
{{/if}}

<h2>Statistics</h2>
<ul>
  <li>Products Scraped: {{stats.totalProductsScraped}}</li>
  <li>Successful Extractions: {{stats.successfulExtractions}}</li>
  <li>Success Rate: {{stats.extractionSuccessRate}}%</li>
  <li>Shopify Synced: {{stats.shopifySynced}}</li>
</ul>
```

4. Note the Template ID (e.g., `d-xxxxx`)

### 3.2 Verify Sender Email

1. SendGrid → Settings → Sender Authentication
2. Verify your from email address

## Step 4: Deploy Scrapling Service

The Scrapling Python service must be running and accessible for the scraper to work.

### 4.1 Local Development

For local development, run the Scrapling service on your machine:

```bash
cd python-scraper
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8002
```

### 4.2 Production Deployment Options

**Option A: Docker Container**

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY python-scraper/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium
RUN playwright install-deps

COPY python-scraper/server.py .
EXPOSE 8002
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8002"]
```

**Option B: Cloud Run / Railway / Render**

Deploy the `python-scraper/` directory as a Python web service with:
- Build command: `pip install -r requirements.txt && playwright install chromium && playwright install-deps`
- Start command: `uvicorn server:app --host 0.0.0.0 --port 8002`
- Health check endpoint: `GET /health`

### 4.3 Verify Deployment

```bash
curl https://your-scrapling-service.example.com/health
# Should return: {"status":"ok"}
```

## Step 5: Deploy Edge Function

### 5.1 Initialize Supabase Functions

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Initialize functions directory
supabase functions new nightly-scraper-job
```

### 5.2 Copy Application Code

```bash
# Copy source files to function
cp -r src/* supabase/functions/nightly-scraper-job/
cp package.json supabase/functions/nightly-scraper-job/
```

### 5.3 Create Function Entry Point

Edit `supabase/functions/nightly-scraper-job/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runNightlyJob } from './index.js';

serve(async (req) => {
  try {
    await runNightlyJob();

    return new Response(
      JSON.stringify({ success: true, message: 'Nightly job completed' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### 5.4 Deploy Function

```bash
# Deploy to Supabase
supabase functions deploy nightly-scraper-job

# Set secrets
supabase secrets set SCRAPLING_SERVICE_URL=http://your-scrapling-service:8002
supabase secrets set SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
supabase secrets set SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx
supabase secrets set SENDGRID_API_KEY=SG.xxxxx
supabase secrets set SENDGRID_FROM_EMAIL=notifications@yourdomain.com
supabase secrets set SENDGRID_DIGEST_TEMPLATE_ID=d-xxxxx
supabase secrets set SENDGRID_RECIPIENT_EMAILS=admin@yourdomain.com
```

## Step 6: Schedule Cron Job

### 6.1 Enable pg_cron Extension

```sql
-- In Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### 6.2 Create Scheduled Job

```sql
-- Schedule for 02:00 NZT (adjust timezone as needed)
-- NZT is UTC+12 (or UTC+13 during daylight saving)
SELECT cron.schedule(
  'nightly-scraper-job',
  '0 14 * * *', -- 14:00 UTC = 02:00 NZT (UTC+12)
  $$
  SELECT
    net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/nightly-scraper-job',
      headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**Note**: Adjust cron schedule based on daylight saving time:
- Standard time (UTC+12): `0 14 * * *` (14:00 UTC)
- Daylight saving (UTC+13): `0 13 * * *` (13:00 UTC)

### 6.3 Verify Cron Job

```sql
-- List all scheduled jobs
SELECT * FROM cron.job;

-- View job run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## Step 7: Testing

### 7.1 Manual Test Run

```bash
# Test locally first
npm run scrape

# Test deployed function
curl -X POST https://your-project-ref.supabase.co/functions/v1/nightly-scraper-job \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### 7.2 Verify Results

1. Check Supabase Table Editor for data in tables
2. Check Shopify products for updated prices
3. Verify email received in inbox
4. Check Supabase Logs for function execution

## Step 8: Monitoring

### 8.1 Supabase Logs

- Dashboard → Functions → nightly-scraper-job → Logs
- Monitor execution time, errors, and output

### 8.2 SendGrid Delivery

- SendGrid Dashboard → Activity
- Monitor email delivery status

### 8.3 Shopify Sync

- Check Shopify product prices match supplier
- Review `shopify_catalog_cache` table

### 8.4 Alerts

Set up alerts for:
- Function failures (via Supabase alerts)
- Email delivery failures (via SendGrid webhooks)
- Scrapling service health (monitor /health endpoint)
- Extraction success rate below 98%

## Troubleshooting

### Migration Failed

**Solution**: Run SQL manually in Supabase SQL Editor from `src/database/schema.sql`

### Function Timeout

**Solution**: Increase function timeout in Supabase dashboard or split into multiple smaller functions

### Rate Limiting

**Solution**: Adjust delays in scraper orchestrator or increase concurrency limits in Scrapling service

### Email Not Received

**Check**:
1. SendGrid API key valid
2. From email verified
3. Template ID correct
4. Recipients email list correct

### Shopify Sync Failed

**Check**:
1. Admin API access token valid
2. API scopes include `write_products`
3. `source_url` metafield exists and is filterable
4. Product metafield values match canonical URLs

## Production Checklist

- [ ] Database migrations completed
- [ ] All tables exist and indexed
- [ ] Supabase Vault secrets configured
- [ ] Scrapling service deployed and healthy
- [ ] Shopify custom app created with correct scopes
- [ ] `source_url` metafield created and filterable
- [ ] Products linked with supplier URLs
- [ ] SendGrid template created and tested
- [ ] Sender email verified
- [ ] Edge function deployed
- [ ] Environment secrets set (including SCRAPLING_SERVICE_URL)
- [ ] Cron job scheduled
- [ ] Manual test run successful
- [ ] Email digest received
- [ ] Shopify prices updated correctly
- [ ] Monitoring and alerts configured

## Maintenance

### Weekly
- Review reconciliation results
- Check extraction success rates
- Monitor email delivery

### Monthly
- Review and update product URL mappings
- Check for website layout changes
- Update extraction patterns if needed

### Quarterly
- Review and optimize database indexes
- Clean up old price history (optional)
- Update dependencies

## Support

For issues:
1. Check Supabase function logs
2. Review database tables for data
3. Verify API keys and credentials
4. Check supplier website for layout changes
5. Review error logs in email digests
