import type { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServiceClient()
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('shipment_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { action, detail } = req.body
    const { data, error } = await supabase
      .from('activity_log')
      .insert({ shipment_id: id, action, detail })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
