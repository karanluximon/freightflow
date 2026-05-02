import type { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient, CHECKLIST_LABELS } from '@/lib/supabase'
import { sendArrivalEmail, sendDocsReminderEmail, sendCustomsClearedEmail } from '@/lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createServiceClient()
  const { shipmentId, template, customSubject, customBody } = req.body

  // Fetch shipment
  const { data: shipment, error } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', shipmentId)
    .single()

  if (error || !shipment) return res.status(404).json({ error: 'Shipment not found' })
  if (!shipment.client_email) return res.status(400).json({ error: 'No email address for this consignee' })

  try {
    let result

    if (template === 'arrival') {
      result = await sendArrivalEmail(shipment)
    } else if (template === 'docs_reminder') {
      const missing = Object.entries(shipment.checklist)
        .filter(([, v]) => !v)
        .map(([k]) => CHECKLIST_LABELS[k as keyof typeof CHECKLIST_LABELS])
        .filter(Boolean)
      result = await sendDocsReminderEmail(shipment, missing)
    } else if (template === 'customs_cleared') {
      result = await sendCustomsClearedEmail(shipment)
    } else if (template === 'custom' && customSubject && customBody) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      result = await resend.emails.send({
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to: shipment.client_email,
        subject: customSubject,
        text: customBody,
      })
    } else {
      return res.status(400).json({ error: 'Unknown template' })
    }

    // Log the email
    await supabase.from('email_log').insert({
      shipment_id: shipmentId,
      recipient: shipment.client_email,
      subject: template,
      template,
      status: 'sent',
    })

    await supabase.from('activity_log').insert({
      shipment_id: shipmentId,
      action: 'EMAIL_SENT',
      detail: `Email template "${template}" sent to ${shipment.client_email}`,
    })

    return res.status(200).json({ success: true, data: result })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
