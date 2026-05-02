import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

interface ShipmentPublic {
  id: string
  file_number: string
  supplier: string
  client_name: string
  awb?: string
  packages?: number
  weight_kg?: number
  arrival_date?: string
  agent?: string
  origin?: string
  delivery_address?: string
  eori_number?: string
  vat_number?: string
  contact_name?: string
  contact_phone?: string
  consignee_confirmed: boolean
}

export default function ConfirmPage() {
  const router = useRouter()
  const { token } = router.query
  const [shipment, setShipment] = useState<ShipmentPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [form, setForm] = useState({
    delivery_address: '',
    eori_number: '',
    vat_number: '',
    contact_name: '',
    contact_phone: '',
    confirm_invoice: false,
    confirm_mandate: false,
    confirm_address: false,
  })

  useEffect(() => {
    if (!token) return
    fetch(`/api/confirm/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError('Shipment not found or link expired.'); setLoading(false); return }
        setShipment(data)
        setForm(f => ({
          ...f,
          delivery_address: data.delivery_address || '',
          eori_number: data.eori_number || '',
          vat_number: data.vat_number || '',
          contact_name: data.contact_name || '',
          contact_phone: data.contact_phone || '',
        }))
        setLoading(false)
      })
      .catch(() => { setError('Failed to load shipment.'); setLoading(false) })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.confirm_invoice || !form.confirm_mandate || !form.confirm_address) {
      alert('Please check all confirmation boxes before submitting.')
      return
    }
    setSubmitting(true)
    const res = await fetch(`/api/confirm/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delivery_address: form.delivery_address,
        eori_number: form.eori_number,
        vat_number: form.vat_number,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (data.success) setSubmitted(true)
    else setError(data.error || 'Submission failed')
  }

  const inputClass = "w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 placeholder-slate-500"
  const labelClass = "block text-xs text-slate-400 uppercase tracking-wide mb-1.5 font-medium"

  if (loading) return (
    <div style={{ background: '#0f1b2d', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontFamily: 'Arial, sans-serif' }}>
      Loading shipment details…
    </div>
  )

  if (error) return (
    <div style={{ background: '#0f1b2d', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: '#1a2d45', border: '1px solid #ef4444', borderRadius: 12, padding: '32px', maxWidth: 400, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
        <div style={{ color: '#f87171', fontSize: 16 }}>{error}</div>
      </div>
    </div>
  )

  if (submitted) return (
    <div style={{ background: '#0f1b2d', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: '#1a2d45', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 12, padding: '40px', maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ color: '#e2e8f0', fontSize: 22, marginBottom: 8 }}>Confirmed — Thank you!</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7 }}>
          Your details for shipment <strong style={{ color: '#60a5fa' }}>{shipment?.file_number}</strong> have been received.<br />
          Our team will be in touch shortly to arrange clearance and delivery.
        </p>
      </div>
    </div>
  )

  return (
    <>
      <Head>
        <title>Confirm Shipment — FreightFlow</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ background: '#0f1b2d', minHeight: '100vh', fontFamily: 'Arial, sans-serif', padding: '32px 16px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ color: '#3b82f6', fontSize: 22, fontWeight: 700 }}>✈ FreightFlow</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Consignee Confirmation Portal</div>
          </div>

          <h1 style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Please confirm your shipment</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
            Your freight forwarder has a shipment ready for customs clearance. Please verify the details below and complete the form to proceed.
          </p>

          {/* Shipment info card */}
          {shipment && (
            <div style={{ background: '#1a2d45', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 16 }}>Shipment Reference</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  ['File #', shipment.file_number],
                  ['AWB', shipment.awb || '—'],
                  ['Supplier', shipment.supplier],
                  ['Agent', shipment.agent || '—'],
                  ['Packages', shipment.packages ? `${shipment.packages} pkg` : '—'],
                  ['Weight', shipment.weight_kg ? `${shipment.weight_kg.toLocaleString()} kg` : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, color: label === 'File #' ? '#60a5fa' : '#e2e8f0', fontFamily: label === 'AWB' ? 'monospace' : 'inherit' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ background: '#1a2d45', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600, marginBottom: 18 }}>Your Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Delivery Address *</label>
                  <textarea required value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))}
                    placeholder="Full delivery address including postcode and city"
                    style={{ width: '100%', background: '#243d5e', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 80, fontFamily: 'Arial', boxSizing: 'border-box' }}
                  />
                </div>
                {[
                  ['Contact Name', 'contact_name', 'Receiving contact person'],
                  ['Contact Phone', 'contact_phone', '+33 ...'],
                  ['EORI Number', 'eori_number', 'FR...'],
                  ['VAT Number', 'vat_number', 'FR...'],
                ].map(([label, field, placeholder]) => (
                  <div key={field}>
                    <label style={{ display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</label>
                    <input type="text" value={(form as any)[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width: '100%', background: '#243d5e', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Confirmations */}
            <div style={{ background: '#1a2d45', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600, marginBottom: 16 }}>Confirmations Required</div>
              {[
                ['confirm_invoice', 'I confirm the Commercial Invoice reflects the correct value and description of goods'],
                ['confirm_mandate', 'I have signed the customs mandate authorising your company to act as our customs representative'],
                ['confirm_address', 'I confirm the delivery address above is correct and accessible for freight delivery'],
              ].map(([field, text]) => (
                <label key={field} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, cursor: 'pointer' }}>
                  <div onClick={() => setForm(f => ({ ...f, [field]: !(f as any)[field] }))}
                    style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${(form as any)[field] ? '#22c55e' : '#475569'}`, background: (form as any)[field] ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {(form as any)[field] && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{text}</span>
                </label>
              ))}
            </div>

            <button type="submit" disabled={submitting}
              style={{ width: '100%', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, transition: 'all 0.15s' }}>
              {submitting ? 'Submitting…' : '✅ Submit Confirmation'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#475569', marginTop: 16, lineHeight: 1.6 }}>
              Your information is transmitted securely to your freight forwarder only.<br />
              This link is unique to your shipment and expires after use.
            </p>
          </form>
        </div>
      </div>
    </>
  )
}
