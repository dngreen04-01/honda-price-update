# Plan: Scrapling Migration

## Phase 1: Research & Setup
- [x] Task: Research Scrapling API and basic usage for Node.js/TypeScript.
- [x] Task: Create `python-scraper` directory and set up Python environment (requirements.txt). dd932a7
- [x] Task: Install `scrapling`, `fastapi`, and `uvicorn` in the Python environment. 92e71a9
- [x] Task: Create a basic FastAPI server (`server.py`) exposing a `/scrape` endpoint using Scrapling. 0da3d15
- [x] Task: Conductor - User Manual Verification 'Research & Setup' (Protocol in workflow.md) [checkpoint: 10051b7]

## Phase 2: Scrapling Service + Client Hardening
- [~] Task: Implement `ScraplingClient` in `src/scraper/scrapling-client.ts` to communicate with the Python service.
- [~] Task: Implement unit tests for `ScraplingClient` mocking HTTP calls to the Python service.
- [ ] Task: Add retries, circuit breaker, and explicit timeout handling to `ScraplingClient`.
- [ ] Task: Update `python-scraper/server.py` to support anti-bot requirements (JS rendering and proxy settings).
- [ ] Task: Add a health endpoint and consistent error responses to the Python service.
- [ ] Task: Conductor - User Manual Verification 'Scrapling Service + Client Hardening' (Protocol in workflow.md)

## Phase 3: Extraction & Domain Logic
- [ ] Task: Validate `honda-selectors.ts` against Scrapling HTML for each Honda domain.
- [ ] Task: Decide on LLM fallback replacement or removal, then refactor `price-extractor.ts` accordingly.
- [ ] Task: Implement integration tests/fixtures for the three Honda domains using Scrapling responses.
- [ ] Task: Conductor - User Manual Verification 'Extraction & Domain Logic' (Protocol in workflow.md)

## Phase 4: Integration & Orchestration
- [ ] Task: Modify `src/scraper/scraper-orchestrator.ts` to use `ScraplingClient`.
- [ ] Task: Update `src/api/rescrape-api.ts` to use the Scrapling-based scrape path.
- [ ] Task: Update the main entry point `src/index.ts` if required by the new scraper flow.
- [ ] Task: Run a full manual scrape using `npm run scrape` and verify data in Supabase.
- [ ] Task: Conductor - User Manual Verification 'Integration & Orchestration' (Protocol in workflow.md)

## Phase 5: Verification & Cleanup
- [ ] Task: Perform a full sync test from Scrapling result to Shopify.
- [ ] Task: Remove Firecrawl and Bright Data dependencies, config, and unused code.
- [ ] Task: Update README/SETUP/DEPLOYMENT and environment variable documentation for Scrapling.
- [ ] Task: Final end-to-end verification of the nightly job.
- [ ] Task: Conductor - User Manual Verification 'Verification & Cleanup' (Protocol in workflow.md)
