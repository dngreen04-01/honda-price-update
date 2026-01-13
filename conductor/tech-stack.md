# Tech Stack: Honda Supplier Price Scraper

## Backend
- **Runtime:** Node.js (v20+)
- **Language:** TypeScript
- **Framework:** Express (for API endpoints)
- **Task Scheduling:** `node-cron` for automated scraping jobs.

## Frontend (Internal Dashboard)
- **Framework:** React 18+ (Vite)
- **Styling:** Tailwind CSS
- **Icons/Charts:** Lucide React, Recharts
- **State/Auth:** Supabase Auth & Client

## Data & Infrastructure
- **Primary Database:** Supabase (PostgreSQL)
- **Integration:** Shopify GraphQL Admin API
- **Email Delivery:** SendGrid v3 API

## Scraping & Automation
- **Scraping Engine:** **Scrapling** (Running in a dedicated Python microservice)
- **Python Service:** FastAPI + Uvicorn (Exposing Scrapling via REST API)
- **Browser Automation:** Puppeteer (Fallback and specialized interaction handling)
- **Parsing:** Cheerio / JSDOM (Node.js) & Scrapling's internal parsing (Python)
