import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('Adding product_title, variant_title, and variant_sku columns...\n');

  try {
    // First, let's check current columns
    const { data: sample } = await supabase
      .from('shopify_catalog_cache')
      .select('*')
      .limit(1);

    if (sample && sample.length > 0) {
      const columns = Object.keys(sample[0]);
      console.log('Current columns:', columns.join(', '));

      if (columns.includes('product_title')) {
        console.log('\n✅ Columns already exist!');
        return;
      }
    }

    console.log('\n⚠️  Columns need to be added via Supabase SQL Editor');
    console.log('\nPlease run this SQL in Supabase SQL Editor:');
    console.log('--------------------------------------------------');
    console.log(`
ALTER TABLE shopify_catalog_cache
  ADD COLUMN IF NOT EXISTS product_title TEXT,
  ADD COLUMN IF NOT EXISTS variant_title TEXT,
  ADD COLUMN IF NOT EXISTS variant_sku TEXT;

CREATE INDEX IF NOT EXISTS idx_shopify_catalog_product_title ON shopify_catalog_cache(product_title);
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_variant_sku ON shopify_catalog_cache(variant_sku);
    `);
    console.log('--------------------------------------------------\n');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

runMigration().then(() => process.exit(0));
