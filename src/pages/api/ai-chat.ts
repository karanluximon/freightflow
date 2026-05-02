import type { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient, getProgress } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createServiceClient()
  const { messages } = req.body

  // Fetch live shipment data for context
  const { data: shipments } = await supabase
    .from('shipments')
    .select('*')
    .neq('status', 'Complete')
    .order('created_at', { ascending: false })
    .limit(50)

  const context = (shipments || []).map((s: any) =>
    `${s.file_number}: ${s.status} | ${s.client_name} | ${s.supplier} | ${s.agent || 'no agent'} | AWB:${s.awb || 'N/A'} | ${s.packages || 0}pkg ${s.weight_kg || 0}kg | Progress:${getProgress(s.checklist)}% | Email:${s.client_email || 'none'}`
  ).join('\n')

  const systemPrompt = `You are an AI assistant for FreightFlow, a freight import management platform handling shipments into France. You help freight forwarders track files, identify what's urgent, draft emails, and answer import/customs questions.

Current live shipments:
${context || 'No live shipments at this time.'}

Be concise and practical. When asked what's urgent, highlight shipments with low progress % or missing docs. When drafting emails, be professional and in French or English as appropriate.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })

    const data = await response.json()
    const text = data.content?.map((c: any) => c.text || '').join('') || 'No response.'
    return res.status(200).json({ reply: text })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
