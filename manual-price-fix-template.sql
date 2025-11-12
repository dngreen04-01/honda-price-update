-- Manual Price Fix Template
-- Use this to update incorrect prices for products after manual verification
--
-- INSTRUCTIONS:
-- 1. Visit the product page manually in your browser
-- 2. Note the actual price displayed
-- 3. Copy the product URL
-- 4. Update the template below with actual values
-- 5. Run against your database

-- Example: EU20I-EU22I-GENERATOR-SERVICE-KIT
-- URL: https://www.hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit
-- Actual Price: $44.00

BEGIN;

-- Update the product_pages table
UPDATE product_pages
SET
  latest_sale_price = 44.00,  -- Update this with actual price
  latest_original_price = NULL,  -- Update if there's an original price
  confidence = 'high',  -- Mark as high confidence (manually verified)
  updated_at = NOW()
WHERE
  canonical_url = 'https://hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit'  -- Update this URL
  OR canonical_url LIKE '%eu20i-eu22i-generator-service-kit%';

-- Add a new price history entry to record the manual correction
INSERT INTO price_history (
  product_page_id,
  sale_price,
  original_price,
  currency,
  source,
  confidence,
  scraped_at,
  html_snippet
)
SELECT
  id,
  44.00,  -- Update with actual price
  NULL,   -- Update if there's an original price
  'NZD',
  'manual',  -- Mark as manual correction
  'high',
  NOW(),
  'Manual price verification - actual price from website'
FROM product_pages
WHERE
  canonical_url = 'https://hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit'
  OR canonical_url LIKE '%eu20i-eu22i-generator-service-kit%';

COMMIT;

-- Verify the update
SELECT
  sku,
  name,
  canonical_url,
  latest_sale_price,
  confidence,
  updated_at
FROM product_pages
WHERE
  canonical_url = 'https://hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit'
  OR canonical_url LIKE '%eu20i-eu22i-generator-service-kit%';

-- ================================================================================
-- BULK UPDATE TEMPLATE (for multiple products)
-- ================================================================================

-- Template for updating multiple products at once
-- Copy and customize this section for each product

/*
-- Product 1: [PRODUCT NAME]
UPDATE product_pages SET latest_sale_price = [PRICE], confidence = 'high', updated_at = NOW()
WHERE canonical_url LIKE '%[product-slug]%';

-- Product 2: [PRODUCT NAME]
UPDATE product_pages SET latest_sale_price = [PRICE], confidence = 'high', updated_at = NOW()
WHERE canonical_url LIKE '%[product-slug]%';

-- Product 3: [PRODUCT NAME]
UPDATE product_pages SET latest_sale_price = [PRICE], confidence = 'high', updated_at = NOW()
WHERE canonical_url LIKE '%[product-slug]%';
*/

-- ================================================================================
-- QUERY TO FIND ALL PROBLEMATIC PRODUCTS
-- ================================================================================

-- Run this query to see all products with suspicious price differences
-- This helps identify which products need manual verification

SELECT
  pp.sku,
  pp.name,
  pp.canonical_url,
  pp.latest_sale_price as supplier_price,
  sm.price as shopify_price,
  ABS(pp.latest_sale_price - sm.price) as price_difference,
  ROUND(ABS((pp.latest_sale_price - sm.price) / NULLIF(sm.price, 0)) * 100, 2) as difference_percent,
  pp.confidence,
  pp.updated_at
FROM product_pages pp
JOIN shopify_metafields sm ON pp.shopify_metafield_id = sm.id
WHERE
  pp.latest_sale_price IS NOT NULL
  AND sm.price IS NOT NULL
  AND pp.latest_sale_price != sm.price
  AND (
    -- Large price difference (>$500 or >500%)
    ABS(pp.latest_sale_price - sm.price) > 500
    OR ABS((pp.latest_sale_price - sm.price) / NULLIF(sm.price, 0)) * 100 > 500

    -- OR suspicious patterns (round number + small price + big difference)
    OR (
      (pp.latest_sale_price > 100 AND MOD(pp.latest_sale_price::integer, 100) = 0)
      AND sm.price < 100
      AND ABS((pp.latest_sale_price - sm.price) / NULLIF(sm.price, 0)) * 100 > 100
    )
    OR (
      (sm.price > 100 AND MOD(sm.price::integer, 100) = 0)
      AND pp.latest_sale_price < 100
      AND ABS((pp.latest_sale_price - sm.price) / NULLIF(sm.price, 0)) * 100 > 100
    )
  )
ORDER BY ABS(pp.latest_sale_price - sm.price) DESC
LIMIT 100;
