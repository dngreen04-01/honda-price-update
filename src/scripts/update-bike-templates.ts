#!/usr/bin/env node

/**
 * One-time script to update theme template for bike products
 *
 * Changes products where:
 * - product_type = "bike"
 * - templateSuffix = "motorbikes"
 *
 * To:
 * - templateSuffix = "motorbike-no-buy"
 *
 * Usage:
 *   npx tsx src/scripts/update-bike-templates.ts           # Execute changes
 *   npx tsx src/scripts/update-bike-templates.ts --dry-run # Preview only
 */

import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const DRY_RUN = process.argv.includes('--dry-run');

interface ProductNode {
  id: string;
  title: string;
  productType: string;
  templateSuffix: string | null;
}

interface ProductsQueryResponse {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    edges: Array<{
      node: ProductNode;
    }>;
  };
}

interface ProductUpdateResponse {
  productUpdate: {
    product: {
      id: string;
      templateSuffix: string;
    } | null;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(
    `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.shopify.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { data?: T; errors?: unknown[] };

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

async function getAllBikeProducts(): Promise<ProductNode[]> {
  const query = `
    query getProductsByType($query: String!, $cursor: String) {
      products(first: 100, after: $cursor, query: $query) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            productType
            templateSuffix
          }
        }
      }
    }
  `;

  const products: ProductNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const data: ProductsQueryResponse = await graphqlRequest<ProductsQueryResponse>(query, {
      query: 'product_type:bike',
      cursor,
    });

    for (const edge of data.products.edges) {
      products.push(edge.node);
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return products;
}

async function updateProductTemplate(productId: string, newTemplate: string): Promise<boolean> {
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          templateSuffix
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await graphqlRequest<ProductUpdateResponse>(mutation, {
    input: {
      id: productId,
      templateSuffix: newTemplate,
    },
  });

  if (data.productUpdate.userErrors.length > 0) {
    logger.error('Update failed', {
      productId,
      errors: data.productUpdate.userErrors,
    });
    return false;
  }

  return true;
}

async function main(): Promise<void> {
  logger.info('=== Update Bike Product Templates ===');
  logger.info(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  logger.info('');

  // Step 1: Fetch all bike products
  logger.info('Fetching all products with product_type:bike...');
  const allBikeProducts = await getAllBikeProducts();
  logger.info(`Found ${allBikeProducts.length} bike products total`);

  // Step 2: Filter to those with templateSuffix = "motorbikes"
  const productsToUpdate = allBikeProducts.filter(
    p => p.templateSuffix === 'motorbikes'
  );

  logger.info(`Found ${productsToUpdate.length} products with template "motorbikes"`);
  logger.info('');

  if (productsToUpdate.length === 0) {
    logger.info('No products need updating. Exiting.');
    return;
  }

  // Step 3: Show what will be updated
  logger.info('Products to update:');
  for (const product of productsToUpdate) {
    logger.info(`  - ${product.title} (${product.id})`);
  }
  logger.info('');

  if (DRY_RUN) {
    logger.info('DRY RUN complete. No changes made.');
    logger.info(`Run without --dry-run to update ${productsToUpdate.length} products.`);
    return;
  }

  // Step 4: Update each product
  let success = 0;
  let failed = 0;

  for (const product of productsToUpdate) {
    logger.info(`Updating: ${product.title}...`);

    try {
      const updated = await updateProductTemplate(product.id, 'motorbike-no-buy');

      if (updated) {
        success++;
        logger.info(`  ✅ Updated to "motorbike-no-buy"`);
      } else {
        failed++;
        logger.error(`  ❌ Failed to update`);
      }
    } catch (error) {
      failed++;
      logger.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Rate limiting: 500ms between updates
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Step 5: Summary
  logger.info('');
  logger.info('=== Summary ===');
  logger.info(`Total products found: ${productsToUpdate.length}`);
  logger.info(`Successfully updated: ${success}`);
  logger.info(`Failed: ${failed}`);
}

// Run if called directly
main().catch(error => {
  logger.error('Script failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
