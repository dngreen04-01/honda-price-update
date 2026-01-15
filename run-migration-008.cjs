const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://fpuhbowlnupfalcgikyz.supabase.co",
  ""
);

async function runMigration() {
  const statements = [
    "ALTER TABLE shopify_catalog_cache ADD COLUMN IF NOT EXISTS product_status TEXT DEFAULT 'active'",
    "ALTER TABLE shopify_catalog_cache ADD COLUMN IF NOT EXISTS discontinued_at TIMESTAMPTZ",
    "ALTER TABLE shopify_catalog_cache ADD COLUMN IF NOT EXISTS discontinued_reason TEXT"
  ];
  
  for (const sql of statements) {
    console.log("Running:", sql.substring(0, 80) + "...");
    try {
      const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql });
      if (error) {
        console.log("RPC error:", error.message);
      } else {
        console.log("Success!");
      }
    } catch (e) {
      console.log("Caught:", e.message);
    }
  }
  
  console.log("Migration complete!");
}

runMigration().catch(console.error);
