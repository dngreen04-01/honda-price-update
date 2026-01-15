import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkStatus() {
  // Check how many products have null status
  const { data: nullStatus, error: err1 } = await supabase
    .from('shopify_catalog_cache')
    .select('id, product_status')
    .is('product_status', null);

  console.log('Products with NULL status:', nullStatus ? nullStatus.length : 0);

  // Check total products
  const { count, error: err2 } = await supabase
    .from('shopify_catalog_cache')
    .select('id', { count: 'exact', head: true });

  console.log('Total products:', count);

  // Check status distribution
  const { data: allProducts } = await supabase
    .from('shopify_catalog_cache')
    .select('product_status');

  const statusCounts = {};
  if (allProducts) {
    allProducts.forEach(p => {
      const status = p.product_status || 'NULL';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
  }
  console.log('Status distribution:', statusCounts);
}

checkStatus().then(() => process.exit(0));
