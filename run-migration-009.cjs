require('dotenv').config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runMigration() {
  console.log('🔄 Running migration 009: Add crawl discovery tables...\n');

  const statements = [
    // Create crawl_runs table
    `CREATE TABLE IF NOT EXISTS crawl_runs (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'running',
      sites_crawled TEXT[],
      urls_discovered INTEGER DEFAULT 0,
      new_products_found INTEGER DEFAULT 0,
      new_offers_found INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    // Create discovered_products table
    `CREATE TABLE IF NOT EXISTS discovered_products (
      id SERIAL PRIMARY KEY,
      crawl_run_id INTEGER REFERENCES crawl_runs(id),
      url TEXT NOT NULL,
      url_canonical TEXT NOT NULL,
      domain TEXT NOT NULL,
      page_title TEXT,
      detected_price DECIMAL(10,2),
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMP,
      reviewed_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(url_canonical)
    )`,

    // Create indexes
    "CREATE INDEX IF NOT EXISTS idx_discovered_products_status ON discovered_products(status)",
    "CREATE INDEX IF NOT EXISTS idx_discovered_products_domain ON discovered_products(domain)",
    "CREATE INDEX IF NOT EXISTS idx_crawl_runs_status ON crawl_runs(status)"
  ];

  for (const sql of statements) {
    const preview = sql.replace(/\s+/g, ' ').substring(0, 60);
    console.log("Running:", preview + "...");
    try {
      const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql });
      if (error) {
        console.log("⚠️  RPC error:", error.message);
        console.log("   You may need to run this in Supabase Dashboard SQL Editor");
      } else {
        console.log("✅ Success!");
      }
    } catch (e) {
      console.log("❌ Caught:", e.message);
    }
  }

  // Verify tables exist
  console.log('\n📊 Verifying migration...');

  try {
    const { data: crawlRuns, error: crawlError } = await supabase
      .from('crawl_runs')
      .select('id')
      .limit(1);

    if (crawlError && crawlError.code !== 'PGRST116') {
      console.log('⚠️  crawl_runs table verification:', crawlError.message);
    } else {
      console.log('✅ crawl_runs table exists');
    }

    const { data: discovered, error: discoveredError } = await supabase
      .from('discovered_products')
      .select('id')
      .limit(1);

    if (discoveredError && discoveredError.code !== 'PGRST116') {
      console.log('⚠️  discovered_products table verification:', discoveredError.message);
    } else {
      console.log('✅ discovered_products table exists');
    }
  } catch (e) {
    console.log('⚠️  Verification error:', e.message);
  }

  console.log("\n🎉 Migration 009 complete!");
  console.log('\nIf RPC errors occurred, run migrations/009_add_crawl_discovery.sql');
  console.log('manually in Supabase Dashboard → SQL Editor');
}

runMigration().catch(console.error);
