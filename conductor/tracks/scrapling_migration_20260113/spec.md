# Spec: Scrapling Migration

## Resources
- **Repository:** [Scrapling GitHub](https://github.com/D4Vinci/Scrapling)
- **Documentation:** [Read the Docs](https://scrapling.readthedocs.io/en/latest/)
- **Guide:** [The Web Scraping Club - Scrapling Hands-on Guide](https://substack.thewebscraping.club/p/scrapling-hands-on-guide)

## Goal
Replace the current Firecrawl-based scraping implementation with **Scrapling**. This change aims to improve scraping reliability, reduce dependency on third-party API credits (if applicable), and provide better control over the scraping process.

## Requirements
- **Functional Parity:** The new Scrapling-based scraper must support all features currently provided by the Firecrawl implementation:
    - Scraping Honda Outdoors, Marine, and Motorbikes websites.
    - Deterministic extraction of sale price and original price.
    - Handling of product availability and offers.
    - Integration with the existing Supabase database schema (`product_pages`, `price_history`).
    - Integration with the Shopify synchronization logic.
- **Performance:** Scrapling should offer comparable or better performance and resource usage.
- **Error Handling:** Maintain or improve existing error handling, including circuit breakers and retries.
- **Maintainability:** The new implementation should follow the project's modular architecture, making it easy to swap or update scraping logic in the future.

## Proposed Changes
- **Dependencies:**
    - Add `scrapling`.
    - Remove `@mendable/firecrawl-js`.
- **Backend:**
    - Create a new `ScraplingClient` (e.g., in `src/scraper/scrapling-client.ts`).
    - Update `src/scraper/scraper-orchestrator.ts` to use the new `ScraplingClient` instead of `FirecrawlClient`.
    - Refactor domain-specific selectors or extraction logic if needed to work with Scrapling's API.
- **Configuration:**
    - Update environment variables if Scrapling requires specific API keys or configurations (e.g., proxy settings).

## Success Criteria
- Successful scraping of all three Honda domains with >98% extraction accuracy.
- Successful end-to-end sync of a scraped price to Shopify.
- All existing tests pass, and new tests cover the Scrapling implementation.
