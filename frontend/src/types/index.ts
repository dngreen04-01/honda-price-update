export interface PriceChange {
  id: number
  product_page_id: number
  canonical_url: string
  domain_url: string
  old_price: number | null
  new_price: number | null
  price_change: number
  price_change_percent: number
  changed_at: string
  confidence: 'high' | 'low'
}

export interface ScrapingTask {
  domain: string
  domain_id: number
  status: 'success' | 'failure' | 'running'
  products_found: number
  prices_extracted: number
  extraction_rate: number
  confidence_high: number
  confidence_low: number
  llm_fallback_count: number
  deterministic_count: number
  last_run_at: string
  duration_seconds: number | null
  error_message: string | null
}

export interface ShopifyUpdate {
  id: number
  shopify_variant_id: string
  shopify_product_id: string
  canonical_url: string
  old_price: number | null
  new_price: number | null
  old_compare_at_price: number | null
  new_compare_at_price: number | null
  last_synced_at: string
  sync_status: 'success' | 'failed' | 'skipped'
}

export interface ReconciliationItem {
  id: number
  run_id: string
  product_type: 'supplier_only' | 'shopify_only'
  canonical_url: string
  status: 'active' | 'redirect' | '404' | 'pending'
  detected_at: string
  resolved_at: string | null
}

export interface ActionItem {
  id: string
  type: 'supplier_only' | 'shopify_only' | 'discontinued' | 'price_mismatch' | 'extraction_failed'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  url: string | null
  detected_at: string
  action_required: string
}

export interface DashboardStats {
  total_products: number
  total_suppliers: number
  last_scrape_at: string | null
  scrape_status: 'success' | 'failure' | 'running' | 'idle'
  products_scraped_today: number
  prices_updated_today: number
  supplier_only_count: number
  shopify_only_count: number
  extraction_success_rate: number
  high_confidence_rate: number
}
