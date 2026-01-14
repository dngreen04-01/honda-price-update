// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

interface PriceChange {
  id: number
  canonical_url: string
  product_title: string | null
  variant_title: string | null
  variant_sku: string | null
  supplier_price: number | null
  shopify_price: number | null
  price_change: number
  price_change_percent: number
  last_scraped_at: string
}

export const PriceChanges: React.FC = () => {
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPriceChanges()
  }, [])

  const loadPriceChanges = async () => {
    try {
      // Get all products from shopify_catalog_cache where prices differ
      const { data: products } = await supabase
        .from('shopify_catalog_cache')
        .select('*')
        .not('scraped_sale_price', 'is', null)
        .not('shopify_price', 'is', null)
        .order('last_scraped_at', { ascending: false })

      if (!products) return

      const changes: PriceChange[] = []

      for (const product of products) {
        const supplierPrice = product.scraped_sale_price
        const shopifyPrice = product.shopify_price

        // Only include if prices differ by more than $0.01
        if (supplierPrice && shopifyPrice && Math.abs(shopifyPrice - supplierPrice) > 0.01) {
          const change = shopifyPrice - supplierPrice
          const changePercent = (change / supplierPrice) * 100

          changes.push({
            id: product.id,
            canonical_url: product.source_url_canonical,
            product_title: product.product_title,
            variant_title: product.variant_title,
            variant_sku: product.variant_sku,
            supplier_price: supplierPrice,
            shopify_price: shopifyPrice,
            price_change: change,
            price_change_percent: changePercent,
            last_scraped_at: product.last_scraped_at,
          })
        }
      }

      // Sort by absolute price difference (largest first)
      changes.sort((a, b) =>
        Math.abs(b.price_change) - Math.abs(a.price_change)
      )

      setPriceChanges(changes)
    } catch (error) {
      console.error('Error loading price changes:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading price changes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Price Changes</h1>
        <p className="text-muted-foreground">Products where supplier price differs from Shopify price</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Price Discrepancies</CardTitle>
          <CardDescription>
            {priceChanges.length} product{priceChanges.length !== 1 ? 's' : ''} with price differences detected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {priceChanges.length > 0 ? (
              priceChanges.map((change) => (
                <div
                  key={change.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    {change.product_title && (
                      <p className="text-sm font-medium">{change.product_title}</p>
                    )}
                    {change.variant_title && change.variant_title !== change.product_title && (
                      <p className="text-xs text-muted-foreground">{change.variant_title}</p>
                    )}
                    {change.variant_sku && (
                      <p className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded inline-block mt-1">
                        SKU: {change.variant_sku}
                      </p>
                    )}
                    <a
                      href={change.canonical_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 mt-1 truncate max-w-md"
                    >
                      <span className="truncate">{change.canonical_url}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                    {change.last_scraped_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last scraped: {format(new Date(change.last_scraped_at), 'PPp')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Supplier</p>
                      <p className="text-lg font-bold text-blue-600">
                        ${change.supplier_price?.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Shopify</p>
                      <p className="text-lg font-bold text-purple-600">
                        ${change.shopify_price?.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {change.price_change > 0 ? (
                        <>
                          <TrendingUp className="h-5 w-5 text-red-600" />
                          <span className="text-sm font-medium text-red-600">
                            +${change.price_change.toFixed(2)}
                          </span>
                          <span className="text-xs text-red-600">
                            (+{change.price_change_percent.toFixed(1)}%)
                          </span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">
                            -${Math.abs(change.price_change).toFixed(2)}
                          </span>
                          <span className="text-xs text-green-600">
                            ({change.price_change_percent.toFixed(1)}%)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No price discrepancies detected - all prices are in sync!
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
