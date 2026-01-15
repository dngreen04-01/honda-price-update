import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('Checking for product_status column...\n');

  try {
    // First, let's check current columns
    const { data: sample } = await supabase
      .from('shopify_catalog_cache')
      .select('*')
      .limit(1);

    if (sample && sample.length > 0) {
      const columns = Object.keys(sample[0]);
      console.log('Current columns:', columns.join(', '));

      if (columns.includes('product_status')) {
        console.log('\n✅ product_status column already exists!');
        return;
      }
    }

    console.log('\n⚠️  Columns need to be added via Supabase SQL Editor');
    console.log('\nPlease run this SQL in Supabase SQL Editor:');
    console.log('--------------------------------------------------');
    console.log(`
-- Add product status tracking fields
ALTER TABLE shopify_catalog_cache
  ADD COLUMN IF NOT EXISTS product_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS discontinued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discontinued_reason TEXT;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_status ON shopify_catalog_cache(product_status);

-- Optional: Add check constraint for valid statuses
-- ALTER TABLE shopify_catalog_cache
--   ADD CONSTRAINT chk_product_status
--   CHECK (product_status IN ('active', 'inactive', 'discontinued'));
    `);
    console.log('--------------------------------------------------\n');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

runMigration().then(() => process.exit(0));
