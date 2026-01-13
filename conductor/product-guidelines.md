# Product Guidelines: Honda Supplier Price Scraper

## Engineering Excellence
- **Robust Error Handling:** Implement circuit breakers and retry logic for all external service calls (Firecrawl, Shopify, SendGrid, Supabase).
- **Modular Architecture:** Maintain a strict separation of concerns between scraping logic, database operations, and e-commerce synchronization to ensure the system is easy to test and extend.
- **Fail-Fast Reliability:** The system must prioritize immediate alerting over silent failures. If a supplier site is unreachable or extraction fails, the system should halt and notify administrators immediately.

## Design & User Experience
- **Action-Oriented Dashboard:** The internal dashboard must prioritize clarity, highlighting errors and specific actions required by the operations team rather than overwhelming with raw data.
- **Data Integrity via Human-in-the-Loop:** All significant price changes or new product detections must require manual approval through the dashboard before being pushed to the live Shopify store.

## Communication & Reporting
- **Exception-Based Notifications:** Email digests should only be dispatched when actionable changes occur or errors are detected, ensuring high relevance and preventing "alert fatigue."
- **Clear Audit Logs:** Every automated action and manual approval must be logged with detailed context for historical auditing and troubleshooting.
