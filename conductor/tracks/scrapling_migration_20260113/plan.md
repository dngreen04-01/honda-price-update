# Plan: Scrapling Migration

## Phase 1: Research & Setup
- [ ] Task: Research Scrapling API and basic usage for Node.js/TypeScript.
- [ ] Task: Install `scrapling` dependency and remove `firecrawl-js`.
- [ ] Task: Create a basic test script to verify Scrapling can fetch and parse a single Honda product page.
- [ ] Task: Conductor - User Manual Verification 'Research & Setup' (Protocol in workflow.md)

## Phase 2: Core Scraper Implementation
- [ ] Task: Implement `ScraplingClient` in `src/scraper/scrapling-client.ts` following the pattern of existing clients.
- [ ] Task: Implement unit tests for `ScraplingClient` using mocks where appropriate.
- [ ] Task: Ensure `ScraplingClient` handles common scraping challenges (user agents, timeouts, retries).
- [ ] Task: Conductor - User Manual Verification 'Core Scraper Implementation' (Protocol in workflow.md)

## Phase 3: Domain-Specific Adapters & Logic
- [ ] Task: Update or verify `honda-selectors.ts` compatibility with Scrapling's parsing engine.
- [ ] Task: Refactor `price-extractor.ts` if necessary to accept Scrapling output.
- [ ] Task: Implement integration tests for each of the three Honda domains using Scrapling.
- [ ] Task: Conductor - User Manual Verification 'Domain-Specific Adapters & Logic' (Protocol in workflow.md)

## Phase 4: Integration & Orchestration
- [ ] Task: Modify `src/scraper/scraper-orchestrator.ts` to use `ScraplingClient`.
- [ ] Task: Update the main entry point `src/index.ts` to reflect the change in scraper engine.
- [ ] Task: Run a full manual scrape using `npm run scrape` and verify data in Supabase.
- [ ] Task: Conductor - User Manual Verification 'Integration & Orchestration' (Protocol in workflow.md)

## Phase 5: Verification & Cleanup
- [ ] Task: Perform a full sync test from Scrapling result to Shopify.
- [ ] Task: Remove any remaining Firecrawl-specific code, tests, and configuration.
- [ ] Task: Final end-to-end verification of the nightly job.
- [ ] Task: Conductor - User Manual Verification 'Verification & Cleanup' (Protocol in workflow.md)
