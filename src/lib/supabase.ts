import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client with service role (for API routes)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Types
export type ShipmentStatus = 'New File' | 'Docs Pending' | 'Customs' | 'Delivery' | 'Complete' | 'On Hold'

export interface Shipment {
  id: string
  file_number: string
  status: ShipmentStatus
  awb?: string
  house_awb?: string
  agent?: string
  origin?: string
  supplier: string
  flight_vessel?: string
  packages?: number
  weight_kg?: number
  arrival_date?: string
  client_name: string
  client_email?: string
  delivery_address?: string
  eori_number?: string
  vat_number?: string
  contact_name?: string
  contact_phone?: string
  consignee_confirmed: boolean
  consignee_confirmed_at?: string
  notes?: string
  quotation?: string
  checklist: ChecklistState
  consignee_token: string
  created_at: string
  updated_at: string
}

export interface ChecklistState {
  invoice: boolean
  packing_list: boolean
  awb_received: boolean
  mandate: boolean
  consignee_ok: boolean
  customs_done: boolean
  delivery_scheduled: boolean
  invoice_sent: boolean
  payment_received: boolean
}

export const CHECKLIST_LABELS: Record<keyof ChecklistState, string> = {
  invoice: 'Commercial Invoice received',
  packing_list: 'Packing List received',
  awb_received: 'AWB / Bill of Lading received',
  mandate: 'Customs Mandate signed',
  consignee_ok: 'Consignee info confirmed',
  customs_done: 'Customs clearance complete',
  delivery_scheduled: 'Delivery scheduled',
  invoice_sent: 'Invoice sent to client',
  payment_received: 'Payment received',
}

export const STATUS_FLOW: ShipmentStatus[] = ['New File', 'Docs Pending', 'Customs', 'Delivery', 'Complete']

export function getProgress(checklist: ChecklistState): number {
  const vals = Object.values(checklist)
  return Math.round((vals.filter(Boolean).length / vals.length) * 100)
}
