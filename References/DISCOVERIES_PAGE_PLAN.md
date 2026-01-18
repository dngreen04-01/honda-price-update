# Crawler Discoveries Frontend Page

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This document must be maintained in accordance with `/References/Plans.md`.

## Purpose / Big Picture

After this change, users can view and manage products and offers discovered by the Honda website crawler that are not currently in the tracking database. The page displays two filterable lists: new products and new offers. Users can mark any item as "ignored" to prevent it from appearing in future views, and these decisions persist in the database.

A user can see this working by navigating to `/dashboard/discoveries` after logging in. The page shows pending discoveries from the most recent crawler runs. Clicking "Ignore" on any item removes it from the pending view and marks it as ignored in the database.

## Progress

- [x] Phase 1: Add database types for discovered products and offers
- [x] Phase 2: Create the Discoveries page component
- [x] Phase 3: Add routing and navigation
- [x] Phase 4: Implement filtering and bulk actions
- [x] Phase 5: Test end-to-end functionality
- [x] Phase 6: Add manual URL entry form for direct Shopify push

## Surprises & Discoveries

- Phase 2 and Phase 3 were combined since routing/navigation is a natural extension of component creation
- Used Radar icon for navigation instead of Search (better semantic fit for "discoveries")
- The component includes filtering by status which was planned for Phase 4, implemented early for better UX
- Phase 4 added domain filter dropdown with item counts per domain for quick filtering
- Bulk selection implemented with select-all checkbox (only for pending items) and visual feedback for selected rows
- Added "Mark Reviewed" as additional bulk action alongside "Ignore Selected" for more workflow flexibility
- Phase 5 testing discovered API didn't allow 'pending' status for restore functionality - fixed in crawler-api.ts
- Phase 6 (2026-01-18): Added manual URL entry form with template selection - reused existing scraper infrastructure via new `pushUrlToShopify()` function

## Decision Log

- Decision: Use existing API endpoints rather than direct Supabase queries
  Rationale: The crawler API at `/api/crawl/*` already provides all necessary endpoints including `GET /api/crawl/results` for products and `POST /api/crawl/review/:productId` for status updates. Using these maintains consistency with the crawler architecture.
  Date/Author: 2026-01-15

- Decision: Single page with tabbed sections for Products and Offers
  Rationale: Keeps the UI simple and allows users to focus on one category at a time while maintaining a unified discovery management experience.
  Date/Author: 2026-01-15

- Decision: Filter by status with "Pending" as default view
  Rationale: Users primarily need to see items requiring action. Showing ignored items requires explicit filter selection to keep the default view clean.
  Date/Author: 2026-01-15

- Decision: Bulk selection only available for pending items
  Rationale: Bulk actions (ignore, mark reviewed) are only meaningful for pending items. Selecting ignored or already-reviewed items would require different workflows (restore vs ignore). Limiting selection to pending items keeps the UI simple and prevents user confusion.
  Date/Author: 2026-01-16

- Decision: Domain filter shows item counts per domain
  Rationale: Helps users understand data distribution across domains before filtering. Useful when dealing with discoveries from multiple Honda website domains.
  Date/Author: 2026-01-16

- Decision: Manual URL entry form added as collapsible card
  Rationale: Users need ability to add products that weren't auto-discovered by the crawler. Collapsible design keeps the UI clean while providing quick access. Form bypasses discovered_products table and pushes directly to Shopify, but still adds to catalog cache for price tracking.
  Date/Author: 2026-01-18

## Outcomes & Retrospective

**Completed: 2026-01-16**

**What Worked Well:**
- Existing API endpoints from crawler implementation provided all needed functionality
- Reusing UI patterns from PriceComparison.tsx ensured visual consistency
- Incremental implementation (types → component → routing → features → testing) allowed for focused development
- Bulk selection with select-all simplified user workflow for managing many discoveries

**Issues Found & Fixed:**
- API validation didn't include 'pending' status, preventing restore functionality - fixed in crawler-api.ts
- Pre-existing TypeScript errors in AuthContext.tsx (unrelated to this feature)

**Test Results:**
- All API endpoints functional: /results, /offers, /stats, /review/:id
- Status transitions work: pending ↔ ignored, pending → reviewed, pending → added
- Bulk actions work correctly for multiple selections
- Filtering by status and domain works as expected
- Stats update immediately after status changes

## Context and Orientation

This repository is a price monitoring system that synchronizes product prices between Shopify stores and Honda NZ supplier websites. The crawler (implemented in `/References/HONDA_CRAWLER_PLAN.md`) discovers new products and offers on Honda websites.

**Frontend Architecture** (in `/frontend/src/`):
- `pages/Dashboard/` - Dashboard page components (Overview, PriceComparison, etc.)
- `components/ui/` - Reusable UI components (Card, Button, Input)
- `components/layout/DashboardLayout.tsx` - Sidebar navigation and page layout
- `App.tsx` - React Router configuration with nested dashboard routes
- `lib/supabase.ts` - Supabase client for database access

**Backend API** (in `/src/api/crawler-api.ts`):
- `GET /api/crawl/results?status=pending` - Returns discovered products filtered by status
- `GET /api/crawl/offers` - Returns all offers
- `POST /api/crawl/review/:productId` - Updates product status (body: `{status, reviewedBy}`)
- `GET /api/crawl/stats` - Returns count breakdown by status

**Database Tables** (from `migrations/009_add_crawl_discovery.sql`):
- `discovered_products` - Stores products found by crawler with fields: id, url, url_canonical, domain, page_title, detected_price, status (pending/reviewed/ignored/added), reviewed_at, reviewed_by
- `offers` - Stores promotional offers with fields: id, domain_id, title, offer_url, summary

**Status Values for discovered_products**:
- `pending` - Awaiting user review (default)
- `reviewed` - Acknowledged but no action taken
- `ignored` - Marked as not relevant, hidden from default view
- `added` - Added to Shopify tracking

## Plan of Work

The implementation adds a single new page component following existing patterns from PriceComparison.tsx and Overview.tsx. The page fetches data from existing API endpoints and provides UI for viewing and managing discoveries.

**Phase 1** adds TypeScript interfaces for the discovered products and offers data to the frontend types file at `frontend/src/types/database.ts`.

**Phase 2** creates the main page component at `frontend/src/pages/Dashboard/Discoveries.tsx`. This component:
- Fetches discovered products via `GET http://localhost:3000/api/crawl/results`
- Fetches offers via `GET http://localhost:3000/api/crawl/offers`
- Displays data in a tabbed interface (Products | Offers)
- Shows product details: domain, URL, page title, detected price, discovered date
- Shows offer details: domain, title, URL, summary
- Provides "Ignore" button for each item calling `POST /api/crawl/review/:id`

**Phase 3** registers the route in `App.tsx` and adds navigation in `DashboardLayout.tsx`.

**Phase 4** adds filtering controls (status filter dropdown, domain filter) and optional bulk ignore functionality.

## Concrete Steps

### Step 1: Add TypeScript types

Working directory: `/Users/Development/Honda Price Update`

Edit file `frontend/src/types/database.ts` to add after existing interfaces:

    export interface DiscoveredProduct {
      id: number;
      crawl_run_id: number | null;
      url: string;
      url_canonical: string;
      domain: string;
      page_title: string | null;
      detected_price: number | null;
      status: 'pending' | 'reviewed' | 'ignored' | 'added';
      reviewed_at: string | null;
      reviewed_by: string | null;
      created_at: string;
    }

    export interface CrawlerOffer {
      id: number;
      domain_id: number;
      title: string;
      offer_url: string;
      summary: string | null;
      created_at: string;
      domain?: { name: string };
    }

### Step 2: Create Discoveries page component

Create file `frontend/src/pages/Dashboard/Discoveries.tsx` with structure:

    // @ts-nocheck
    import React, { useEffect, useState } from 'react'
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
    import { Search, Globe, Package, Tag, ExternalLink, EyeOff, RefreshCw, Filter, Loader2, CheckCircle2 } from 'lucide-react'
    import { format } from 'date-fns'

    // State: products, offers, loading states, active tab, status filter
    // Fetch functions: loadProducts(), loadOffers(), handleIgnore()
    // UI: Header, Tab buttons, Filter controls, Data table/cards, Empty states

The component follows the pattern established in PriceComparison.tsx:
- Uses Card components for layout
- Displays loading spinner during fetch
- Shows empty state when no data
- Handles errors gracefully
- Uses Lucide icons consistently

### Step 3: Register route in App.tsx

Edit file `frontend/src/App.tsx` to add import and route:

    import { Discoveries } from './pages/Dashboard/Discoveries'

    // Inside Dashboard routes, add:
    <Route path="discoveries" element={<Discoveries />} />

### Step 4: Add navigation item in DashboardLayout.tsx

Edit file `frontend/src/components/layout/DashboardLayout.tsx`:

Add import for Search icon (or appropriate icon like Radar, ScanSearch).

Add to the `navigation` array:

    { name: 'Discoveries', href: '/dashboard/discoveries', icon: <Search className="h-5 w-5" /> }

### Step 5: Verify and test

Start the development server:

    cd frontend && npm run dev

Navigate to `http://localhost:5173/dashboard/discoveries`

Expected behavior:
- Page loads with tabs for Products and Offers
- Pending discoveries appear in the list
- Clicking "Ignore" on a product moves it out of the pending view
- Refreshing the page confirms the item remains ignored

## Validation and Acceptance

**Unit Validation**: The page component renders without errors and TypeScript types are correctly imported.

**Integration Test**:
1. Ensure Python scraper is running: `cd python-scraper && python server.py`
2. Ensure Node server is running: `npm run dev` (from project root)
3. Ensure frontend is running: `cd frontend && npm run dev`
4. Navigate to `http://localhost:5173/dashboard/discoveries`
5. Verify products list loads (may be empty if no crawls have run)
6. If data exists, click "Ignore" on a product
7. Verify the product disappears from the pending view
8. Change filter to "Ignored" to see the item in that list

**Database Verification**:

    SELECT id, url, status, reviewed_at FROM discovered_products
    WHERE status = 'ignored'
    ORDER BY reviewed_at DESC
    LIMIT 5;

Should show recently ignored products with timestamps.

## Idempotence and Recovery

The page is read-only except for status updates. Marking an item as ignored is idempotent - calling it multiple times has the same effect. The unique constraint on `url_canonical` prevents duplicate entries.

If the API is unavailable, the page displays an error state. Users can retry by refreshing the page or clicking a refresh button.

## Interfaces and Dependencies

**Frontend Dependencies** (already installed):
- React 19.1.1
- react-router-dom 7.9.5
- lucide-react 0.552.0
- date-fns 4.1.0
- Tailwind CSS 3.4.18

**API Endpoints Used**:

    GET http://localhost:3000/api/crawl/results?status={status}
    Response: DiscoveredProduct[]

    GET http://localhost:3000/api/crawl/offers
    Response: CrawlerOffer[]

    POST http://localhost:3000/api/crawl/review/:productId
    Request: { status: 'ignored' | 'reviewed' | 'added', reviewedBy?: string }
    Response: { success: true }

    GET http://localhost:3000/api/crawl/stats
    Response: { pending: number, reviewed: number, ignored: number, added: number }

**New Files**:
- `frontend/src/pages/Dashboard/Discoveries.tsx` - Main page component

**Modified Files**:
- `frontend/src/types/database.ts` - Add DiscoveredProduct and CrawlerOffer interfaces
- `frontend/src/App.tsx` - Add route for /dashboard/discoveries
- `frontend/src/components/layout/DashboardLayout.tsx` - Add navigation item

## Artifacts and Notes

**Component Structure for Discoveries.tsx**:

    Page Layout:
    ├── Header (title, description, stats summary)
    ├── Controls Row
    │   ├── Tab Buttons (Products | Offers)
    │   ├── Status Filter (Pending | Reviewed | Ignored | All)
    │   └── Refresh Button
    └── Content Area
        ├── Loading State (spinner)
        ├── Empty State (no items message)
        └── Data Display
            ├── Products Tab: Table with domain, title, URL, price, actions
            └── Offers Tab: Cards with title, URL, summary

**Status Badge Colors**:
- pending: yellow/amber
- reviewed: blue
- ignored: gray
- added: green

**Icon Mapping**:
- Products tab: Package
- Offers tab: Tag
- External link: ExternalLink
- Ignore action: EyeOff
- Refresh: RefreshCw
- Loading: Loader2 (with animate-spin)
- Filter: Filter
