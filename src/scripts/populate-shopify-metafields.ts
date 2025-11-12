#!/usr/bin/env node

import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';

/**
 * Populate Shopify product metafields from CSV
 * CSV format: Handle,Product Title,Vendor,Variant Price,Variant SKU,URL
 */
async function populateMetafields(csvPath: string, dryRun = true): Promise<void> {
  logger.info('=== Populating Shopify source_url metafields ===\n');

  if (dryRun) {
    logger.info('🔍 DRY RUN MODE - No changes will be made to Shopify');
    logger.info('   Run with --execute flag to apply changes\n');
  }

  try {
    // Read CSV file
    const csvContent = readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

    // Skip header
    const products = lines.slice(1).map(line => {
      // Parse CSV (handle quoted fields with commas)
      const fields: string[] = [];
      let currentField = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          fields.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }
      fields.push(currentField.trim()); // Add last field

      return {
        handle: fields[0],
        title: fields[1],
        vendor: fields[2],
        price: fields[3],
        sku: fields[4],
        url: fields[5],
      };
    });

    logger.info(`📄 Loaded ${products.length} products from CSV\n`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of products) {
      try {
        if (!product.url || !product.url.startsWith('http')) {
          logger.warn(`Skipping product with invalid URL: ${product.handle}`);
          skipped++;
          continue;
        }

        const canonicalUrl = canonicalizeUrl(product.url);

        logger.info(`Processing: ${product.title}`);
        logger.info(`  Handle: ${product.handle}`);
        logger.info(`  URL: ${canonicalUrl}`);

        if (dryRun) {
          logger.info(`  ✅ Would set source_url metafield`);
          updated++;
        } else {
          // Query Shopify for product by handle
          const query = `
            query getProductByHandle($handle: String!) {
              productByHandle(handle: $handle) {
                id
                title
                variants(first: 1) {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            }
          `;

          const response = await fetch(
            `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION || '2024-01'}/graphql.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
              },
              body: JSON.stringify({
                query,
                variables: { handle: product.handle },
              }),
            }
          );

          const data = await response.json();

          if (!data.data?.productByHandle) {
            logger.warn(`  ⚠️  Product not found in Shopify`);
            skipped++;
            continue;
          }

          const shopifyProduct = data.data.productByHandle;

          // Update product metafield
          const mutation = `
            mutation updateProductMetafield($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  metafield(namespace: "custom", key: "source_url") {
                    value
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const updateResponse = await fetch(
            `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION || '2024-01'}/graphql.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
              },
              body: JSON.stringify({
                query: mutation,
                variables: {
                  input: {
                    id: shopifyProduct.id,
                    metafields: [
                      {
                        namespace: 'custom',
                        key: 'source_url',
                        value: canonicalUrl,
                        type: 'single_line_text_field',
                      },
                    ],
                  },
                },
              }),
            }
          );

          const updateData = await updateResponse.json();

          if (updateData.data?.productUpdate?.userErrors?.length > 0) {
            logger.error(`  ❌ Failed: ${updateData.data.productUpdate.userErrors[0].message}`);
            failed++;
          } else {
            logger.info(`  ✅ Updated metafield`);
            updated++;
          }

          // Rate limiting - wait 500ms between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        logger.info('');
      } catch (error) {
        logger.error(`Failed to process product: ${product.handle}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    logger.info('\n=== Summary ===');
    logger.info(`Total products: ${products.length}`);
    logger.info(`Updated: ${updated}`);
    logger.info(`Skipped: ${skipped}`);
    logger.info(`Failed: ${failed}`);

    if (dryRun) {
      logger.info('\n💡 To apply these changes, run with --execute flag:');
      logger.info('   npx tsx src/scripts/populate-shopify-metafields.ts --execute');
    } else {
      logger.info('\n✅ Metafield population complete!');
      logger.info('   Run scraper to sync prices: npm run scrape');
    }
  } catch (error) {
    logger.error('Metafield population failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = !process.argv.includes('--execute');
  const csvPath = process.argv[2] || 'Products-Grid view (12).csv';

  populateMetafields(csvPath, dryRun)
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      logger.error('Script failed', { error: error.message });
      process.exit(1);
    });
}

export { populateMetafields };
