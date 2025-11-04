// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'

interface PriceChange {
  id: number
  product_page_id: number
  canonical_url: string
  domain_url: string
  current_price: number | null
  previous_price: number | null
  price_change: number
  price_change_percent: number
  changed_at: string
}

export const PriceChanges: React.FC = () => {
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPriceChanges()
  }, [])

  const loadPriceChanges = async () => {
    try {
      // Get all products with their latest two price entries
      const { data: products } = await supabase
        .from('product_pages')
        .select(`
          id,
          canonical_url,
          latest_sale_price,
          domains (root_url)
        `)
        .not('latest_sale_price', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(50)

      if (!products) return

      const changes: PriceChange[] = []

      for (const product of products) {
        const { data: history } = await supabase
          .from('price_history')
          .select('sale_price, scraped_at')
          .eq('product_page_id', product.id)
          .order('scraped_at', { ascending: false })
          .limit(2)

        if (history && history.length >= 2) {
          const current = history[0].sale_price
          const previous = history[1].sale_price

          if (current !== previous && current !== null && previous !== null) {
            const change = current - previous
            const changePercent = (change / previous) * 100

            changes.push({
              id: product.id,
              product_page_id: product.id,
              canonical_url: product.canonical_url,
              domain_url: (product as any).domains?.root_url || '',
              current_price: current,
              previous_price: previous,
              price_change: change,
              price_change_percent: changePercent,
              changed_at: history[0].scraped_at,
            })
          }
        }
      }

      changes.sort((a, b) =>
        new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
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
        <p className="text-muted-foreground">Track price updates across all suppliers</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Price Changes</CardTitle>
          <CardDescription>
            {priceChanges.length} changes detected in the last scrape
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
                    <p className="text-sm font-medium truncate">{change.canonical_url}</p>
                    <p className="text-xs text-muted-foreground">{change.domain_url}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(change.changed_at), 'PPp')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right">
                      <p className="text-sm line-through text-muted-foreground">
                        ${change.previous_price?.toFixed(2)}
                      </p>
                      <p className="text-lg font-bold">
                        ${change.current_price?.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {change.price_change > 0 ? (
                        <>
                          <TrendingUp className="h-5 w-5 text-red-600" />
                          <span className="text-sm font-medium text-red-600">
                            +{change.price_change_percent.toFixed(1)}%
                          </span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">
                            {change.price_change_percent.toFixed(1)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No price changes detected
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
