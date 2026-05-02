import type { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createServiceClient()

  const { data: shipments, error } = await supabase
    .from('shipments')
    .select('status, weight_kg, packages, checklist, created_at')

  if (error) return res.status(500).json({ error: error.message })

  const stats = {
    total: shipments.length,
    live: shipments.filter(s => s.status !== 'Complete').length,
    by_status: {} as Record<string, number>,
    total_weight_kg: shipments.reduce((a, s) => a + (s.weight_kg || 0), 0),
    total_packages: shipments.reduce((a, s) => a + (s.packages || 0), 0),
    needs_attention: shipments.filter(s => ['New File', 'Docs Pending'].includes(s.status)).length,
  }

  ;['New File', 'Docs Pending', 'Customs', 'Delivery', 'Complete', 'On Hold'].forEach(status => {
    stats.by_status[status] = shipments.filter(s => s.status === status).length
  })

  return res.status(200).json(stats)
}
