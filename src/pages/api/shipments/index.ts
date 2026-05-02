import type { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServiceClient()

  // GET all shipments
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST create new shipment
  if (req.method === 'POST') {
    const body = req.body
    const { data, error } = await supabase
      .from('shipments')
      .insert({
        supplier: body.supplier,
        client_name: body.client_name,
        client_email: body.client_email,
        status: body.status || 'New File',
        awb: body.awb,
        house_awb: body.house_awb,
        agent: body.agent,
        origin: body.origin,
        flight_vessel: body.flight_vessel,
        packages: body.packages,
        weight_kg: body.weight_kg,
        arrival_date: body.arrival_date || null,
        delivery_address: body.delivery_address,
        notes: body.notes,
        quotation: body.quotation,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Log activity
    await supabase.from('activity_log').insert({
      shipment_id: data.id,
      action: 'FILE_OPENED',
      detail: `File ${data.file_number} opened for ${data.client_name}`,
    })

    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
