import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkSchema() {
  const { data, error } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Columns in shopify_catalog_cache:');
  if (data && data.length > 0) {
    console.log(Object.keys(data[0]).sort());
  }
}

checkSchema();
