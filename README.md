# Honda Supplier Price Scraper

Automated supplier website price and offer scraper with Shopify sync and email notifications.

## Features

- **Automated Nightly Scraping**: Crawls Honda NZ supplier websites (02:00 NZT)
- **Price Extraction**: Deterministic parsing + LLM fallback for high accuracy
- **Shopify Integration**: Syncs prices via GraphQL Admin API
- **Historical Tracking**: Maintains price history in Supabase
- **Offer Detection**: Tracks promotional offers and dates
- **Email Digests**: Comprehensive nightly summaries with CSV attachments
- **Reconciliation**: Detects supplier-only and Shopify-only products

## Tech Stack

- **Backend**: Node.js + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Scraping**: Firecrawl v2 API
- **E-commerce**: Shopify GraphQL Admin API
- **Email**: SendGrid v3 API
- **Orchestration**: Supabase Edge Functions + Cron

## Project Structure

```
src/
├── scraper/          # Firecrawl integration & price extraction
├── database/         # Supabase client & queries
├── shopify/          # Shopify GraphQL client & sync logic
├── email/            # SendGrid integration & templates
├── scripts/          # Standalone scripts for testing, verification, etc.
├── utils/            # URL canonicalization, logging, etc.
├── types/            # TypeScript type definitions
└── index.ts          # Main orchestration entry point
```

## Setup

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Run database migrations**:

   **Manual migration required** - The automated script cannot execute DDL via Supabase client.

   See **[MANUAL_MIGRATION.md](./MANUAL_MIGRATION.md)** for step-by-step instructions.

   Quick steps:
   - Go to Supabase SQL Editor
   - Copy contents of `src/database/schema.sql`
   - Execute the SQL
   - Verify tables were created

4. **Build the project**:
   ```bash
   npm run build
   ```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build the project for production
npm run build

# Start the production build
npm run start

# Run manual scrape
npm run scrape

# Run tests
npm test

# Run tests with coverage
npm test:coverage

# Run component tests
npm run test:components

# Verify Shopify integration
npm run verify:shopify

# Lint the codebase
npm run lint

# Format the codebase
npm run format

# Run database migrations
npm run db:migrate
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment instructions.

## Configuration

### Supplier Domains

Configured in `domains` table:
- https://www.hondaoutdoors.co.nz/
- https://www.hondamarine.co.nz/
- https://www.hondamotorbikes.co.nz/

### Shopify Metafield

Products must have `custom.source_url` metafield set to supplier URL for sync to work.

## Acceptance Criteria

- ✅ ≥90% product discovery rate
- ✅ ≥98% deterministic price extraction success
- ✅ 100% Shopify sync accuracy for matched products
- ✅ 2xx SendGrid delivery

## Monitoring

Key metrics tracked:
- Product discovery rate
- Extraction success rate
- Shopify sync accuracy
- Email delivery status

## License

ISC
