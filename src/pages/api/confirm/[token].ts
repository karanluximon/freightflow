import type { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServiceClient()
  const { token } = req.query

  // GET - look up shipment by consignee token (public, no auth)
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shipments')
      .select('id, file_number, supplier, client_name, awb, packages, weight_kg, arrival_date, agent, origin, delivery_address, eori_number, vat_number, contact_name, contact_phone, consignee_confirmed, checklist')
      .eq('consignee_token', token)
      .single()

    if (error) return res.status(404).json({ error: 'Shipment not found' })
    return res.status(200).json(data)
  }

  // POST - consignee submits their details
  if (req.method === 'POST') {
    const { delivery_address, eori_number, vat_number, contact_name, contact_phone } = req.body

    // Find shipment by token
    const { data: shipment } = await supabase
      .from('shipments')
      .select('id, checklist, file_number')
      .eq('consignee_token', token)
      .single()

    if (!shipment) return res.status(404).json({ error: 'Invalid token' })

    // Update consignee fields and mark confirmed
    const updatedChecklist = {
      ...shipment.checklist,
      consignee_ok: true,
    }

    const { data, error } = await supabase
      .from('shipments')
      .update({
        delivery_address,
        eori_number,
        vat_number,
        contact_name,
        contact_phone,
        consignee_confirmed: true,
        consignee_confirmed_at: new Date().toISOString(),
        checklist: updatedChecklist,
        status: 'Docs Pending', // auto-advance from New File
      })
      .eq('consignee_token', token)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Log activity
    await supabase.from('activity_log').insert({
      shipment_id: shipment.id,
      action: 'CONSIGNEE_CONFIRMED',
      detail: `Consignee confirmed details for ${shipment.file_number}`,
    })

    return res.status(200).json({ success: true, file_number: shipment.file_number })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
