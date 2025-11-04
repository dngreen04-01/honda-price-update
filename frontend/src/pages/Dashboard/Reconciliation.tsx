// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { AlertTriangle, Package, ShoppingCart, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

interface ReconcileItem {
  id: number
  run_id: string
  product_type: 'supplier_only' | 'shopify_only'
  canonical_url: string
  status: 'active' | 'redirect' | '404' | 'pending'
  detected_at: string
  resolved_at: string | null
}

export const Reconciliation: React.FC = () => {
  const [items, setItems] = useState<ReconcileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'supplier_only' | 'shopify_only'>('all')

  useEffect(() => {
    loadReconciliationData()
  }, [])

  const loadReconciliationData = async () => {
    try {
      const { data } = await supabase
        .from('reconcile_results')
        .select('*')
        .is('resolved_at', null)
        .order('detected_at', { ascending: false })

      setItems(data || [])
    } catch (error) {
      console.error('Error loading reconciliation data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true
    return item.product_type === filter
  })

  const supplierOnlyCount = items.filter((i) => i.product_type === 'supplier_only').length
  const shopifyOnlyCount = items.filter((i) => i.product_type === 'shopify_only').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading reconciliation data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Catalog Reconciliation</h1>
        <p className="text-muted-foreground">
          Products that exist in one system but not the other
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Discrepancies</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
            <p className="text-xs text-muted-foreground">Unresolved items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Supplier Only</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{supplierOnlyCount}</div>
            <p className="text-xs text-muted-foreground">Not in Shopify</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shopify Only</CardTitle>
            <ShoppingCart className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shopifyOnlyCount}</div>
            <p className="text-xs text-muted-foreground">Not on supplier sites</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Discrepancies</CardTitle>
              <CardDescription>
                {filteredItems.length} items require attention
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-sm rounded-md ${
                  filter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('supplier_only')}
                className={`px-3 py-1 text-sm rounded-md ${
                  filter === 'supplier_only'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                Supplier Only
              </button>
              <button
                onClick={() => setFilter('shopify_only')}
                className={`px-3 py-1 text-sm rounded-md ${
                  filter === 'shopify_only'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                Shopify Only
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.product_type === 'supplier_only' ? (
                        <Package className="h-4 w-4 text-blue-600" />
                      ) : (
                        <ShoppingCart className="h-4 w-4 text-purple-600" />
                      )}
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {item.product_type.replace('_', ' ')}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          item.status === 'active'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : item.status === '404'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{item.canonical_url}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Detected: {format(new Date(item.detected_at), 'PP')}
                    </p>
                  </div>
                  <a
                    href={item.canonical_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No discrepancies found
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
