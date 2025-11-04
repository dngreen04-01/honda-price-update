# Gemini Code Assistant Context

This document provides context for the Gemini Code Assistant to understand the Honda Supplier Price Scraper project.

## Project Overview

This is a Node.js and TypeScript project that automates the process of scraping Honda supplier websites for price and offer information. It then syncs this data with a Shopify store and sends out email notifications with a summary of the changes.

The project is structured as follows:

- **`src/`**: Contains the main source code.
  - **`scraper/`**: Handles the scraping of supplier websites using Firecrawl.
  - **`database/`**: Manages the connection to the Supabase (PostgreSQL) database and contains the database schema.
  - **`shopify/`**: Interacts with the Shopify GraphQL Admin API to sync product prices.
  - **`email/`**: Manages sending email digests and alerts using SendGrid.
  - **`utils/`**: Contains utility functions for logging, configuration, and data reconciliation.
  - **`types/`**: Defines the TypeScript types used throughout the project.
  - **`index.ts`**: The main entry point for the nightly scraping job.
- **`package.json`**: Defines the project's dependencies and scripts.
- **`README.md`**: Provides a detailed overview of the project, including setup and development instructions.
- **`src/database/schema.sql`**: Defines the database schema.

## Building and Running

### Prerequisites

- Node.js
- npm

### Installation

```bash
npm install
```

### Configuration

1.  Copy the `.env.example` file to `.env`.
2.  Update the `.env` file with your credentials for Supabase, Shopify, and SendGrid.

### Database Migration

The database migration must be run manually.

1.  Go to the Supabase SQL Editor.
2.  Copy the contents of `src/database/schema.sql`.
3.  Execute the SQL to create the necessary tables.

### Running the Application

-   **Development Mode:**

    ```bash
    npm run dev
    ```

-   **Production Mode:**

    ```bash
    npm run build
    npm run start
    ```

-   **Run a Manual Scrape:**

    ```bash
    npm run scrape
    ```

### Testing

-   **Run all tests:**

    ```bash
    npm test
    ```

-   **Run tests with coverage:**

    ```bash
    npm test:coverage
    ```

## Development Conventions

-   The project uses TypeScript for static typing.
-   ESLint and Prettier are used for linting and code formatting.
-   The project follows a modular architecture, with clear separation of concerns.
-   The main orchestration logic is in `src/index.ts`.
-   Database interactions are handled in the `src/database/` directory.
-   Shopify interactions are handled in the `src/shopify/` directory.
-   Email functionality is handled in the `src/email/` directory.
