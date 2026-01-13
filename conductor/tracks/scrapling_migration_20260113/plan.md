# Plan: Scrapling Migration

## Phase 1: Research & Setup
- [x] Task: Research Scrapling API and basic usage for Node.js/TypeScript.
- [x] Task: Create `python-scraper` directory and set up Python environment (requirements.txt). dd932a7
- [x] Task: Install `scrapling`, `fastapi`, and `uvicorn` in the Python environment. 92e71a9
- [ ] Task: Create a basic FastAPI server (`server.py`) exposing a `/scrape` endpoint using Scrapling.
- [ ] Task: Conductor - User Manual Verification 'Research & Setup' (Protocol in workflow.md)

## Phase 2: Core Scraper Implementation
- [ ] Task: Implement `ScraplingClient` in `src/scraper/scrapling-client.ts` to communicate with the Python service.
- [ ] Task: Implement unit tests for `ScraplingClient` mocking the HTTP calls to the Python service.
- [ ] Task: Ensure `ScraplingClient` handles service connectivity issues and timeouts.
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
