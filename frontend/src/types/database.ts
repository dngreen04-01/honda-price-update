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
      user_roles: {
        Row: {
          id: number
          name: 'superuser' | 'admin' | 'viewer'
          description: string | null
          created_at: string
        }
        Insert: {
          id?: number
          name: 'superuser' | 'admin' | 'viewer'
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          name?: 'superuser' | 'admin' | 'viewer'
          description?: string | null
          created_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          role_id: number
          invited_by: string | null
          invited_at: string | null
          last_login_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          role_id?: number
          invited_by?: string | null
          invited_at?: string | null
          last_login_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          role_id?: number
          invited_by?: string | null
          invited_at?: string | null
          last_login_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      user_invitations: {
        Row: {
          id: string
          email: string
          role_id: number
          invited_by: string
          status: 'pending' | 'accepted' | 'expired' | 'revoked'
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          role_id?: number
          invited_by: string
          status?: 'pending' | 'accepted' | 'expired' | 'revoked'
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          role_id?: number
          invited_by?: string
          status?: 'pending' | 'accepted' | 'expired' | 'revoked'
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: Record<string, never>
        Returns: string
      }
      has_role: {
        Args: { required_role: string }
        Returns: boolean
      }
      is_superuser: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience types for user management
export type UserRole = Database['public']['Tables']['user_roles']['Row']
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type UserInvitation = Database['public']['Tables']['user_invitations']['Row']

// Extended types with joined data
export interface UserProfileWithRole extends UserProfile {
  role?: UserRole
  invited_by_email?: string
}

export interface UserInvitationWithDetails extends UserInvitation {
  role?: UserRole
  invited_by_email?: string
}
