import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import toast, { Toaster } from 'react-hot-toast'
import type { Shipment, ShipmentStatus, ChecklistState } from '@/lib/supabase'
import { STATUS_FLOW, CHECKLIST_LABELS, getProgress } from '@/lib/supabase'

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  'New File':    'bg-blue-500/15 text-blue-300 border-blue-500/20',
  'Docs Pending':'bg-amber-500/15 text-amber-300 border-amber-500/20',
  'Customs':     'bg-purple-500/15 text-purple-300 border-purple-500/20',
  'Delivery':    'bg-teal-500/15 text-teal-300 border-teal-500/20',
  'Complete':    'bg-green-500/15 text-green-300 border-green-500/20',
  'On Hold':     'bg-red-500/15 text-red-300 border-red-500/20',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[status] || STATUS_COLORS['New File']}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

// ─── CHECKLIST COMPONENT ──────────────────────────────────────────────────────
function ChecklistPanel({ shipment, onUpdate }: { shipment: Shipment, onUpdate: () => void }) {
  async function toggle(key: keyof ChecklistState) {
    const updated = { ...shipment.checklist, [key]: !shipment.checklist[key] }
    await fetch(`/api/shipments/${shipment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updated }),
    })
    onUpdate()
  }

  return (
    <div className="space-y-2">
      {(Object.keys(CHECKLIST_LABELS) as (keyof ChecklistState)[]).map(key => (
        <button key={key} onClick={() => toggle(key)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all
            ${shipment.checklist[key]
              ? 'bg-green-500/5 border-green-500/20 text-slate-400 line-through'
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 text-slate-300'}`}>
          <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all
            ${shipment.checklist[key] ? 'bg-green-500 border-green-500' : 'border-2 border-slate-600'}`}>
            {shipment.checklist[key] && <span className="text-white text-[9px]">✓</span>}
          </div>
          <span className="text-sm">{CHECKLIST_LABELS[key]}</span>
        </button>
      ))}
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'dashboard' | 'shipments' | 'ai'>('dashboard')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState<Shipment | null>(null)
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Hello! I have full visibility into your live shipments. Ask me what\'s urgent, to draft an email, or anything about imports into France.' }
  ])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const fetchShipments = useCallback(async () => {
    const res = await fetch('/api/shipments')
    const data = await res.json()
    setShipments(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchShipments() }, [fetchShipments])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchShipments, 30000)
    return () => clearInterval(interval)
  }, [fetchShipments])

  // ── Filtered list ──
  const filtered = shipments.filter(s => {
    const matchSearch = !search || [s.file_number, s.client_name, s.supplier, s.agent || '', s.awb || ''].join(' ').toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || s.status === filterStatus
    return matchSearch && matchStatus
  })

  const liveCount = shipments.filter(s => s.status !== 'Complete').length
  const counts: Record<string, number> = {}
  STATUS_FLOW.forEach(s => counts[s] = shipments.filter(x => x.status === s).length)

  // ── Send email ──
  async function sendEmail(shipmentId: string, template: string, customSubject?: string, customBody?: string) {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId, template, customSubject, customBody }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success('Email sent!')
      setShowEmailModal(null)
    } else {
      toast.error(data.error || 'Failed to send email')
    }
  }

  // ── Advance status ──
  async function advanceStatus(s: Shipment) {
    const idx = STATUS_FLOW.indexOf(s.status)
    if (idx >= STATUS_FLOW.length - 1) return
    const newStatus = STATUS_FLOW[idx + 1]
    await fetch(`/api/shipments/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    toast.success(`Moved to "${newStatus}"`)
    fetchShipments()
    if (selectedShipment?.id === s.id) setSelectedShipment({ ...s, status: newStatus })
  }

  // ── AI chat ──
  async function sendAiMessage(msg?: string) {
    const text = msg || aiInput.trim()
    if (!text || aiLoading) return
    setAiInput('')
    const newMessages = [...aiMessages, { role: 'user', content: text }]
    setAiMessages(newMessages)
    setAiLoading(true)
    const res = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: newMessages }),
    })
    const data = await res.json()
    setAiMessages([...newMessages, { role: 'assistant', content: data.reply || 'No response.' }])
    setAiLoading(false)
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <>
      <Head><title>FreightFlow — Import Tracker</title></Head>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a2d45', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' } }} />

      <div className="flex h-screen bg-[#0f1b2d] text-slate-200 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="w-52 bg-[#1a2d45] border-r border-white/8 flex flex-col flex-shrink-0">
          <div className="px-4 py-5 border-b border-white/8">
            <div className="text-base font-bold text-white">✈ FreightFlow</div>
            <div className="text-xs text-slate-500 mt-0.5">Import Management</div>
          </div>
          <nav className="p-2.5 flex-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider px-2 pt-3 pb-1.5">Operations</div>
            {[
              { id: 'dashboard', icon: '📊', label: 'Dashboard' },
              { id: 'shipments', icon: '📦', label: 'Shipments', badge: liveCount },
              { id: 'ai', icon: '🤖', label: 'AI Assistant' },
            ].map(item => (
              <button key={item.id} onClick={() => setView(item.id as any)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm mb-0.5 transition-all
                  ${view === item.id ? 'bg-blue-500/20 text-blue-300 font-medium' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                <span className="text-sm">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge ? <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-white/8">
            <div className="text-xs text-slate-600">Auto-refreshes every 30s</div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto">

          {/* ── DASHBOARD ── */}
          {view === 'dashboard' && (
            <>
              <div className="sticky top-0 z-10 bg-[#0f1b2d] border-b border-white/8 px-7 py-4 flex items-center gap-4">
                <h1 className="text-lg font-semibold flex-1">Dashboard</h1>
                <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  + New Shipment
                </button>
              </div>
              <div className="p-7">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-7">
                  {[
                    { label: 'Live Files', value: liveCount, sub: 'Active shipments', color: 'text-blue-300' },
                    { label: 'Awaiting Docs', value: (counts['New File'] || 0) + (counts['Docs Pending'] || 0), sub: 'Missing documents', color: 'text-amber-300' },
                    { label: 'In Customs', value: counts['Customs'] || 0, sub: 'Awaiting clearance', color: 'text-purple-300' },
                    { label: 'For Delivery', value: counts['Delivery'] || 0, sub: 'Cleared, to deliver', color: 'text-teal-300' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white/4 border border-white/8 rounded-xl p-5">
                      <div className="text-xs text-slate-500 uppercase tracking-wide">{stat.label}</div>
                      <div className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
                      <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
                    </div>
                  ))}
                </div>
                {/* Two columns */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <h3 className="text-sm font-semibold mb-4">Pipeline</h3>
                    {STATUS_FLOW.map(s => (
                      <div key={s} className="flex items-center gap-3 mb-3">
                        <div className="w-28 text-xs text-slate-400">{s}</div>
                        <div className="flex-1 h-1.5 bg-white/8 rounded overflow-hidden">
                          <div className="h-full bg-blue-500 rounded transition-all" style={{ width: `${Math.round((counts[s] || 0) / Math.max(shipments.length, 1) * 100)}%` }} />
                        </div>
                        <div className="w-5 text-right text-sm font-semibold">{counts[s] || 0}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-4">⚠️ Needs Attention</h3>
                    {shipments.filter(s => ['New File', 'Docs Pending'].includes(s.status)).slice(0, 5).map(s => (
                      <div key={s.id} onClick={() => setSelectedShipment(s)}
                        className="bg-white/4 border border-white/8 rounded-lg p-3 mb-2 cursor-pointer hover:bg-white/6 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                          <StatusBadge status={s.status} />
                          <span className="text-xs font-semibold text-white">{s.file_number}</span>
                        </div>
                        <div className="text-xs text-slate-400">{s.client_name} — {s.supplier}</div>
                        <div className="mt-2 h-1 bg-white/8 rounded overflow-hidden">
                          <div className="h-full rounded transition-all" style={{ width: `${getProgress(s.checklist)}%`, background: getProgress(s.checklist) < 40 ? '#ef4444' : '#f59e0b' }} />
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{getProgress(s.checklist)}% complete</div>
                      </div>
                    ))}
                    {shipments.filter(s => ['New File', 'Docs Pending'].includes(s.status)).length === 0 && (
                      <div className="text-sm text-slate-500 text-center py-6">All clear ✓</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── SHIPMENTS ── */}
          {view === 'shipments' && (
            <>
              <div className="sticky top-0 z-10 bg-[#0f1b2d] border-b border-white/8 px-7 py-4 flex items-center gap-4">
                <h1 className="text-lg font-semibold flex-1">Shipments</h1>
                <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  + New Shipment
                </button>
              </div>
              <div className="p-7">
                {/* Pipeline tabs */}
                <div className="flex bg-white/4 border border-white/8 rounded-xl p-1 mb-5 overflow-x-auto gap-0.5">
                  {[{ label: 'All', value: 'all', count: shipments.length }, ...STATUS_FLOW.map(s => ({ label: s, value: s, count: counts[s] || 0 }))].map(tab => (
                    <button key={tab.value} onClick={() => setFilterStatus(tab.value)}
                      className={`flex-1 min-w-[80px] text-center px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                        ${filterStatus === tab.value ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
                      {tab.label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filterStatus === tab.value ? 'bg-white/20' : 'bg-white/8'}`}>{tab.count}</span>
                    </button>
                  ))}
                </div>
                {/* Search */}
                <div className="relative mb-4">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by client, AWB, agent, file number…"
                    className="w-full bg-white/4 border border-white/8 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600" />
                </div>
                {/* Table */}
                <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
                  {loading ? (
                    <div className="text-center py-16 text-slate-500">Loading shipments…</div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">No shipments found</div>
                  ) : (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-white/4 border-b border-white/8">
                          {['File #', 'Status', 'Client', 'Supplier', 'Agent', 'AWB', 'Packages / Weight', 'Progress', ''].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-[11px] text-slate-500 uppercase tracking-wide font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(s => {
                          const prog = getProgress(s.checklist)
                          return (
                            <tr key={s.id} onClick={() => setSelectedShipment(s)} className="border-b border-white/5 hover:bg-white/4 cursor-pointer transition-colors last:border-0">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-blue-300">{s.file_number}</div>
                                <div className="text-xs text-slate-500">{s.origin || '—'}</div>
                              </td>
                              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-200">{s.client_name}</div>
                                <div className="text-xs text-slate-500">{s.client_email || ''}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-300">{s.supplier}</td>
                              <td className="px-4 py-3 text-slate-400">{s.agent || '—'}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-400">{s.awb || '—'}</td>
                              <td className="px-4 py-3 text-slate-400">{s.packages || '—'} / {s.weight_kg ? s.weight_kg.toLocaleString() + ' kg' : '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-1.5 bg-white/8 rounded overflow-hidden">
                                    <div className="h-full rounded transition-all" style={{ width: `${prog}%`, background: prog === 100 ? '#22c55e' : prog > 50 ? '#3b82f6' : '#f59e0b' }} />
                                  </div>
                                  <span className="text-xs text-slate-500">{prog}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <button onClick={() => setShowEmailModal(s)} className="text-xs bg-white/6 hover:bg-white/10 border border-white/8 rounded px-2.5 py-1.5 text-slate-400 hover:text-slate-200 transition-colors">📧</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── AI ASSISTANT ── */}
          {view === 'ai' && (
            <>
              <div className="sticky top-0 z-10 bg-[#0f1b2d] border-b border-white/8 px-7 py-4">
                <h1 className="text-lg font-semibold">🤖 AI Assistant</h1>
              </div>
              <div className="flex flex-col h-[calc(100vh-73px)] p-7">
                <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                  {aiMessages.map((m, i) => (
                    <div key={i} className={`flex gap-3 items-start ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm ${m.role === 'user' ? 'bg-blue-500' : 'bg-teal-500/20'}`}>
                        {m.role === 'user' ? '👤' : '🤖'}
                      </div>
                      <div className={`max-w-[78%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap
                        ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white/6 border border-white/8 text-slate-300'}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex gap-3 items-center">
                      <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center">🤖</div>
                      <div className="bg-white/6 border border-white/8 rounded-xl px-4 py-3 text-sm text-slate-500">Thinking…</div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {["What's urgent?", "Summarize live files", "Which docs are missing?", "What's in customs?"].map(q => (
                    <button key={q} onClick={() => sendAiMessage(q)} className="text-xs bg-white/6 hover:bg-white/10 border border-white/8 rounded-lg px-3 py-2 text-slate-400 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAiMessage()}
                    placeholder="Ask anything about your shipments…"
                    className="flex-1 bg-white/6 border border-white/8 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600" />
                  <button onClick={() => sendAiMessage()} className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors">
                    Send ↗
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── SHIPMENT DETAIL MODAL ── */}
      {selectedShipment && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-5" onClick={e => e.target === e.currentTarget && setSelectedShipment(null)}>
          <div className="bg-[#1a2d45] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#1a2d45] border-b border-white/8 px-6 py-4 flex items-start justify-between z-10">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold">{selectedShipment.file_number}</h2>
                  <StatusBadge status={selectedShipment.status} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{selectedShipment.supplier} → {selectedShipment.client_name}</div>
              </div>
              <button onClick={() => setSelectedShipment(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none px-1">✕</button>
            </div>
            <div className="p-6">
              {/* Progress */}
              <div className="mb-5">
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">File Progress</span>
                  <span className="text-sm font-semibold" style={{ color: getProgress(selectedShipment.checklist) === 100 ? '#22c55e' : getProgress(selectedShipment.checklist) > 60 ? '#60a5fa' : '#f59e0b' }}>
                    {getProgress(selectedShipment.checklist)}%
                  </span>
                </div>
                <div className="h-2 bg-white/8 rounded overflow-hidden">
                  <div className="h-full rounded transition-all" style={{
                    width: `${getProgress(selectedShipment.checklist)}%`,
                    background: getProgress(selectedShipment.checklist) === 100 ? '#22c55e' : getProgress(selectedShipment.checklist) > 60 ? '#3b82f6' : '#f59e0b'
                  }} />
                </div>
                <div className="flex justify-between mt-2">
                  {STATUS_FLOW.map(s => (
                    <div key={s} className={`text-[10px] ${selectedShipment.status === s ? 'text-blue-300 font-semibold' : 'text-slate-600'}`}>{s}</div>
                  ))}
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  ['AWB', selectedShipment.awb, true],
                  ['Agent', selectedShipment.agent],
                  ['Origin', selectedShipment.origin],
                  ['Arrival', selectedShipment.arrival_date ? new Date(selectedShipment.arrival_date).toLocaleDateString('fr-FR') : 'Pending'],
                  ['Packages', selectedShipment.packages],
                  ['Weight', selectedShipment.weight_kg ? selectedShipment.weight_kg.toLocaleString() + ' kg' : null],
                ].map(([label, value, mono = false]) => value && (
                  <div key={label as string}>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</div>
                    <div className={`text-sm text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</div>
                  </div>
                ))}
                {selectedShipment.delivery_address && (
                  <div className="col-span-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Delivery Address</div>
                    <div className="text-sm text-slate-200 whitespace-pre-line">{selectedShipment.delivery_address}</div>
                  </div>
                )}
                {selectedShipment.notes && (
                  <div className="col-span-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Notes</div>
                    <div className="text-sm text-slate-400">{selectedShipment.notes}</div>
                  </div>
                )}
              </div>

              {/* Checklist */}
              <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Document & Action Checklist</div>
              <ChecklistPanel shipment={selectedShipment} onUpdate={() => {
                fetchShipments()
                // Refresh selected shipment from updated list
                setSelectedShipment(prev => {
                  const fresh = shipments.find(s => s.id === prev?.id)
                  return fresh || prev
                })
              }} />

              {/* Actions */}
              <div className="flex gap-2 mt-5 flex-wrap">
                <button onClick={() => advanceStatus(selectedShipment)} className="text-sm bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 text-blue-300 px-3 py-2 rounded-lg transition-colors">
                  ⏩ Advance Status
                </button>
                <button onClick={() => { setShowEmailModal(selectedShipment); setSelectedShipment(null) }} className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-300 px-3 py-2 rounded-lg transition-colors">
                  📧 Send Email
                </button>
                <button onClick={() => {
                  const url = `${window.location.origin}/confirm/${selectedShipment.consignee_token}`
                  navigator.clipboard.writeText(url)
                  toast.success('Consignee link copied!')
                }} className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-300 px-3 py-2 rounded-lg transition-colors">
                  🔗 Copy Consignee Link
                </button>
                <button onClick={async () => {
                  if (!confirm(`Delete ${selectedShipment.file_number}?`)) return
                  await fetch(`/api/shipments/${selectedShipment.id}`, { method: 'DELETE' })
                  toast.success('Deleted')
                  setSelectedShipment(null)
                  fetchShipments()
                }} className="text-sm bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 px-3 py-2 rounded-lg transition-colors ml-auto">
                  🗑 Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EMAIL MODAL ── */}
      {showEmailModal && (
        <EmailModal shipment={showEmailModal} onClose={() => setShowEmailModal(null)} onSend={sendEmail} />
      )}

      {/* ── NEW SHIPMENT MODAL ── */}
      {showNewModal && (
        <NewShipmentModal onClose={() => setShowNewModal(false)} onSave={async (data) => {
          const res = await fetch('/api/shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
          const created = await res.json()
          if (created.error) { toast.error(created.error); return }
          toast.success(`File ${created.file_number} opened!`)
          setShowNewModal(false)
          fetchShipments()
        }} />
      )}
    </>
  )
}

// ─── EMAIL MODAL ──────────────────────────────────────────────────────────────
function EmailModal({ shipment, onClose, onSend }: { shipment: Shipment; onClose: () => void; onSend: (id: string, tpl: string, subj?: string, body?: string) => void }) {
  const [tab, setTab] = useState<'arrival' | 'docs_reminder' | 'customs_cleared' | 'custom'>('arrival')
  const [customSubject, setCustomSubject] = useState(`Re: Shipment ${shipment.file_number}`)
  const [customBody, setCustomBody] = useState(`Dear ${shipment.client_name},\n\n\n\nBest regards,\nFreightFlow Team`)

  const TEMPLATES = [
    { id: 'arrival', label: '📬 New Arrival', desc: 'Notify consignee with confirmation link' },
    { id: 'docs_reminder', label: '📋 Docs Reminder', desc: 'List missing documents' },
    { id: 'customs_cleared', label: '✅ Customs Cleared', desc: 'Notify shipment is cleared' },
    { id: 'custom', label: '✏️ Custom', desc: 'Write your own email' },
  ]

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-5" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a2d45] border border-white/10 rounded-2xl w-full max-w-xl">
        <div className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">📧 Send Email — {shipment.file_number}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
        </div>
        <div className="p-6">
          <div className="text-xs text-slate-500 mb-2">To: <span className="text-slate-300">{shipment.client_email || 'No email on file'}</span></div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`px-3 py-2.5 rounded-lg text-left border transition-all ${tab === t.id ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-white/4 border-white/8 text-slate-400 hover:border-white/15'}`}>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
          {tab === 'custom' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Subject</label>
                <input type="text" value={customSubject} onChange={e => setCustomSubject(e.target.value)} className="w-full bg-[#243d5e] border border-white/14 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Message</label>
                <textarea value={customBody} onChange={e => setCustomBody(e.target.value)} rows={7} className="w-full bg-[#243d5e] border border-white/14 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-y" />
              </div>
            </div>
          )}
          <div className="flex gap-3 mt-5 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-400 rounded-lg transition-colors">Cancel</button>
            <button onClick={() => onSend(shipment.id, tab, customSubject, customBody)} disabled={!shipment.client_email}
              className="px-5 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Send Email ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── NEW SHIPMENT MODAL ───────────────────────────────────────────────────────
function NewShipmentModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ supplier: '', client_name: '', client_email: '', awb: '', house_awb: '', agent: '', origin: '', packages: '', weight_kg: '', arrival_date: '', delivery_address: '', notes: '', status: 'New File' })
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const inputCls = "w-full bg-[#243d5e] border border-white/14 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600"
  const labelCls = "block text-[10px] text-slate-500 uppercase tracking-wide mb-1.5 font-medium"

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-5" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a2d45] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#1a2d45] border-b border-white/8 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold">Open New Shipment File</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Supplier *', 'supplier', 'Exporter name'],
              ['Client (Consignee) *', 'client_name', 'Importer name'],
              ['Client Email', 'client_email', 'contact@client.fr'],
              ['Status', 'status', '', 'select'],
              ['AWB / MAWB', 'awb', 'e.g. 112-7404-4434'],
              ['House AWB', 'house_awb', 'e.g. OSD-24030-705'],
              ['Agent', 'agent', 'e.g. DTW, BSI, BTX'],
              ['Origin Country', 'origin', 'e.g. CHINE, USA'],
              ['Packages', 'packages', '0', 'number'],
              ['Weight (kg)', 'weight_kg', '0', 'number'],
              ['Arrival Date', 'arrival_date', '', 'date'],
              ['Flight / Vessel', 'flight_vessel', 'e.g. MU-553'],
            ].map(([label, key, placeholder, type]) => (
              <div key={key as string}>
                <label className={labelCls}>{label}</label>
                {type === 'select' ? (
                  <select value={(form as any)[key as string]} onChange={set(key as string)} className={inputCls}>
                    {STATUS_FLOW.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input type={(type as string) || 'text'} value={(form as any)[key as string]} onChange={set(key as string)} placeholder={placeholder as string} className={inputCls} />
                )}
              </div>
            ))}
            <div className="col-span-2">
              <label className={labelCls}>Delivery Address</label>
              <textarea value={form.delivery_address} onChange={set('delivery_address')} placeholder="Full delivery address" rows={2} className={inputCls + ' resize-none'} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea value={form.notes} onChange={set('notes')} placeholder="Internal notes, references…" rows={2} className={inputCls + ' resize-none'} />
            </div>
          </div>
          <div className="flex gap-3 mt-6 justify-end border-t border-white/8 pt-5">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-400 rounded-lg transition-colors">Cancel</button>
            <button onClick={() => {
              if (!form.supplier || !form.client_name) { toast.error('Supplier and Client are required'); return }
              onSave({ ...form, packages: form.packages ? parseInt(form.packages) : null, weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null, arrival_date: form.arrival_date || null })
            }} className="px-5 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors">
              Open File ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
