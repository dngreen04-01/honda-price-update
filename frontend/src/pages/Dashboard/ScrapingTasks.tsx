// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'

interface DomainStats {
  id: number
  root_url: string
  active: boolean
  total_products: number
  high_confidence: number
  low_confidence: number
  last_seen_at: string | null
}

export const ScrapingTasks: React.FC = () => {
  const [domains, setDomains] = useState<DomainStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDomainStats()
  }, [])

  const loadDomainStats = async () => {
    try {
      const { data: domainsData } = await supabase
        .from('domains')
        .select('id, root_url, active')
        .eq('active', true)

      if (!domainsData) return

      const stats = await Promise.all(
        domainsData.map(async (domain) => {
          const { data: products } = await supabase
            .from('product_pages')
            .select('confidence, last_seen_at')
            .eq('domain_id', domain.id)

          const highConfidence = products?.filter(p => p.confidence === 'high').length || 0
          const lowConfidence = products?.filter(p => p.confidence === 'low').length || 0
          const lastSeen = products?.[0]?.last_seen_at || null

          return {
            ...domain,
            total_products: products?.length || 0,
            high_confidence: highConfidence,
            low_confidence: lowConfidence,
            last_seen_at: lastSeen,
          }
        })
      )

      setDomains(stats)
    } catch (error) {
      console.error('Error loading domain stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading scraping tasks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scraping Tasks</h1>
        <p className="text-muted-foreground">Monitor scraping performance by supplier</p>
      </div>

      <div className="grid gap-4">
        {domains.map((domain) => {
          const successRate = domain.total_products > 0
            ? (domain.high_confidence / domain.total_products) * 100
            : 0

          return (
            <Card key={domain.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{domain.root_url}</CardTitle>
                    <CardDescription>
                      {domain.last_seen_at
                        ? `Last scraped: ${format(new Date(domain.last_seen_at), 'PPp')}`
                        : 'Never scraped'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {domain.active ? (
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Products</p>
                    <p className="text-2xl font-bold">{domain.total_products}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">High Confidence</p>
                    <p className="text-2xl font-bold text-green-600">{domain.high_confidence}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Low Confidence</p>
                    <p className="text-2xl font-bold text-yellow-600">{domain.low_confidence}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-bold">{successRate.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${successRate}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
