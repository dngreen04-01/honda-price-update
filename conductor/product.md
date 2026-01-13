# Product Guide: Honda Supplier Price Scraper

## # Initial Concept
Automated supplier website price and offer scraper with Shopify sync and email notifications.

## Project Overview
This system automates the monitoring of Honda supplier websites (outdoors, marine, motorbikes) to ensure Shopify product prices are synchronized and up-to-date. It serves as a critical operational tool to prevent price discrepancies, detect new offers, and provide historical pricing data.

## Target Audience
- **Internal Operations Team:** Responsible for maintaining accurate pricing across sales channels.
- **Store Managers:** Recipients of nightly digests to stay informed of market changes and active promotions.
- **Developers:** Maintainers of the scraping logic and integration pipelines.

## Core Goals
1.  **Accuracy:** Ensure 100% synchronization accuracy between supplier sites and the Shopify store.
2.  **Automation:** Eliminate manual price checking by running nightly automated scrapes.
3.  **Visibility:** Provide clear, actionable insights via email digests and a real-time dashboard.
4.  **Reliability:** Robust handling of supplier website changes using deterministic parsing with LLM fallbacks.

## Key Features
-   **Multi-Domain Scraping:** specialized handling for Honda Outdoors, Marine, and Motorbikes.
-   **Intelligent Price Extraction:** Hybrid approach using CSS selectors and AI to ensure data quality.
-   **Shopify Integration:** Direct GraphQL API integration for real-time price updates.
-   **Data Reconciliation:** Automated detection of products missing from Shopify or the supplier.
-   **Offer Tracking:** Monitoring of start/end dates for special promotions.
-   **Operational Dashboard:** A React-based frontend for monitoring scrape health and history.
