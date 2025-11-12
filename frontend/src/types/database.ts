export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      domains: {
        Row: {
          id: number
          root_url: string
          active: boolean
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          root_url: string
          active?: boolean
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          root_url?: string
          active?: boolean
          timezone?: string
          created_at?: string
          updated_at?: string
        }
      }
      product_pages: {
        Row: {
          id: number
          domain_id: number
          canonical_url: string
          latest_sale_price: number | null
          latest_original_price: number | null
          currency: string
          confidence: 'high' | 'low'
          html_snippet: string | null
          last_seen_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          domain_id: number
          canonical_url: string
          latest_sale_price?: number | null
          latest_original_price?: number | null
          currency?: string
          confidence?: 'high' | 'low'
          html_snippet?: string | null
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          domain_id?: number
          canonical_url?: string
          latest_sale_price?: number | null
          latest_original_price?: number | null
          currency?: string
          confidence?: 'high' | 'low'
          html_snippet?: string | null
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      price_history: {
        Row: {
          id: number
          product_page_id: number
          sale_price: number | null
          original_price: number | null
          currency: string
          source: 'deterministic' | 'llm'
          confidence: 'high' | 'low'
          html_snippet: string | null
          scraped_at: string
        }
        Insert: {
          id?: number
          product_page_id: number
          sale_price?: number | null
          original_price?: number | null
          currency?: string
          source?: 'deterministic' | 'llm'
          confidence?: 'high' | 'low'
          html_snippet?: string | null
          scraped_at?: string
        }
        Update: {
          id?: number
          product_page_id?: number
          sale_price?: number | null
          original_price?: number | null
          currency?: string
          source?: 'deterministic' | 'llm'
          confidence?: 'high' | 'low'
          html_snippet?: string | null
          scraped_at?: string
        }
      }
      offers: {
        Row: {
          id: number
          domain_id: number
          title: string
          summary: string | null
          start_date: string | null
          end_date: string | null
          offer_url: string
          last_seen_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          domain_id: number
          title: string
          summary?: string | null
          start_date?: string | null
          end_date?: string | null
          offer_url: string
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          domain_id?: number
          title?: string
          summary?: string | null
          start_date?: string | null
          end_date?: string | null
          offer_url?: string
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      shopify_catalog_cache: {
        Row: {
          id: number
          shopify_product_id: string
          shopify_variant_id: string
          source_url_canonical: string
          shopify_price: number | null
          shopify_compare_at_price: number | null
          product_title: string | null
          variant_title: string | null
          variant_sku: string | null
          last_synced_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          shopify_product_id: string
          shopify_variant_id: string
          source_url_canonical: string
          shopify_price?: number | null
          shopify_compare_at_price?: number | null
          product_title?: string | null
          variant_title?: string | null
          variant_sku?: string | null
          last_synced_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          shopify_product_id?: string
          shopify_variant_id?: string
          source_url_canonical?: string
          shopify_price?: number | null
          shopify_compare_at_price?: number | null
          product_title?: string | null
          variant_title?: string | null
          variant_sku?: string | null
          last_synced_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      reconcile_results: {
        Row: {
          id: number
          run_id: string
          product_type: 'supplier_only' | 'shopify_only'
          canonical_url: string
          status: 'active' | 'redirect' | '404' | 'pending'
          detected_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: number
          run_id: string
          product_type: 'supplier_only' | 'shopify_only'
          canonical_url: string
          status?: 'active' | 'redirect' | '404' | 'pending'
          detected_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: number
          run_id?: string
          product_type?: 'supplier_only' | 'shopify_only'
          canonical_url?: string
          status?: 'active' | 'redirect' | '404' | 'pending'
          detected_at?: string
          resolved_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
