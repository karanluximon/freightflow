import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import toast, { Toaster } from 'react-hot-toast'
import { TRUCKING_RATES, getTruckingRate, searchDepts } from '@/lib/trucking-rates'

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Package {
  qty: number
  length: number
  width: number
  height: number
  weight: number
}

interface QuoteForm {
  // Client
  client_name: string
  client_email: string
  // Shipment
  incoterm: 'EXW' | 'FOB' | 'DAP' | 'DDU' | 'DDP'
  origin: string
  goods_description: string
  goods_value: string
  agent: string
  airline: 'AF/KLM' | 'Other'
  // Delivery
  dept_code: string
  dept_name: string
  num_pallets: number
  pallet_type: 'p80' | 'p100'
  // Units
  weight_unit: 'kg' | 'lbs'
  dim_unit: 'cm' | 'in'
  // Options
  opt_insurance: boolean
  opt_t1: boolean
  opt_liftgate: boolean
  opt_appointment: boolean
  opt_usd: boolean
  opt_palletization: number
  // Notes
  notes: string
}

interface FeeItem {
  label: string
  amount: number
  note?: string
  optional?: boolean
}

// ─── RATES ────────────────────────────────────────────────────────────────────
const BASE_RATES = {
  file_fee: 55,
  handling_per_kg: 0.18,
  handling_min: 50,
  airline_default: 130,
  airline_afklm: 150,
  customs: 115,
  insurance_pct: 0.0045,
  insurance_min: 45,
  t1: 90,
  ddp_fixed: 75,
  ddp_outlay_pct: 0.01,
  liftgate: 45,
  palletization: 40,
  appointment: 50,
  usd_pct: 0.025,
  hayon_surcharge: 25,
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function calcVolWeight(p: Package, dimUnit: 'cm' | 'in'): number {
  let l = p.length, w = p.width, h = p.height
  if (dimUnit === 'in') { l *= 2.54; w *= 2.54; h *= 2.54 }
  return (l * w * h * p.qty) / 6000
}

function getChargeableWeight(packages: Package[], dimUnit: 'cm' | 'in', weightUnit: 'kg' | 'lbs') {
  const actual = packages.reduce((sum, p) => {
    let wt = p.weight * p.qty
    if (weightUnit === 'lbs') wt *= 0.453592
    return sum + wt
  }, 0)
  const vol = packages.reduce((sum, p) => sum + calcVolWeight(p, dimUnit), 0)
  return { actual, vol, chargeable: Math.max(actual, vol) }
}

function calcFees(form: QuoteForm, cw: number): FeeItem[] {
  const delivery = getTruckingRate(form.dept_code, form.pallet_type, form.num_pallets) || 0
  const hayonSurcharge = form.num_pallets <= 5 ? BASE_RATES.hayon_surcharge : 0
  const handling = Math.max(BASE_RATES.handling_min, cw * BASE_RATES.handling_per_kg)
  const airlineFee = form.airline === 'AF/KLM' ? BASE_RATES.airline_afklm : BASE_RATES.airline_default
  const goodsVal = parseFloat(form.goods_value) || 0
  const isDDP = form.incoterm === 'DDP'
  const isDDU = form.incoterm === 'DDU' || isDDP

  const fees: FeeItem[] = [
    { label: 'File fee', amount: BASE_RATES.file_fee },
    { label: `Handling (${cw.toFixed(1)} kg × €${BASE_RATES.handling_per_kg}, min €${BASE_RATES.handling_min})`, amount: handling },
    { label: `Airline fee (${form.airline})`, amount: airlineFee },
    { label: `Delivery — ${form.dept_name || form.dept_code} (${form.num_pallets} plt ${form.pallet_type === 'p80' ? '120×80' : '120×100'})`, amount: delivery },
  ]

  if (hayonSurcharge > 0) {
    fees.push({ label: 'Hayon surcharge (1–5 pallets)', amount: hayonSurcharge })
  }

  if (isDDU) {
    fees.push({ label: 'Customs clearance', amount: BASE_RATES.customs })
  }

  if (isDDP) {
    fees.push({ label: 'DDP outlay fee', amount: BASE_RATES.ddp_fixed, note: '+ 1% duties & taxes billed separately' })
  }

  if (form.opt_insurance) {
    fees.push({ label: 'Insurance (0.45% of goods value)', amount: goodsVal ? Math.max(BASE_RATES.insurance_min, goodsVal * BASE_RATES.insurance_pct) : BASE_RATES.insurance_min })
  }

  if (form.opt_t1) {
    fees.push({ label: 'T1 transit document', amount: BASE_RATES.t1 })
  }

  if (form.opt_liftgate) {
    fees.push({ label: 'Liftgate', amount: BASE_RATES.liftgate })
  }

  if (form.opt_appointment) {
    fees.push({ label: 'Delivery appointment', amount: BASE_RATES.appointment })
  }

  if (form.opt_palletization > 0) {
    fees.push({ label: `Palletization (${form.opt_palletization} plt)`, amount: form.opt_palletization * BASE_RATES.palletization })
  }

  if (form.opt_usd) {
    const sub = fees.reduce((s, f) => s + f.amount, 0)
    fees.push({ label: 'USD payment surcharge (2.5%)', amount: sub * BASE_RATES.usd_pct })
  }

  return fees
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function QuotesPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [packages, setPackages] = useState<Package[]>([{ qty: 1, length: 0, width: 0, height: 0, weight: 0 }])
  const [deptSearch, setDeptSearch] = useState('')
  const [deptSuggestions, setDeptSuggestions] = useState<{ code: string; name: string }[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [emailText, setEmailText] = useState('')
  const [savedQuotes, setSavedQuotes] = useState<any[]>([])
  const [showList, setShowList] = useState(false)

  const [form, setForm] = useState<QuoteForm>({
    client_name: '', client_email: '', incoterm: 'DAP', origin: '',
    goods_description: '', goods_value: '', agent: 'AGENTS USA',
    airline: 'Other', dept_code: '', dept_name: '', num_pallets: 1,
    pallet_type: 'p80', weight_unit: 'kg', dim_unit: 'cm',
    opt_insurance: false, opt_t1: false, opt_liftgate: false,
    opt_appointment: false, opt_usd: false, opt_palletization: 0,
    notes: '',
  })

  const set = (k: keyof QuoteForm) => (e: any) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const setVal = (k: keyof QuoteForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  const { actual, vol, chargeable } = getChargeableWeight(packages, form.dim_unit, form.weight_unit)
  const fees = form.dept_code ? calcFees(form, chargeable) : []
  const total = fees.reduce((s, f) => s + f.amount, 0)

  // Dept search
  useEffect(() => {
    if (deptSearch.length < 2) { setDeptSuggestions([]); return }
    setDeptSuggestions(searchDepts(deptSearch))
  }, [deptSearch])

  // AI email parser
  async function parseEmail() {
    if (!emailText.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Extract shipment quote request details from this email. Return ONLY valid JSON with these fields: client_name, client_email, origin, goods_description, goods_value_eur (number), incoterm (EXW/FOB/DAP/DDU/DDP), packages (array of {qty,length,width,height,weight,dim_unit,weight_unit}). Use null for missing fields.\n\nEmail:\n${emailText}`
          }]
        })
      })
      const data = await res.json()
      const text = data.reply || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        setForm(f => ({
          ...f,
          client_name: parsed.client_name || f.client_name,
          client_email: parsed.client_email || f.client_email,
          origin: parsed.origin || f.origin,
          goods_description: parsed.goods_description || f.goods_description,
          goods_value: parsed.goods_value_eur?.toString() || f.goods_value,
          incoterm: parsed.incoterm || f.incoterm,
          weight_unit: parsed.packages?.[0]?.weight_unit || f.weight_unit,
          dim_unit: parsed.packages?.[0]?.dim_unit || f.dim_unit,
        }))
        if (parsed.packages?.length) {
          setPackages(parsed.packages.map((p: any) => ({
            qty: p.qty || 1, length: p.length || 0, width: p.width || 0,
            height: p.height || 0, weight: p.weight || 0
          })))
        }
        toast.success('Details extracted! Review and continue.')
        setStep(2)
      }
    } catch {
      toast.error('Could not parse email. Please fill manually.')
    }
    setAiLoading(false)
  }

  function saveQuote() {
    const ref = `QT-${new Date().getFullYear()}-${String(savedQuotes.length + 1).padStart(3, '0')}`
    const quote = { ref, ...form, fees, total, chargeable, date: new Date().toLocaleDateString('fr-FR') }
    setSavedQuotes(q => [...q, quote])
    toast.success(`Quote ${ref} saved!`)
  }

  const inp = "w-full bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600"
  const lbl = "block text-xs text-slate-400 uppercase tracking-wide mb-1.5 font-medium"

  return (
    <>
      <Head><title>FreightFlow — Quotations</title></Head>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a2d45', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' } }} />
      <div className="min-h-screen bg-[#0f1b2d] text-slate-200">

        {/* Top nav */}
        <div className="bg-[#1a2d45] border-b border-white/8 px-6 py-3 flex items-center gap-4">
          <a href="/" className="text-slate-400 hover:text-slate-200 text-sm transition-colors">← Dashboard</a>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-medium">Quotations</span>
          <div className="ml-auto flex gap-3">
            <button onClick={() => setShowList(!showList)} className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
              {showList ? 'New Quote' : `All Quotes (${savedQuotes.length})`}
            </button>
          </div>
        </div>

        {showList ? (
          <div className="max-w-4xl mx-auto p-6">
            <h2 className="text-lg font-semibold mb-4">Saved Quotes</h2>
            {savedQuotes.length === 0 ? (
              <div className="text-center py-16 text-slate-500">No quotes saved yet</div>
            ) : (
              <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-white/4 border-b border-white/8">
                    {['Ref', 'Client', 'Origin', 'Incoterm', 'Dept', 'Cw.', 'Total', 'Date'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs text-slate-500 uppercase tracking-wide font-medium">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {savedQuotes.map(q => (
                      <tr key={q.ref} className="border-b border-white/5 hover:bg-white/4">
                        <td className="px-4 py-3 text-blue-300 font-medium">{q.ref}</td>
                        <td className="px-4 py-3 text-slate-300">{q.client_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-400">{q.origin || '—'}</td>
                        <td className="px-4 py-3"><span className="bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded text-xs font-semibold">{q.incoterm}</span></td>
                        <td className="px-4 py-3 text-slate-400">{q.dept_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-400">{q.chargeable?.toFixed(1)} kg</td>
                        <td className="px-4 py-3 font-semibold text-white">€{q.total?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-500">{q.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-6">

            {/* Steps */}
            <div className="flex items-center gap-0 mb-8">
              {[['1', 'Email / Request'], ['2', 'Shipment Details'], ['3', 'Quote Preview']].map(([n, label], i) => (
                <div key={n} className="flex items-center">
                  <button onClick={() => setStep(parseInt(n) as 1 | 2 | 3)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors
                      ${step === parseInt(n) ? 'bg-blue-500/20 text-blue-300 font-medium' : 'text-slate-500 hover:text-slate-300'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                      ${step === parseInt(n) ? 'bg-blue-500 text-white' : step > parseInt(n) ? 'bg-green-500 text-white' : 'bg-white/8 text-slate-500'}`}>
                      {step > parseInt(n) ? '✓' : n}
                    </span>
                    {label}
                  </button>
                  {i < 2 && <span className="text-slate-700 mx-1">→</span>}
                </div>
              ))}
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <div>
                <div className="bg-blue-500/8 border border-blue-500/20 rounded-lg px-4 py-3 text-sm text-blue-300 mb-5">
                  Paste a client email and let AI extract all shipment details automatically — or skip to fill manually.
                </div>
                <div className="bg-white/4 border border-white/8 rounded-xl p-5 mb-4">
                  <label className={lbl}>Client email content</label>
                  <textarea value={emailText} onChange={e => setEmailText(e.target.value)} rows={8}
                    placeholder="Hi, we need to ship 3 pallets from New York to Lyon (69). Total weight 450 kg, dimensions 120x80x100cm each. DAP incoterm. Goods value €8,500. Please send a quotation. Thanks, Pierre"
                    className={inp + ' resize-y'} />
                  <div className="flex gap-3 mt-3">
                    <button onClick={parseEmail} disabled={aiLoading} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      {aiLoading ? '⏳ Extracting…' : '🤖 Extract with AI ↗'}
                    </button>
                    <button onClick={() => setStep(2)} className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-400 px-4 py-2 rounded-lg transition-colors">
                      Skip → Fill manually
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Incoterm selector */}
                <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                  <div className={lbl + ' mb-3'}>Incoterm</div>
                  <div className="flex gap-2 flex-wrap">
                    {(['EXW', 'FOB', 'DAP', 'DDU', 'DDP'] as const).map(t => (
                      <button key={t} onClick={() => setVal('incoterm', t)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all
                          ${form.incoterm === t ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-white/4 border-white/8 text-slate-400 hover:border-white/20'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {form.incoterm === 'EXW' && 'Buyer arranges all transport. You quote handling + airline + delivery.'}
                    {form.incoterm === 'FOB' && 'Seller covers origin costs. You quote from airport: handling + airline + delivery.'}
                    {form.incoterm === 'DAP' && 'You deliver to buyer\'s address. File + handling + airline + delivery included.'}
                    {form.incoterm === 'DDU' && 'Delivery duty unpaid. Adds customs clearance to DAP.'}
                    {form.incoterm === 'DDP' && 'All inclusive. Adds customs + outlay fee (duties paid on your behalf).'}
                  </div>
                </div>

                {/* Client & shipment */}
                <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                  <div className={lbl + ' mb-4'}>Client & Shipment Info</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Client name</label><input type="text" value={form.client_name} onChange={set('client_name')} placeholder="Company name" className={inp} /></div>
                    <div><label className={lbl}>Client email</label><input type="email" value={form.client_email} onChange={set('client_email')} placeholder="contact@client.fr" className={inp} /></div>
                    <div><label className={lbl}>Origin</label><input type="text" value={form.origin} onChange={set('origin')} placeholder="e.g. Los Angeles, USA" className={inp} /></div>
                    <div><label className={lbl}>Airline / Agent</label>
                      <select value={form.airline} onChange={set('airline')} className={inp}>
                        <option value="AF/KLM">AF/KLM (€{BASE_RATES.airline_afklm})</option>
                        <option value="Other">Other airline (€{BASE_RATES.airline_default})</option>
                      </select>
                    </div>
                    <div className="col-span-2"><label className={lbl}>Goods description</label><input type="text" value={form.goods_description} onChange={set('goods_description')} placeholder="e.g. Electronic equipment, spare parts" className={inp} /></div>
                    <div><label className={lbl}>Goods value (€) — for insurance/DDP</label><input type="number" value={form.goods_value} onChange={set('goods_value')} placeholder="0.00" className={inp} /></div>
                    <div><label className={lbl}>Notes</label><input type="text" value={form.notes} onChange={set('notes')} placeholder="Internal notes" className={inp} /></div>
                  </div>
                </div>

                {/* Packages */}
                <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className={lbl + ' mb-0'}>Packages & Weight</div>
                    <div className="flex gap-3 items-center">
                      <div className="flex border border-white/8 rounded-lg overflow-hidden">
                        {(['kg', 'lbs'] as const).map(u => <button key={u} onClick={() => setVal('weight_unit', u)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${form.weight_unit === u ? 'bg-blue-500 text-white' : 'text-slate-400 hover:bg-white/8'}`}>{u}</button>)}
                      </div>
                      <div className="flex border border-white/8 rounded-lg overflow-hidden">
                        {(['cm', 'in'] as const).map(u => <button key={u} onClick={() => setVal('dim_unit', u)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${form.dim_unit === u ? 'bg-blue-500 text-white' : 'text-slate-400 hover:bg-white/8'}`}>{u}</button>)}
                      </div>
                    </div>
                  </div>
                  <table className="w-full text-sm mb-3">
                    <thead><tr className="border-b border-white/8">
                      {['Qty', `L (${form.dim_unit})`, `W (${form.dim_unit})`, `H (${form.dim_unit})`, `Wt/${form.weight_unit}`, 'Vol.wt kg', ''].map(h => (
                        <th key={h} className="py-2 px-2 text-left text-xs text-slate-500 font-medium">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {packages.map((p, i) => (
                        <tr key={i}>
                          {(['qty', 'length', 'width', 'height', 'weight'] as const).map(field => (
                            <td key={field} className="px-2 py-1.5">
                              <input type="number" min="0" value={p[field] || ''} onChange={e => {
                                const updated = [...packages]
                                updated[i] = { ...updated[i], [field]: parseFloat(e.target.value) || 0 }
                                setPackages(updated)
                              }} placeholder="0" className="w-16 bg-slate-800 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-xs text-slate-500">{calcVolWeight(p, form.dim_unit).toFixed(1)}</td>
                          <td className="px-2 py-1.5">
                            {packages.length > 1 && <button onClick={() => setPackages(pkgs => pkgs.filter((_, idx) => idx !== i))} className="text-xs text-slate-600 hover:text-red-400 transition-colors">✕</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={() => setPackages(p => [...p, { qty: 1, length: 0, width: 0, height: 0, weight: 0 }])} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ Add package</button>
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {[['Actual', actual.toFixed(1) + ' kg'], ['Volumetric', vol.toFixed(1) + ' kg'], ['Chargeable', chargeable.toFixed(1) + ' kg'], ['Packages', packages.reduce((s,p) => s + p.qty, 0) + ' pcs']].map(([label, val]) => (
                      <div key={label} className="bg-slate-800/50 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-1">{label}</div>
                        <div className="text-sm font-semibold text-white">{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delivery */}
                <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                  <div className={lbl + ' mb-4'}>Delivery — France (ASAVINTER 2025)</div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="relative">
                      <label className={lbl}>Département (number or name)</label>
                      <input type="text" value={deptSearch} onChange={e => setDeptSearch(e.target.value)} placeholder="e.g. 69 or RHONE" className={inp} />
                      {deptSuggestions.length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-xl">
                          {deptSuggestions.map(d => (
                            <button key={d.code} onClick={() => { setVal('dept_code', d.code); setVal('dept_name', d.name); setDeptSearch(d.name); setDeptSuggestions([]) }}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/8 text-left transition-colors">
                              <span className="text-slate-200">{d.name}</span>
                              <span className="text-xs text-slate-500">1 plt: €{TRUCKING_RATES[d.code]?.p80['1']}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={lbl}>Pallet type</label>
                      <select value={form.pallet_type} onChange={set('pallet_type')} className={inp}>
                        <option value="p80">120×80 cm (max 600 kg/plt)</option>
                        <option value="p100">120×100 cm (max 750 kg/plt)</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Number of pallets</label>
                      <input type="number" min="1" max="33" value={form.num_pallets} onChange={e => setVal('num_pallets', parseInt(e.target.value) || 1)} className={inp} />
                    </div>
                    {form.dept_code && (
                      <div className="flex items-end">
                        <div className="bg-slate-800/50 rounded-lg p-3 w-full">
                          <div className="text-xs text-slate-500 mb-1">Delivery rate</div>
                          <div className="text-lg font-bold text-blue-300">€{getTruckingRate(form.dept_code, form.pallet_type, form.num_pallets)?.toLocaleString() || '—'}</div>
                          {form.num_pallets <= 5 && <div className="text-xs text-amber-400 mt-0.5">+ €{BASE_RATES.hayon_surcharge} hayon surcharge</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Options */}
                <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                  <div className={lbl + ' mb-4'}>Optional Services</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['opt_insurance', `Insurance (0.45% min €${BASE_RATES.insurance_min})`],
                      ['opt_t1', `T1 transit document (+€${BASE_RATES.t1})`],
                      ['opt_liftgate', `Liftgate (+€${BASE_RATES.liftgate})`],
                      ['opt_appointment', `Delivery appointment (+€${BASE_RATES.appointment})`],
                      ['opt_usd', 'Payment in USD (+2.5%)'],
                    ].map(([field, label]) => (
                      <label key={field} className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={(form as any)[field]} onChange={set(field as keyof QuoteForm)} className="w-4 h-4 rounded" />
                        <span className="text-sm text-slate-300">{label}</span>
                      </label>
                    ))}
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm text-slate-300">Palletization</span>
                      <input type="number" min="0" value={form.opt_palletization} onChange={e => setVal('opt_palletization', parseInt(e.target.value) || 0)} className="w-16 bg-slate-800 border border-slate-600/50 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
                      <span className="text-xs text-slate-500">plt × €{BASE_RATES.palletization}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button onClick={() => setStep(1)} className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-400 px-4 py-2 rounded-lg transition-colors">← Back</button>
                  <button onClick={() => setStep(3)} disabled={!form.dept_code} className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">Calculate quote →</button>
                </div>
              </div>
            )}

            {/* STEP 3 — QUOTE PREVIEW */}
            {step === 3 && (
              <div>
                <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
                  {/* Quote header */}
                  <div className="bg-[#1a2d45] px-6 py-5 border-b border-white/8 flex items-start justify-between">
                    <div>
                      <div className="text-base font-semibold">Air Freight Quotation</div>
                      <div className="text-xs text-slate-500 mt-0.5">{new Date().toLocaleDateString('fr-FR')} · Valid 7 days</div>
                    </div>
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full text-sm font-bold">{form.incoterm}</span>
                  </div>

                  {/* Client + shipment summary */}
                  <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-white/8 text-sm">
                    {[
                      ['Client', form.client_name || '—'],
                      ['Origin', form.origin || '—'],
                      ['Chargeable weight', chargeable.toFixed(1) + ' kg'],
                      ['Goods', form.goods_description || '—'],
                      ['Delivery to', form.dept_name || '—'],
                      ['Pallets', `${form.num_pallets} × ${form.pallet_type === 'p80' ? '120×80' : '120×100'} cm`],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                        <div className="text-slate-200">{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Fee breakdown */}
                  <div className="px-6 py-4">
                    {fees.map((fee, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 text-sm last:border-0">
                        <span className="text-slate-400">
                          {fee.label}
                          {fee.note && <span className="text-xs text-slate-600 ml-2">({fee.note})</span>}
                        </span>
                        <span className="font-medium text-slate-200">€{fee.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/15 text-base font-semibold">
                      <span>Total estimated</span>
                      <span className="text-blue-300 text-xl">€{total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="px-6 pb-4 text-xs text-slate-600 leading-relaxed">
                    Prices excl. fuel surcharge and taxes. Based on chargeable weight as calculated by airlines.
                    {form.incoterm === 'DDP' && ' DDP: +€75 outlay fee + 1% duties & taxes billed separately.'}
                    {' '}Subject to space availability. Valid 7 days from today.
                    {form.opt_usd && ' USD payment: +2.5% applied.'}
                  </div>
                </div>

                <div className="flex gap-3 mt-5 justify-end flex-wrap">
                  <button onClick={() => setStep(2)} className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-400 px-4 py-2 rounded-lg transition-colors">← Edit</button>
                  <button onClick={saveQuote} className="text-sm bg-green-500/15 hover:bg-green-500/25 border border-green-500/20 text-green-300 px-4 py-2 rounded-lg transition-colors">💾 Save quote</button>
                  <button onClick={async () => {
                    const summary = fees.map(f => `${f.label}: €${f.amount.toFixed(2)}`).join(', ')
                    const prompt = `Generate a professional air freight quotation email in French and English for: Client: ${form.client_name}, Origin: ${form.origin}, Incoterm: ${form.incoterm}, Chargeable weight: ${chargeable.toFixed(1)}kg, Goods: ${form.goods_description}, Delivery: ${form.dept_name}. Fees: ${summary}. Total: €${total.toFixed(2)}. Make it professional and ready to send.`
                    await navigator.clipboard.writeText(prompt)
                    toast.success('Prompt copied — paste into AI Assistant!')
                  }} className="text-sm bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 text-blue-300 px-4 py-2 rounded-lg transition-colors">📋 Copy for AI email</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
