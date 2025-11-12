import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkUrls() {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('source_url_canonical, product_title')
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Sample URLs in database:\n');
  data.forEach(row => {
    console.log(`${row.product_title}`);
    console.log(`  URL: ${row.source_url_canonical}\n`);
  });
}

checkUrls();
