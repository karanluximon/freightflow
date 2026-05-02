import type { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServiceClient()
  const { id } = req.query

  // GET single shipment
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return res.status(404).json({ error: 'Shipment not found' })
    return res.status(200).json(data)
  }

  // PATCH update shipment fields
  if (req.method === 'PATCH') {
    const body = req.body
    const { data: current } = await supabase
      .from('shipments')
      .select('status, checklist')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('shipments')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Log status changes
    if (body.status && body.status !== current?.status) {
      await supabase.from('activity_log').insert({
        shipment_id: id,
        action: 'STATUS_CHANGED',
        detail: `Status changed from "${current?.status}" to "${body.status}"`,
      })
    }

    return res.status(200).json(data)
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { error } = await supabase.from('shipments').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
