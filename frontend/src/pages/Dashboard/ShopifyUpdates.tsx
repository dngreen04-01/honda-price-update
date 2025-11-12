// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { ShoppingCart, CheckCircle, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

interface ShopifyUpdate {
  id: number
  shopify_variant_id: string
  shopify_product_id: string
  source_url_canonical: string
  shopify_price: number | null
  shopify_compare_at_price: number | null
  last_synced_at: string
}

export const ShopifyUpdates: React.FC = () => {
  const [updates, setUpdates] = useState<ShopifyUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSynced: 0,
    syncedToday: 0,
    lastSync: null as string | null,
  })

  useEffect(() => {
    loadShopifyUpdates()
  }, [])

  const loadShopifyUpdates = async () => {
    try {
      const { data: allUpdates } = await supabase
        .from('shopify_catalog_cache')
        .select('*')
        .order('last_synced_at', { ascending: false })
        .limit(50)

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const syncedToday = allUpdates?.filter(
        (u) => new Date(u.last_synced_at) >= today
      ).length || 0

      setUpdates(allUpdates || [])
      setStats({
        totalSynced: allUpdates?.length || 0,
        syncedToday,
        lastSync: allUpdates?.[0]?.last_synced_at || null,
      })
    } catch (error) {
      console.error('Error loading Shopify updates:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading Shopify updates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Shopify Updates</h1>
        <p className="text-muted-foreground">Track price synchronization with Shopify</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSynced}</div>
            <p className="text-xs text-muted-foreground">In Shopify catalog</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Synced Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.syncedToday}</div>
            <p className="text-xs text-muted-foreground">Updates today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.lastSync ? format(new Date(stats.lastSync), 'HH:mm') : 'Never'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.lastSync ? format(new Date(stats.lastSync), 'PP') : 'No syncs yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Sync History</CardTitle>
          <CardDescription>Latest product synchronizations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {updates.length > 0 ? (
              updates.map((update) => (
                <div
                  key={update.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{update.source_url_canonical}</p>
                    <p className="text-xs text-muted-foreground">
                      Variant: {update.shopify_variant_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right">
                      {update.shopify_compare_at_price && (
                        <p className="text-xs line-through text-muted-foreground">
                          ${update.shopify_compare_at_price.toFixed(2)}
                        </p>
                      )}
                      <p className="text-sm font-medium">
                        ${update.shopify_price?.toFixed(2) || 'N/A'}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(update.last_synced_at), 'PP')}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No Shopify updates found
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
