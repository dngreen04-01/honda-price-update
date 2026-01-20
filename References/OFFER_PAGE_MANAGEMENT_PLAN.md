# Shopify Offer Page Management System

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

Reference: This document is maintained in accordance with PLANS.md at `/Users/Development/Honda Price Update/References/Plans.md`.

## Purpose / Big Picture

After this change, users can transform supplier promotional offers (discovered by the crawler) into fully-functional Shopify offer pages with a few clicks. The system will:

1. **Scrape offer details** from supplier pages (hero images, promotional text, terms, end dates)
2. **Create individual offer pages** in Shopify with branded content generated via Gemini AI
3. **Maintain an offers landing page** with tiles linking to each active offer
4. **Automatically hide expired offers** based on end dates
5. **Link products on deal** to the offer page for cross-selling (using Shopify product images from our catalog)

**User workflow**: Navigate to the Offers tab in Discoveries → Select an offer discovered by crawler → Choose products on deal from database → Set end date → Click "Push to Shopify" → System creates the offer page and updates the landing page tile.

**Verification**: After implementation, navigate to the frontend Discoveries page, select an offer, link products, push to Shopify. The offer page should be visible at `https://[store].myshopify.com/pages/[offer-handle]` and a tile should appear on the offers landing page.

## Progress

- [x] Milestone 1: Database Schema & Types (2026-01-19)
- [x] Milestone 2: Offer Page Scraper (2026-01-19)
- [x] Milestone 3: Shopify Page Service (2026-01-19)
- [x] Milestone 4: Offer Landing Page Manager (2026-01-19)
- [x] Milestone 5: Offer Push API & Workflow (2026-01-19)
- [x] Milestone 6: Expiration Service (2026-01-19)
- [x] Milestone 7: Frontend Offer Management UI (2026-01-19)

## Surprises & Discoveries

- **Milestone 6**: Database queries (`getExpiredActiveOfferPages`, `getExpiringOffers`) were already implemented in Milestone 1, reducing work scope for this milestone.
- **Milestone 7**: Fixed pre-existing TypeScript errors in `AuthContext.tsx` (type narrowing issues with Supabase query results) during frontend build verification.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-19 | Use Shopify Pages API rather than blog posts | Pages are simpler, don't require blog setup, and match the supplier's offer page structure |
| 2026-01-19 | Store offer-product links in separate table | Allows many-to-many relationship and independent lifecycle from offers table |
| 2026-01-19 | Generate landing page HTML dynamically | Avoids Shopify theme modifications; landing page is a standard page with generated tile HTML |
| 2026-01-19 | Use existing Scrapling client for offer scraping | Consistent with product scraping, handles JS rendering and bot protection |
| 2026-01-19 | Use Gemini `gemini-3-flash-preview` for text/HTML | User-specified model for content generation |
| 2026-01-19 | Use Gemini `gemini-3-pro-image-preview` for images | User-specified model for any image generation needs |
| 2026-01-19 | Use Shopify product images in offer page product grid | Products linked to offers display using images already in our Shopify catalog (from shopify_catalog_cache) |
| 2026-01-19 | Upload offer hero images to Shopify Files | More reliable than embedding supplier URLs; uses existing staged upload infrastructure |
| 2026-01-19 | Unpublish (not delete) expired offer pages | Allows recovery if offer is extended; keeps historical record |
| 2026-01-19 | Landing page at `/pages/offers` | Standard Shopify page URL structure |

## Outcomes & Retrospective

**Milestone 7 Completed (2026-01-19)**:
- Extended `Discoveries.tsx` with full offer management UI
- Added slide-out panel for offer details, product linking, and Shopify push
- Implemented product selector with multi-select and thumbnail display
- Added status badges (pending, active, hidden, expired) to offer cards
- Added expiring soon warnings (7-day threshold) with visual indicators
- Integrated with all existing API endpoints for offers
- Fixed pre-existing TypeScript issues in `AuthContext.tsx`
- Both backend and frontend build successfully

## Context and Orientation

This project extends an existing Honda supplier price tracking system. The codebase structure:

- **`/src/shopify/client.ts`**: Shopify GraphQL client with product CRUD operations. Currently lacks page management.
- **`/src/shopify/push-to-shopify.ts`**: Workflow for creating products from discovered items. Pattern to follow for offers.
- **`/src/crawler/`**: Web crawler that discovers offer pages via URL pattern `/offers/`. Stores basic metadata in `offers` table.
- **`/src/scraper/`**: Product scrapers with domain-specific selectors. Pattern to follow for offer content extraction.
- **`/src/database/queries.ts`**: Supabase query functions. Contains offer CRUD (`upsertDiscoveredOffer`, `getRecentOffers`).
- **`/frontend/src/pages/Dashboard/Discoveries.tsx`**: React page showing discovered products/offers. Has push-to-Shopify pattern to extend.

**Key existing tables**:
- `offers`: `id, domain_id, title, summary, start_date, end_date, offer_url, last_seen_at`
- `shopify_catalog_cache`: Tracks products synced to Shopify with `source_url_canonical`, includes Shopify product images
- `domains`: Supplier domains (hondamotorbikes.co.nz, hondamarine.co.nz, hondaoutdoors.co.nz)

**Shopify API**: Uses GraphQL Admin API via `@shopify/shopify-api` package. Page mutations require `write_content` or `write_online_store_pages` scope.

**Gemini AI Configuration**:
- **Text/HTML Generation**: Use model `gemini-3-flash-preview` via `@google/generative-ai` package
- **Image Generation**: Use model `gemini-3-pro-image-preview` if generating promotional graphics
- Already integrated in `/src/shopify/specifications-formatter.ts` - update model name

**Product Images in Offers**: When products are linked to an offer, the offer page displays them using their **Shopify product images** (already uploaded when the product was pushed to Shopify). These images are referenced from `shopify_catalog_cache` or fetched via Shopify GraphQL API using the product ID.

---

## Milestone 1: Database Schema & Types

### Goal

Create the database schema and TypeScript types needed to track Shopify offer pages and link offers to products. At the end, the database can store which offers have been pushed to Shopify, their page IDs, and which products are associated with each offer.

### Prerequisites

- Database access to Supabase
- Ability to run SQL migrations
- No prior milestones required

### Context for This Milestone

**New tables to create**:

1. **`shopify_offer_pages`**: Tracks offer pages created in Shopify
   - `id` (serial primary key)
   - `offer_id` (integer, FK to offers.id, UNIQUE)
   - `shopify_page_id` (text, Shopify GID)
   - `shopify_page_handle` (text, URL slug)
   - `hero_image_shopify_url` (text, uploaded hero image URL)
   - `status` ('active' | 'hidden' | 'deleted')
   - `landing_tile_html` (text, cached tile HTML for landing page)
   - `created_at`, `updated_at` (timestamps)

2. **`offer_product_links`**: Links offers to products on deal
   - `id` (serial primary key)
   - `offer_id` (integer, FK to offers.id)
   - `product_id` (integer, FK to shopify_catalog_cache.id)
   - `created_at` (timestamp)
   - UNIQUE constraint on (offer_id, product_id)

**Files to modify**:
- Create `/migrations/010_add_offer_pages.sql`
- `/src/types/index.ts` - Add TypeScript interfaces
- `/frontend/src/types/database.ts` - Mirror types for frontend
- `/src/database/queries.ts` - Add CRUD functions

### Work

1. **Create migration file** at `/migrations/010_add_offer_pages.sql`:
   - Create `shopify_offer_pages` table with columns listed above
   - Create `offer_product_links` table with composite unique constraint on (offer_id, product_id)
   - Add indexes on `offer_id`, `status`, `shopify_page_id`
   - Add foreign key constraints with ON DELETE CASCADE

2. **Update `/src/types/index.ts`**:
   - Add `ShopifyOfferPage` interface matching table structure
   - Add `OfferProductLink` interface
   - Add `OfferPageStatus` type literal ('active' | 'hidden' | 'deleted')
   - Add `OfferWithProducts` interface combining Offer with linked products

3. **Update `/frontend/src/types/database.ts`**:
   - Mirror the same interfaces for frontend use

4. **Update `/src/database/queries.ts`**:
   - Add `createShopifyOfferPage(offerId, shopifyPageId, handle, heroImageUrl, tileHtml)` function
   - Add `updateShopifyOfferPageStatus(id, status)` function
   - Add `getShopifyOfferPageByOfferId(offerId)` function
   - Add `getActiveShopifyOfferPages()` function
   - Add `linkProductToOffer(offerId, productId)` function
   - Add `unlinkProductFromOffer(offerId, productId)` function
   - Add `getProductsForOffer(offerId)` function returning ShopifyCatalogCache entries with Shopify product info
   - Add `getOffersForProduct(productId)` function

### Commands and Verification

```bash
# Run migration in Supabase SQL Editor or via CLI
# Then verify tables exist:
cd /Users/Development/Honda\ Price\ Update

# TypeScript compilation check
npm run build

# Verify no type errors
echo $?  # Should be 0
```

Verify in Supabase dashboard that tables `shopify_offer_pages` and `offer_product_links` exist with correct columns.

### Completion Criteria

- Migration runs without errors
- `npm run build` succeeds with no type errors
- New query functions are callable (verified by importing in a test file or via TypeScript)
- Tables visible in Supabase dashboard

Upon completion: Update Progress section, commit with message "feat: Add database schema for offer pages and product links".

---

## Milestone 2: Offer Page Scraper

### Goal

Create a scraper that extracts detailed content from supplier offer pages, including hero images, promotional body content, terms and conditions, and any linked product URLs. This provides the raw material for generating Shopify offer pages.

### Prerequisites

- Milestone 1 complete (types available)
- Scrapling service running (existing infrastructure)

### Context for This Milestone

**Existing scraper pattern** (from `/src/scraper/bike-product-scraper.ts`):
- Uses Scrapling client at `http://localhost:3002/scrape`
- Selectors defined in separate file (`bike-product-selectors.ts`)
- Returns structured data with images, text content, specifications

**Offer page structure** (based on Honda sites):
- Hero banner image (large promotional image)
- Headline/title (h1)
- Body content (promotional description HTML)
- Terms and conditions (fine print, often in accordion or footer)
- End date (text like "Offer ends 31/03/2026")
- Featured products section (links to products on deal)
- Call-to-action button/link

**Files to create**:
- `/src/scraper/offer-page-scraper.ts` - Main scraper class
- `/src/scraper/offer-page-selectors.ts` - CSS selectors for offer content

### Work

1. **Create `/src/scraper/offer-page-selectors.ts`**:
   ```typescript
   // Define selectors for offer page elements
   // Hero image: .offer-hero, .promo-banner, .hero-image picture source
   // Title: h1, .offer-title, .promo-heading
   // Body: .offer-content, .promo-body, .offer-description
   // Terms: .terms, .conditions, .fine-print, .disclaimer
   // End date: Text patterns "ends", "valid until", "expires"
   // Product links: Links containing product SKU patterns
   ```

   Define domain-specific selectors for each Honda site:
   - hondamotorbikes.co.nz: Uses Magento PageBuilder classes
   - hondamarine.co.nz: Similar Magento structure
   - hondaoutdoors.co.nz: May have slight variations

2. **Create `/src/scraper/offer-page-scraper.ts`**:
   - Export `OfferPageScraper` class with constructor taking Scrapling client
   - Method `scrapeOfferPage(url: string): Promise<ScrapedOfferContent>`
   - Extract hero image URL (highest resolution from srcset)
   - Extract title from h1 or og:title
   - Extract body HTML (clean up, preserve structure)
   - Extract terms text
   - Parse end date using existing `extractOfferDates` from link-extractor.ts
   - Extract product URLs (filter for product page patterns)

   Return type `ScrapedOfferContent`:
   ```typescript
   interface ScrapedOfferContent {
     heroImageUrl: string | null;
     title: string;
     bodyHtml: string;
     termsText: string | null;
     endDate: Date | null;
     startDate: Date | null;
     productUrls: string[];
     sourceUrl: string;
   }
   ```

3. **Add type to `/src/types/index.ts`**:
   - Add `ScrapedOfferContent` interface

### Commands and Verification

```bash
cd /Users/Development/Honda\ Price\ Update

# Build to check types
npm run build

# Manual test (create temporary test script):
# node -e "
#   import { OfferPageScraper } from './dist/scraper/offer-page-scraper.js';
#   const scraper = new OfferPageScraper();
#   scraper.scrapeOfferPage('https://www.hondamotorbikes.co.nz/offers/transalp-bonus-tour-pack')
#     .then(console.log);
# "
```

Test with a known offer URL. Verify output contains hero image, title, body HTML, and extracted dates.

### Completion Criteria

- `npm run build` succeeds
- Scraper can fetch and parse at least one Honda offer page
- Returns structured `ScrapedOfferContent` with non-null hero image and title
- Product URLs extracted (if any exist on the page)

Upon completion: Update Progress section, commit with message "feat: Add offer page scraper with Honda selectors".

---

## Milestone 3: Shopify Page Service

### Goal

Extend the Shopify client with page management capabilities (create, update, delete, publish/unpublish). Create a builder that transforms scraped offer content into Shopify page HTML using Gemini AI for enhancement.

### Prerequisites

- Milestone 1 complete (types)
- Milestone 2 complete (scraper provides content)
- Shopify store has `write_content` or `write_online_store_pages` scope

### Context for This Milestone

**Shopify Page API** (GraphQL Admin API 2025-07):
- `pageCreate` mutation: Creates page with `title`, `bodyHtml`, `handle`, `templateSuffix`, `metafields`, `isPublished`
- `pageUpdate` mutation: Updates existing page by ID
- `pageDelete` mutation: Deletes page by ID
- Pages can be published/unpublished via `isPublished` field

**Existing Shopify client** (`/src/shopify/client.ts`):
- Constructor creates authenticated session
- Uses `this.shopify.clients.graphql()` for queries
- Has `uploadFile()` method for images via staged uploads

**Gemini AI Configuration**:
- **Model for text/HTML**: `gemini-3-flash-preview`
- **Model for images**: `gemini-3-pro-image-preview`
- Update `/src/shopify/specifications-formatter.ts` model reference
- Prompt-based HTML generation with fallback

**Product Images**: When building the offer page product grid, use Shopify product images from `shopify_catalog_cache`. Query the Shopify product by ID to get the featured image URL, or use the image URL stored during product creation.

**Files to modify/create**:
- `/src/shopify/client.ts` - Add page mutations
- `/src/shopify/offer-page-builder.ts` - New file for HTML generation
- `/src/utils/config.ts` - Add Gemini model config

### Work

1. **Update `/src/utils/config.ts`** with Gemini model configuration:
   ```typescript
   gemini: {
     apiKey: process.env.GEMINI_API_KEY || '',
     textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview',
     imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview',
   }
   ```

2. **Extend `/src/shopify/client.ts`** with page methods:

   Add `createPage(input)` method:
   ```typescript
   async createPage(input: {
     title: string;
     bodyHtml: string;
     handle?: string;
     templateSuffix?: string;
     isPublished?: boolean;
   }): Promise<{ pageId: string; handle: string } | null>
   ```
   Uses `pageCreate` mutation, returns page GID and handle.

   Add `updatePage(id, input)` method:
   ```typescript
   async updatePage(id: string, input: {
     title?: string;
     bodyHtml?: string;
     handle?: string;
     isPublished?: boolean;
   }): Promise<boolean>
   ```
   Uses `pageUpdate` mutation.

   Add `deletePage(id)` method:
   ```typescript
   async deletePage(id: string): Promise<boolean>
   ```
   Uses `pageDelete` mutation.

   Add `getPageByHandle(handle)` method:
   ```typescript
   async getPageByHandle(handle: string): Promise<ShopifyPage | null>
   ```
   Uses pages query with handle filter.

   Add `getProductImage(productId)` method:
   ```typescript
   async getProductImage(productId: string): Promise<string | null>
   ```
   Fetches the featured image URL for a Shopify product by its GID.

3. **Create `/src/shopify/offer-page-builder.ts`**:

   Export `buildOfferPageHtml(content: ScrapedOfferContent, products: ShopifyCatalogCache[], shopifyClient: ShopifyClient): Promise<string>`:
   - Use Gemini (`gemini-3-flash-preview`) to enhance the promotional copy
   - Structure HTML with hero image section, body content, product grid, terms section
   - **Product grid uses Shopify product images**: For each linked product, fetch image from Shopify or use cached URL from shopify_catalog_cache
   - Include CSS classes for theming (match existing product page styles)
   - Fallback to simple HTML if Gemini fails

   Export `buildOfferPageTitle(scraped: ScrapedOfferContent): string`:
   - Clean up title, add brand if missing

   Export `generateOfferHandle(title: string): string`:
   - Slugify title for URL-safe handle

4. **Add types to `/src/types/index.ts`**:
   ```typescript
   interface ShopifyPage {
     id: string;
     title: string;
     handle: string;
     bodyHtml: string;
     isPublished: boolean;
   }
   ```

### Commands and Verification

```bash
cd /Users/Development/Honda\ Price\ Update
npm run build

# Verify page creation works via manual test or API endpoint test
```

Create a test page in Shopify, verify it appears in admin, then delete it.

### Completion Criteria

- `npm run build` succeeds
- `createPage` returns valid Shopify page ID
- `updatePage` can modify page content
- `deletePage` removes page
- `buildOfferPageHtml` generates valid HTML with hero image and product grid using Shopify product images
- Gemini uses `gemini-3-flash-preview` model

Upon completion: Update Progress section, commit with message "feat: Add Shopify page management and offer page builder".

---

## Milestone 4: Offer Landing Page Manager

### Goal

Create a service that maintains the offers landing page with tiles for each active offer. When offers are added, updated, or expired, the landing page content is regenerated and pushed to Shopify.

### Prerequisites

- Milestone 3 complete (page service)
- Milestone 1 complete (database queries for active offers)

### Context for This Milestone

**Landing page structure** (based on Honda examples):
- Grid of offer tiles (responsive: 1-3 columns)
- Each tile has: image thumbnail, title, brief description, "View Offer" link
- Tiles sorted by end date (soonest ending first) or creation date

**Approach**:
- Store a designated "offers landing page" handle: `offers`
- Generate tile HTML for each active offer
- Cache tile HTML in `shopify_offer_pages.landing_tile_html`
- Rebuild full landing page by concatenating all active tiles
- Update Shopify page via `pageUpdate`

**Files to create**:
- `/src/shopify/offers-landing-builder.ts` - Landing page HTML generation
- `/src/shopify/offers-landing-manager.ts` - Orchestrates landing page updates

### Work

1. **Create `/src/shopify/offers-landing-builder.ts`**:

   Export `buildOfferTileHtml(offer: Offer, pageHandle: string, heroImageUrl?: string): string`:
   - Generate HTML for a single offer tile
   - Include thumbnail image (from uploaded hero image), title, summary truncated to ~100 chars
   - Link to `/pages/{pageHandle}`
   - Add end date badge if within 7 days

   Export `buildOffersLandingPageHtml(tiles: string[], introText?: string): string`:
   - Wrap tiles in responsive grid container
   - Add intro text/heading at top
   - Add "No current offers" message if tiles array empty

2. **Create `/src/shopify/offers-landing-manager.ts`**:

   Export `OffersLandingManager` class:

   Constructor: Takes ShopifyClient instance

   Method `ensureLandingPageExists(): Promise<string>`:
   - Check if page with handle `offers` exists
   - If not, create it with placeholder content
   - Return page ID

   Method `rebuildLandingPage(): Promise<void>`:
   - Fetch all active offer pages from `shopify_offer_pages` where status='active'
   - Generate tile HTML for each using cached `landing_tile_html` or regenerate
   - Build full landing page HTML
   - Update Shopify page via `pageUpdate`

   Method `updateOfferTile(offerId: number, tileHtml: string): Promise<void>`:
   - Update `landing_tile_html` in database
   - Trigger landing page rebuild

3. **Add config for landing page handle** in `/src/utils/config.ts`:
   ```typescript
   offersLandingPageHandle: process.env.OFFERS_LANDING_PAGE_HANDLE || 'offers'
   ```

### Commands and Verification

```bash
cd /Users/Development/Honda\ Price\ Update
npm run build
```

Manually trigger `rebuildLandingPage()` and verify the offers landing page updates in Shopify admin at `/pages/offers`.

### Completion Criteria

- `npm run build` succeeds
- Landing page created at `/pages/offers` if it doesn't exist
- Tiles display for active offers
- Landing page updates when `rebuildLandingPage()` called

Upon completion: Update Progress section, commit with message "feat: Add offers landing page manager with tile generation".

---

## Milestone 5: Offer Push API & Workflow

### Goal

Create the API endpoints and orchestration workflow that allows users to push a discovered offer to Shopify. This wires together the scraper, page builder, database, and landing page manager.

### Prerequisites

- Milestones 1-4 complete

### Context for This Milestone

**Workflow**:
1. User selects offer from Discoveries UI
2. User selects products to link (from shopify_catalog_cache)
3. User confirms/adjusts end date
4. API call to push offer
5. Backend: Scrape offer page → Upload hero image → Build HTML with Shopify product images → Create Shopify page → Link products → Update landing page → Return success

**Product images in offer page**: The `buildOfferPageHtml` function receives `ShopifyCatalogCache` entries which include `shopify_product_id`. Use this to fetch/reference Shopify product images in the generated HTML.

**Existing API pattern** (`/src/api/shopify-push-api.ts`):
- Express router with POST endpoints
- Validates input, calls service functions, returns JSON response
- Error handling with try/catch

**Files to create/modify**:
- `/src/api/offer-push-api.ts` - New API endpoints
- `/src/shopify/push-offer-to-shopify.ts` - Orchestration workflow
- `/src/server.ts` - Register new router

### Work

1. **Create `/src/shopify/push-offer-to-shopify.ts`**:

   Export `pushOfferToShopify(offerId: number, productIds: number[], endDate?: Date): Promise<PushOfferResult>`:

   Steps:
   1. Fetch offer from database by ID
   2. Check if already pushed (return existing page info if so)
   3. Scrape offer page using `OfferPageScraper`
   4. Upload hero image to Shopify Files API (using existing `uploadFile` method)
   5. Fetch linked products from `shopify_catalog_cache` by IDs (includes `shopify_product_id`)
   6. Build page HTML using `buildOfferPageHtml` - products display with their Shopify images
   7. Generate handle using `generateOfferHandle`
   8. Create Shopify page using `createPage`
   9. Store in `shopify_offer_pages` table with hero image URL
   10. Link products using `linkProductToOffer`
   11. Update offer end_date if provided
   12. Build tile HTML and update landing page
   13. Return result with page URL

   Return type:
   ```typescript
   interface PushOfferResult {
     success: boolean;
     shopifyPageId?: string;
     shopifyPageUrl?: string;
     message?: string;
     warnings?: string[];
   }
   ```

2. **Create `/src/api/offer-push-api.ts`**:

   `POST /api/offers/push`:
   ```typescript
   Body: {
     offerId: number;
     productIds: number[];
     endDate?: string; // ISO date
   }
   Response: PushOfferResult
   ```

   `POST /api/offers/:id/link-products`:
   ```typescript
   Body: { productIds: number[] }
   Response: { success: boolean; linkedCount: number }
   ```

   `GET /api/offers/:id/products`:
   ```typescript
   Response: { products: ShopifyCatalogCache[] }  // Includes shopify_product_id for image lookup
   ```

   `POST /api/offers/:id/update-end-date`:
   ```typescript
   Body: { endDate: string }
   Response: { success: boolean }
   ```

3. **Update `/src/server.ts`**:
   - Import and register offer-push-api router at `/api/offers`

### Commands and Verification

```bash
cd /Users/Development/Honda\ Price\ Update
npm run build
npm run dev

# Test API endpoint
curl -X POST http://localhost:3000/api/offers/push \
  -H "Content-Type: application/json" \
  -d '{"offerId": 1, "productIds": [1, 2, 3]}'
```

Verify:
- Offer page created in Shopify admin
- Hero image uploaded and displayed
- Product grid shows linked products with their Shopify images
- Products linked in database
- Landing page tile added

### Completion Criteria

- `npm run build` succeeds
- API endpoint accepts offer push request
- Shopify page created with correct content
- Products displayed with Shopify product images
- Products linked in database
- Landing page updated with new tile

Upon completion: Update Progress section, commit with message "feat: Add offer push API and workflow orchestration".

---

## Milestone 6: Expiration Service

### Goal

Create a scheduled service that automatically hides expired offer pages and removes their tiles from the landing page based on end dates.

### Prerequisites

- Milestones 1-5 complete

### Context for This Milestone

**Expiration logic**:
- Run daily (or on-demand)
- Query `shopify_offer_pages` joined with `offers` where end_date < today and status = 'active'
- For each expired offer: unpublish Shopify page (set isPublished=false), update status to 'hidden'
- Rebuild landing page (removes hidden tiles)

**Existing scheduled job pattern**:
- Main entry point in `/src/index.ts` runs nightly scrape
- Can add offer expiration check to same flow or create separate function

**Files to create/modify**:
- `/src/shopify/offer-expiration-service.ts` - Expiration logic
- `/src/index.ts` - Integrate expiration check (optional, can be API-triggered)
- `/src/api/offer-push-api.ts` - Add manual expiration endpoint

### Work

1. **Create `/src/shopify/offer-expiration-service.ts`**:

   Export `OfferExpirationService` class:

   Method `checkAndExpireOffers(): Promise<ExpireResult>`:
   1. Query database for active offer pages with end_date in the past
   2. For each expired offer:
      - Call `shopifyClient.updatePage(id, { isPublished: false })` to unpublish
      - Update `shopify_offer_pages` status to 'hidden'
      - Log expiration
   3. If any expired, call `landingManager.rebuildLandingPage()`
   4. Return count of expired offers

   Return type:
   ```typescript
   interface ExpireResult {
     expiredCount: number;
     errors: string[];
   }
   ```

   Method `getExpiringOffers(withinDays: number): Promise<Offer[]>`:
   - Return offers expiring within N days (for dashboard warnings)

2. **Add database query** to `/src/database/queries.ts`:

   `getExpiredActiveOfferPages()`:
   - Join `shopify_offer_pages` with `offers`
   - Where `status = 'active'` AND `end_date < CURRENT_DATE`

   `getExpiringOffers(withinDays: number)`:
   - Where `end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + withinDays`

3. **Add API endpoint** to `/src/api/offer-push-api.ts`:

   `POST /api/offers/check-expirations`:
   ```typescript
   Response: ExpireResult
   ```

   `GET /api/offers/expiring`:
   ```typescript
   Query: { days?: number } // default 7
   Response: { offers: Offer[] }
   ```

4. **Optional**: Add to nightly job in `/src/index.ts`:
   ```typescript
   // After price scraping
   await offerExpirationService.checkAndExpireOffers();
   ```

### Commands and Verification

```bash
cd /Users/Development/Honda\ Price\ Update
npm run build

# Test expiration check
curl -X POST http://localhost:3000/api/offers/check-expirations

# Test expiring offers query
curl http://localhost:3000/api/offers/expiring?days=7
```

Create a test offer with past end date, verify it gets unpublished (hidden) and removed from landing page.

### Completion Criteria

- `npm run build` succeeds
- Expired offers detected and unpublished (not deleted)
- Landing page rebuilt without expired tiles
- Expiring offers queryable for dashboard warnings

Upon completion: Update Progress section, commit with message "feat: Add offer expiration service with auto-hide".

---

## Milestone 7: Frontend Offer Management UI

### Goal

Create the frontend interface for managing offers: viewing details, linking products, setting end dates, and pushing to Shopify. Extend the existing Discoveries page offers tab.

### Prerequisites

- Milestones 1-6 complete (API endpoints available)

### Context for This Milestone

**Existing UI pattern** (`/frontend/src/pages/Dashboard/Discoveries.tsx`):
- Tabs for Products and Offers
- Offers displayed in card grid
- Products have "Push to Shopify" dropdown
- Uses fetch() for API calls
- React state for loading, errors, success feedback

**New UI elements needed**:
- Offer detail modal/panel with full information
- Product selector (multi-select from shopify_catalog_cache with product images)
- Date picker for end date
- "Push to Shopify" button with loading state
- Status indicators (pending, active, hidden, expired)
- Expiring soon warnings

**Files to modify**:
- `/frontend/src/pages/Dashboard/Discoveries.tsx` - Extend offers section
- `/frontend/src/types/database.ts` - Add missing types if needed

### Work

1. **Extend `/frontend/src/pages/Dashboard/Discoveries.tsx`**:

   Add state for offer management:
   ```typescript
   const [selectedOffer, setSelectedOffer] = useState<CrawlerOffer | null>(null);
   const [linkedProducts, setLinkedProducts] = useState<number[]>([]);
   const [endDate, setEndDate] = useState<string>('');
   const [pushingOffer, setPushingOffer] = useState(false);
   const [availableProducts, setAvailableProducts] = useState<ShopifyCatalogCache[]>([]);
   ```

   Add offer detail panel (slide-out or modal):
   - Display offer title, summary, source URL
   - Show current status if already pushed
   - Date picker for end date (pre-fill from scraped date if available)
   - Product multi-select dropdown/list showing product title and thumbnail (Shopify images)
   - "Push to Shopify" button

   Add product fetching:
   - On offer select, fetch available products from `/api/shopify/catalog`
   - Show products as checkable list with title, SKU, price, and thumbnail image

   Add push handler:
   ```typescript
   const handlePushOffer = async () => {
     setPushingOffer(true);
     const response = await fetch('http://localhost:3000/api/offers/push', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         offerId: selectedOffer.id,
         productIds: linkedProducts,
         endDate: endDate || undefined
       })
     });
     // Handle response, show success/error
   };
   ```

   Update offer cards:
   - Add status badge (pending/active/hidden)
   - Add "Manage" button to open detail panel
   - Show expiring warning if within 7 days

2. **Add API endpoint for product catalog** (if not exists):

   In `/src/api/shopify-push-api.ts` or new file:
   ```typescript
   GET /api/shopify/catalog
   Response: { products: ShopifyCatalogCache[] }
   ```

3. **Update `/frontend/src/types/database.ts`**:
   - Add `ShopifyOfferPage` interface
   - Add `OfferWithStatus` type extending CrawlerOffer

### Commands and Verification

```bash
cd /Users/Development/Honda\ Price\ Update/frontend
npm run build
npm run dev

# Open browser to http://localhost:5173
# Navigate to Discoveries > Offers tab
# Select an offer, verify management panel opens
# Link products (should show Shopify product images), set date, push to Shopify
```

Verify full workflow: select offer → link products (with images) → set date → push → see success → offer page visible in Shopify with product grid showing Shopify images.

### Completion Criteria

- Frontend builds without errors
- Offers display with status badges
- Product selection works with product thumbnails displayed
- Date picker functional
- Push to Shopify completes successfully
- Offer page shows products with their Shopify images
- Success/error feedback displayed

Upon completion: Update Progress section, commit with message "feat: Add frontend offer management UI".

---

## Interfaces and Dependencies

### External Dependencies (already installed)
- `@shopify/shopify-api`: Shopify GraphQL client
- `@google/generative-ai`: Gemini AI for content generation
- `@supabase/supabase-js`: Database client
- `express`: HTTP server

### Gemini Model Configuration
- **Text/HTML Generation**: `gemini-3-flash-preview`
- **Image Generation**: `gemini-3-pro-image-preview`

Configure via environment variables:
```
GEMINI_TEXT_MODEL=gemini-3-flash-preview
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
```

### New Internal Interfaces

```typescript
// /src/types/index.ts additions

interface ShopifyOfferPage {
  id: number;
  offer_id: number;
  shopify_page_id: string;
  shopify_page_handle: string;
  hero_image_shopify_url: string | null;
  status: 'active' | 'hidden' | 'deleted';
  landing_tile_html: string | null;
  created_at: string;
  updated_at: string;
}

interface OfferProductLink {
  id: number;
  offer_id: number;
  product_id: number;
  created_at: string;
}

interface ScrapedOfferContent {
  heroImageUrl: string | null;
  title: string;
  bodyHtml: string;
  termsText: string | null;
  endDate: Date | null;
  startDate: Date | null;
  productUrls: string[];
  sourceUrl: string;
}

interface PushOfferResult {
  success: boolean;
  shopifyPageId?: string;
  shopifyPageUrl?: string;
  message?: string;
  warnings?: string[];
}

interface ExpireResult {
  expiredCount: number;
  errors: string[];
}

interface ShopifyPage {
  id: string;
  title: string;
  handle: string;
  bodyHtml: string;
  isPublished: boolean;
}
```

### Shopify API Scopes Required
- `write_content` OR `write_online_store_pages` - For page CRUD operations

Verify scopes in Shopify admin > Settings > Apps and sales channels > [Your App] > API access.

---

## Idempotence and Recovery

**Offer push is idempotent**: If `pushOfferToShopify` is called for an offer that's already pushed, it returns the existing page info rather than creating a duplicate. The check is based on `shopify_offer_pages.offer_id` unique constraint.

**Landing page rebuild is safe to repeat**: Calling `rebuildLandingPage()` multiple times produces the same result. It fetches current state from database and regenerates.

**Expiration check is safe to repeat**: Running `checkAndExpireOffers()` multiple times only affects offers that are currently active and past their end date. Already-hidden offers are skipped.

**Recovery from partial failure**:
- If Shopify page creation fails, no database record is created (transaction-like behavior)
- If database insert fails after Shopify creation, the page exists but isn't tracked. Manual cleanup may be needed. Log the Shopify page ID for recovery.
- If landing page update fails, individual offer pages are still accessible. Retry landing page rebuild.

**Rollback procedure**:
- To remove an offer: Call `updatePage(shopifyPageId, { isPublished: false })`, then update `shopify_offer_pages` status to 'hidden', then rebuild landing page.
- To permanently delete: Call `deletePage(shopifyPageId)`, then update status to 'deleted'.

---

## Artifacts and Notes

### Example Shopify Page Create Mutation

```graphql
mutation pageCreate($page: PageCreateInput!) {
  pageCreate(page: $page) {
    page {
      id
      title
      handle
      bodyHtml
    }
    userErrors {
      field
      message
    }
  }
}

# Variables:
{
  "page": {
    "title": "Transalp Bonus Tour Pack",
    "bodyHtml": "<div class='offer-page'>...</div>",
    "handle": "transalp-bonus-tour-pack",
    "isPublished": true
  }
}
```

### Example Offer Page HTML Structure

```html
<div class="offer-page">
  <!-- Hero Section -->
  <div class="offer-hero">
    <img src="https://cdn.shopify.com/s/files/..." alt="Transalp Bonus Tour Pack" />
  </div>

  <!-- Content Section (enhanced by Gemini) -->
  <div class="offer-content">
    <h1>Transalp Bonus Tour Pack</h1>
    <div class="offer-body">
      <!-- Promotional content from supplier, enhanced by Gemini -->
    </div>
  </div>

  <!-- Products on Deal Section -->
  <div class="offer-products">
    <h2>Products Included in This Offer</h2>
    <div class="product-grid">
      <!-- Each product uses its SHOPIFY product image -->
      <div class="product-card">
        <img src="https://cdn.shopify.com/products/..." alt="Honda Transalp" />
        <h3>Honda Transalp</h3>
        <a href="/products/transalp">View Product</a>
      </div>
      <!-- More products... -->
    </div>
  </div>

  <!-- Terms Section -->
  <div class="offer-terms">
    <p>Terms and conditions apply...</p>
    <p class="offer-end-date">Offer ends 31 March 2026</p>
  </div>
</div>
```

### Example Offer Tile HTML

```html
<div class="offer-tile">
  <a href="/pages/transalp-bonus-tour-pack">
    <img src="https://cdn.shopify.com/..." alt="Transalp Bonus Tour Pack" />
    <div class="offer-tile-content">
      <h3>Transalp Bonus Tour Pack</h3>
      <p>Get a free touring accessory pack valued at $2,500...</p>
      <span class="offer-end-date">Ends 31 Mar 2026</span>
    </div>
  </a>
</div>
```

### Environment Variables

Add to `.env`:
```
OFFERS_LANDING_PAGE_HANDLE=offers
GEMINI_TEXT_MODEL=gemini-3-flash-preview
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
```

---

## Revision History

| Date | Change | Reason |
|------|--------|--------|
| 2026-01-19 | Initial plan created | Feature request for offer page management |
| 2026-01-19 | Updated Gemini models to gemini-3-flash-preview and gemini-3-pro-image-preview | User specification |
| 2026-01-19 | Clarified that Shopify product images are used in offer page product grid | User clarification - products display with images from Shopify catalog |
| 2026-01-19 | Moved plan to /References directory | User preference for plan location |
