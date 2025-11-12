# Troubleshooting Guide

Common errors and how to fix them.

## Firecrawl API Errors

### 402 Payment Required - API Credits Exhausted

**Error Message:**
```
[ERROR] Firecrawl API credits exhausted
Payment Required - Please add credits to your Firecrawl account
```

**Cause:** Your Firecrawl API account has run out of credits.

**Solution:**
1. Log in to your Firecrawl account at https://firecrawl.dev
2. Check your current credit balance
3. Add more credits to your account
4. Verify your API key is correct in `.env`:
   ```
   FIRECRAWL_API_KEY=your_api_key_here
   ```

**Workaround:** If you need to test without Firecrawl credits, you can:
- Use mock data for testing
- Temporarily disable specific domains in the database
- Set up a local scraping solution

### 429 Too Many Requests - Rate Limit

**Error Message:**
```
[ERROR] Firecrawl API rate limit exceeded
Too Many Requests - Please wait before retrying
```

**Cause:** You've exceeded the Firecrawl API rate limit.

**Solution:**
1. Wait before retrying (typically 60 seconds)
2. Review your Firecrawl plan limits
3. Consider upgrading your Firecrawl plan for higher rate limits
4. Implement retry logic with exponential backoff (planned feature)

## Shopify API Errors

### Deprecation Warnings (Fixed)

**Old Warning:**
```
[shopify-api/WARNING] [Deprecated | 12.0.0] The query method is deprecated
```

**Status:** ✅ **FIXED** - All `.query()` calls have been replaced with `.request()`

If you still see this warning:
1. Rebuild the project: `npm run build`
2. Restart the scheduler
3. Check for any custom Shopify code that may still use `.query()`

### Invalid Access Token

**Error Message:**
```
[ERROR] Failed to fetch Shopify products
Unauthorized
```

**Solution:**
1. Verify your Shopify access token in `.env`:
   ```
   SHOPIFY_ADMIN_ACCESS_TOKEN=your_token_here
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   ```
2. Ensure the access token has the required scopes:
   - `read_products`
   - `write_products`
   - `read_product_listings`
   - `write_product_listings`

### Rate Limiting

**Error Message:**
```
[ERROR] Shopify API rate limit exceeded
```

**Solution:**
- The system already implements 500ms delays between product updates
- If you still hit rate limits, consider:
  - Upgrading your Shopify plan
  - Reducing the number of products synced per run
  - Increasing the scheduler interval

## Database Errors

### Connection Failed

**Error Message:**
```
[ERROR] Failed to fetch active domains
Connection refused
```

**Solution:**
1. Verify Supabase credentials in `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your_service_key_here
   ```
2. Check if Supabase project is active
3. Verify network connectivity

### Missing Tables

**Error Message:**
```
[ERROR] relation "domains" does not exist
```

**Solution:**
Run the database migrations:
```bash
npm run db:migrate
```

## Scheduler Issues

### Scheduler Exits Immediately

**Symptoms:** Scheduler starts but exits right away

**Solution:**
1. Ensure you're using the correct mode flag:
   ```bash
   npm run dev:scheduler
   # OR
   npx tsx src/index.ts --mode=scheduler
   ```
2. Check for syntax errors:
   ```bash
   npm run build
   ```

### Job Not Running

**Symptoms:** Scheduler is running but job never executes

**Solution:**
1. Check the schedule in logs - look for "nextRun" timestamp
2. Verify timezone settings (default: Europe/London)
3. Use `--run-now` flag to test immediately:
   ```bash
   npm run dev:scheduler:now
   ```

### Job Keeps Running Forever

**Symptoms:** Job starts but never completes

**Possible Causes:**
- Firecrawl timeout (long crawl operations)
- Network issues
- Large number of products

**Solution:**
1. Check logs for which step is hanging
2. Consider reducing the number of domains
3. Add timeouts to long-running operations (planned feature)

## Email Errors

### SendGrid Failure

**Error Message:**
```
[ERROR] Failed to send email digest
```

**Solution:**
1. Verify SendGrid API key in `.env`:
   ```
   SENDGRID_API_KEY=your_key_here
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   SENDGRID_RECIPIENT_EMAILS=admin@yourdomain.com
   ```
2. Check SendGrid account status
3. Verify sender email is verified in SendGrid
4. Check email template ID is correct

## General Debugging

### Enable Verbose Logging

Set log level to debug in `.env`:
```
LOG_LEVEL=debug
```

### Check Running Processes

```bash
# Find the scheduler process
ps aux | grep "tsx.*scheduler"

# Kill a stuck process
pkill -f "tsx.*scheduler"
```

### View Real-Time Logs

```bash
# With npm scripts
npm run dev:scheduler:now

# Direct execution
npx tsx src/index.ts --mode=scheduler --run-now 2>&1 | tee scraper.log
```

### Test Individual Components

```bash
# Test Shopify connection
npm run verify:shopify

# Test database connection
npm run test:components

# Refresh Shopify catalog only
npm run shopify:refresh
```

## Getting Help

If you encounter an error not covered here:

1. **Check the logs** for the full error message and stack trace
2. **Search the codebase** for similar error handling
3. **Review the README.md** for setup instructions
4. **Check service status**:
   - Firecrawl: https://status.firecrawl.dev
   - Shopify: https://status.shopify.com
   - Supabase: https://status.supabase.com

## Common Solutions Checklist

Before debugging, verify:
- [ ] All environment variables are set correctly in `.env`
- [ ] Dependencies are installed: `npm install`
- [ ] Database migrations are run: `npm run db:migrate`
- [ ] API keys are valid and have sufficient credits/permissions
- [ ] Network connectivity is working
- [ ] Node.js version is compatible (v18+ recommended)
