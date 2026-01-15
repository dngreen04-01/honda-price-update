import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function updateStatus() {
  console.log('Updating existing products to have product_status = active...');

  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .update({ product_status: 'active' })
    .is('product_status', null)
    .select('id');

  if (error) {
    console.error('Error:', error.message);
  } else {
    const count = data ? data.length : 0;
    console.log(`Updated ${count} products to active status`);
  }
}

updateStatus().then(() => process.exit(0));
