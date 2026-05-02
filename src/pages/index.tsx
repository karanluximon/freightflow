import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import toast, { Toaster } from 'react-hot-toast'
import type { Shipment, ShipmentStatus, ChecklistState } from '@/lib/supabase'
import { STATUS_FLOW, CHECKLIST_LABELS, getProgress } from '@/lib/supabase'

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

function TypeBadge({ type }: { type?: string }) {
  if (!type) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
      ${type === 'Export' ? 'bg-orange-500/15 text-orange-300 border border-orange-500/20' : 'bg-sky-500/15 text-sky-300 border border-sky-500/20'}`}>
      {type === 'Export' ? '📤' : '📥'} {type}
    </span>
  )
}

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
            ${shipment.checklist[key] ? 'bg-green-500/5 border-green-500/20 text-slate-400 line-through' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 text-slate-300'}`}>
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

const ALL_STATUSES = ['New File', 'Docs Pending', 'Customs', 'Delivery', 'Complete', 'On Hold']

export default function App() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'dashboard' | 'shipments' | 'ai'>('dashboard')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null)
  const [showEmailModal, setShowEmailModal] = useState<Shipment | null>(null)
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', content: 'Hello! I have full visibility into your live shipments. Ask me what\'s urgent, to draft an email, or anything about imports/exports into France.' }
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
  useEffect(() => {
    const interval = setInterval(fetchShipments, 30000)
    return () => clearInterval(interval)
  }, [fetchShipments])

  const filtered = shipments.filter(s => {
    const matchSearch = !search || [s.file_number, s.client_name, s.supplier, s.agent || '', s.awb || ''].join(' ').toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || s.status === filterStatus
    const matchType = filterType === 'all' || (s as any).shipment_type === filterType
    return matchSearch && matchStatus && matchType
  })

  const liveCount = shipments.filter(s => s.status !== 'Complete').length
  const counts: Record<string, number> = {}
  ALL_STATUSES.forEach(s => counts[s] = shipments.filter(x => x.status === s).length)
  const importCount = shipments.filter(s => (s as any).shipment_type !== 'Export').length
  const exportCount = shipments.filter(s => (s as any).shipment_type === 'Export').length

  async function sendEmail(shipmentId: string, template: string, customSubject?: string, customBody?: string) {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId, template, customSubject, customBody }),
    })
    const data = await res.json()
    if (data.success) { toast.success('Email sent!'); setShowEmailModal(null) }
    else toast.error(data.error || 'Failed to send email')
  }

  async function updateStatus(s: Shipment, newStatus: string) {
    await fetch(`/api/shipments/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    toast.success(`Status → "${newStatus}"`)
    fetchShipments()
    if (selectedShipment?.id === s.id) setSelectedShipment({ ...s, status: newStatus as ShipmentStatus })
  }

  async function sendAiMessage(msg?: string) {
    const text = msg || aiInput.trim()
    if (!text || aiLoading) return
    setAiInput('')
    const newMessages = [...aiMessages, { role: 'user', content: text }]
    setAiMessages(newMessages)
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      setAiMessages([...newMessages, { role: 'assistant', content: data.reply || 'No response.' }])
    } catch {
      setAiMessages([...newMessages, { role: 'assistant', content: 'Connection error. Please try again.' }])
    }
    setAiLoading(false)
  }

  return (
    <>
      <Head><title>FreightFlow — Shipment Tracker</title></Head>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a2d45', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' } }} />

      <div className="flex h-screen bg-[#0f1b2d] text-slate-200 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="w-52 bg-[#1a2d45] border-r border-white/8 flex flex-col flex-shrink-0">
          <div className="px-4 py-5 border-b border-white/8">
            <div className="text-base font-bold text-white">✈ FreightFlow</div>
            <div className="text-xs text-slate-500 mt-0.5">Shipment Tracker</div>
          </div>
          <nav className="p-2.5 flex-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider px-2 pt-3 pb-1.5">Views</div>
            {[
              { id: 'dashboard', icon: '📊', label: 'Dashboard' },
              { id: 'shipments', icon: '📦', label: 'All Shipments', badge: liveCount },
              { id: 'ai', icon: '🤖', label: 'AI Assistant' },
            ].map(item => (
              <button key={item.id} onClick={() => { setView(item.id as any); setFilterType('all'); setFilterStatus('all') }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm mb-0.5 transition-all
                  ${view === item.id && filterType === 'all' ? 'bg-blue-500/20 text-blue-300 font-medium' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                <span>{item.icon}</span><span>{item.label}</span>
                {item.badge ? <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span> : null}
              </button>
            ))}
            <div className="text-[10px] text-slate-500 uppercase tracking-wider px-2 pt-4 pb-1.5">By Type</div>
            {[
              { label: '📥 Imports', value: 'Import', count: importCount },
              { label: '📤 Exports', value: 'Export', count: exportCount },
            ].map(t => (
              <button key={t.value} onClick={() => { setFilterType(t.value); setView('shipments') }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm mb-0.5 transition-all
                  ${filterType === t.value ? 'bg-blue-500/20 text-blue-300 font-medium' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                <span className="flex-1 text-left">{t.label}</span>
                <span className="text-xs text-slate-500">{t.count}</span>
              </button>
            ))}
            <div className="text-[10px] text-slate-500 uppercase tracking-wider px-2 pt-4 pb-1.5">By Status</div>
            {ALL_STATUSES.map(s => (
              <button key={s} onClick={() => { setFilterStatus(s); setFilterType('all'); setView('shipments') }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs mb-0.5 transition-all
                  ${filterStatus === s && view === 'shipments' ? 'bg-blue-500/20 text-blue-300 font-medium' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}>
                <span className="flex-1 text-left">{s}</span>
                <span className="text-slate-600">{counts[s] || 0}</span>
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-white/8">
            <button onClick={() => setShowNewModal(true)} className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              + New Shipment
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto">

          {/* DASHBOARD */}
          {view === 'dashboard' && (
            <>
              <div className="sticky top-0 z-10 bg-[#0f1b2d] border-b border-white/8 px-7 py-4 flex items-center">
                <h1 className="text-lg font-semibold flex-1">Dashboard</h1>
                <span className="text-xs text-slate-500">Auto-refreshes every 30s</span>
              </div>
              <div className="p-7">
                <div className="grid grid-cols-4 gap-4 mb-7">
                  {[
                    { label: 'Live Files', value: liveCount, sub: 'Active shipments', color: 'text-blue-300' },
                    { label: 'Imports', value: importCount, sub: 'Inbound', color: 'text-sky-300' },
                    { label: 'Exports', value: exportCount, sub: 'Outbound', color: 'text-orange-300' },
                    { label: 'In Customs', value: counts['Customs'] || 0, sub: 'Awaiting clearance', color: 'text-purple-300' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white/4 border border-white/8 rounded-xl p-5">
                      <div className="text-xs text-slate-500 uppercase tracking-wide">{stat.label}</div>
                      <div className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
                      <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-5 mb-5">
                  <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                    <h3 className="text-sm font-semibold mb-4">Pipeline by Status</h3>
                    {ALL_STATUSES.map(s => (
                      <div key={s} className="flex items-center gap-3 mb-3 cursor-pointer hover:opacity-80" onClick={() => { setFilterStatus(s); setView('shipments') }}>
                        <div className="w-28 text-xs text-slate-400">{s}</div>
                        <div className="flex-1 h-2 bg-white/8 rounded overflow-hidden">
                          <div className="h-full bg-blue-500 rounded" style={{ width: `${Math.round((counts[s] || 0) / Math.max(shipments.length, 1) * 100)}%` }} />
                        </div>
                        <div className="w-5 text-right text-sm font-semibold text-white">{counts[s] || 0}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                    <h3 className="text-sm font-semibold mb-4">⚠️ Needs Attention</h3>
                    {shipments.filter(s => ['New File', 'Docs Pending'].includes(s.status)).slice(0, 5).map(s => (
                      <div key={s.id} onClick={() => setSelectedShipment(s)} className="bg-white/4 border border-white/8 rounded-lg p-3 mb-2 cursor-pointer hover:bg-white/6">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <StatusBadge status={s.status} />
                          <TypeBadge type={(s as any).shipment_type || 'Import'} />
                          <span className="text-xs font-semibold text-white ml-auto">{s.file_number}</span>
                        </div>
                        <div className="text-xs text-slate-400">{s.client_name} — {s.supplier}</div>
                        <div className="mt-2 h-1 bg-white/8 rounded overflow-hidden">
                          <div className="h-full rounded" style={{ width: `${getProgress(s.checklist)}%`, background: getProgress(s.checklist) < 40 ? '#ef4444' : '#f59e0b' }} />
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{getProgress(s.checklist)}% complete</div>
                      </div>
                    ))}
                    {shipments.filter(s => ['New File', 'Docs Pending'].includes(s.status)).length === 0 && (
                      <div className="text-sm text-slate-500 text-center py-6">All clear ✓</div>
                    )}
                  </div>
                </div>
                <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4">Recent Shipments</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="border-b border-white/8">
                      {['File #', 'Type', 'Client', 'Supplier', 'Status', 'Progress'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] text-slate-500 uppercase tracking-wide font-medium">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {shipments.slice(0, 8).map(s => (
                        <tr key={s.id} onClick={() => setSelectedShipment(s)} className="border-b border-white/5 hover:bg-white/4 cursor-pointer">
                          <td className="px-3 py-2.5 text-blue-300 font-medium">{s.file_number}</td>
                          <td className="px-3 py-2.5"><TypeBadge type={(s as any).shipment_type || 'Import'} /></td>
                          <td className="px-3 py-2.5 text-slate-300">{s.client_name}</td>
                          <td className="px-3 py-2.5 text-slate-400">{s.supplier}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-white/8 rounded overflow-hidden">
                                <div className="h-full rounded" style={{ width: `${getProgress(s.checklist)}%`, background: getProgress(s.checklist) === 100 ? '#22c55e' : '#3b82f6' }} />
                              </div>
                              <span className="text-xs text-slate-500">{getProgress(s.checklist)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* SHIPMENTS */}
          {view === 'shipments' && (
            <>
              <div className="sticky top-0 z-10 bg-[#0f1b2d] border-b border-white/8 px-7 py-4 flex items-center gap-3">
                <h1 className="text-lg font-semibold flex-1">
                  {filterType !== 'all' ? `${filterType}s` : filterStatus !== 'all' ? filterStatus : 'All Shipments'}
                </h1>
                <button onClick={() => setFilterType('all')} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filterType === 'all' ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-white/4 border-white/8 text-slate-400'}`}>All</button>
                <button onClick={() => setFilterType('Import')} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filterType === 'Import' ? 'bg-sky-500/20 border-sky-500/30 text-sky-300' : 'bg-white/4 border-white/8 text-slate-400'}`}>📥 Imports</button>
                <button onClick={() => setFilterType('Export')} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filterType === 'Export' ? 'bg-orange-500/20 border-orange-500/30 text-orange-300' : 'bg-white/4 border-white/8 text-slate-400'}`}>📤 Exports</button>
              </div>
              <div className="p-7">
                <div className="flex bg-white/4 border border-white/8 rounded-xl p-1 mb-5 overflow-x-auto gap-0.5">
                  {[{ label: 'All', value: 'all', count: shipments.length }, ...ALL_STATUSES.map(s => ({ label: s, value: s, count: counts[s] || 0 }))].map(tab => (
                    <button key={tab.value} onClick={() => setFilterStatus(tab.value)}
                      className={`flex-1 min-w-[70px] text-center px-2 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                        ${filterStatus === tab.value ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
                      {tab.label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filterStatus === tab.value ? 'bg-white/20' : 'bg-white/8'}`}>{tab.count}</span>
                    </button>
                  ))}
                </div>
                <div className="relative mb-4">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, AWB, agent…"
                    className="w-full bg-white/4 border border-white/8 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600" />
                </div>
                <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
                  {loading ? <div className="text-center py-16 text-slate-500">Loading…</div>
                  : filtered.length === 0 ? <div className="text-center py-16 text-slate-500">No shipments found</div>
                  : (
                    <table className="w-full text-sm border-collapse">
                      <thead><tr className="bg-white/4 border-b border-white/8">
                        {['File #', 'Type', 'Status', 'Client', 'Supplier', 'AWB', 'Pkg/Kg', 'Progress', ''].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] text-slate-500 uppercase tracking-wide font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {filtered.map(s => {
                          const prog = getProgress(s.checklist)
                          return (
                            <tr key={s.id} onClick={() => setSelectedShipment(s)} className="border-b border-white/5 hover:bg-white/4 cursor-pointer last:border-0">
                              <td className="px-4 py-3"><div className="font-semibold text-blue-300">{s.file_number}</div><div className="text-xs text-slate-500">{s.origin || '—'}</div></td>
                              <td className="px-4 py-3"><TypeBadge type={(s as any).shipment_type || 'Import'} /></td>
                              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                              <td className="px-4 py-3"><div className="font-medium text-slate-200">{s.client_name}</div><div className="text-xs text-slate-500">{s.client_email || ''}</div></td>
                              <td className="px-4 py-3 text-slate-300">{s.supplier}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-400">{s.awb || '—'}</td>
                              <td className="px-4 py-3 text-slate-400 text-xs">{s.packages || '—'} / {s.weight_kg ? s.weight_kg.toLocaleString() + 'kg' : '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 bg-white/8 rounded overflow-hidden">
                                    <div className="h-full rounded" style={{ width: `${prog}%`, background: prog === 100 ? '#22c55e' : prog > 50 ? '#3b82f6' : '#f59e0b' }} />
                                  </div>
                                  <span className="text-xs text-slate-500">{prog}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <div className="flex gap-1.5">
                                  <button onClick={() => setEditingShipment(s)} className="text-xs bg-white/6 hover:bg-white/10 border border-white/8 rounded px-2 py-1.5 text-slate-300 transition-colors">✏️ Edit</button>
                                  <button onClick={() => setShowEmailModal(s)} className="text-xs bg-white/6 hover:bg-white/10 border border-white/8 rounded px-2 py-1.5 text-slate-300 transition-colors">📧</button>
                                </div>
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

          {/* AI */}
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
                  {aiLoading && <div className="flex gap-3 items-center"><div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center">🤖</div><div className="bg-white/6 border border-white/8 rounded-xl px-4 py-3 text-sm text-slate-500">Thinking…</div></div>}
                </div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {["What's urgent?", "Summarize live files", "Which docs are missing?", "Show all exports"].map(q => (
                    <button key={q} onClick={() => sendAiMessage(q)} className="text-xs bg-white/6 hover:bg-white/10 border border-white/8 rounded-lg px-3 py-2 text-slate-400">{q}</button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAiMessage()} placeholder="Ask anything…"
                    className="flex-1 bg-white/6 border border-white/8 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600" />
                  <button onClick={() => sendAiMessage()} className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium">Send ↗</button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* DETAIL MODAL */}
      {selectedShipment && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-5" onClick={e => e.target === e.currentTarget && setSelectedShipment(null)}>
          <div className="bg-[#1a2d45] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#1a2d45] border-b border-white/8 px-6 py-4 flex items-start justify-between z-10">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-base font-semibold">{selectedShipment.file_number}</h2>
                  <TypeBadge type={(selectedShipment as any).shipment_type || 'Import'} />
                  <StatusBadge status={selectedShipment.status} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{selectedShipment.supplier} → {selectedShipment.client_name}</div>
              </div>
              <button onClick={() => setSelectedShipment(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none px-1">✕</button>
            </div>
            <div className="p-6">
              <div className="mb-5">
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Progress</span>
                  <span className="text-sm font-semibold text-blue-300">{getProgress(selectedShipment.checklist)}%</span>
                </div>
                <div className="h-2 bg-white/8 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${getProgress(selectedShipment.checklist)}%`, background: getProgress(selectedShipment.checklist) === 100 ? '#22c55e' : '#3b82f6' }} />
                </div>
              </div>

              {/* Change status inline */}
              <div className="mb-5">
                <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">Change Status</div>
                <div className="flex flex-wrap gap-2">
                  {ALL_STATUSES.map(s => (
                    <button key={s} onClick={() => updateStatus(selectedShipment, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${selectedShipment.status === s ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/4 border-white/8 text-slate-400 hover:border-white/20 hover:text-slate-200'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {([['AWB', selectedShipment.awb], ['Agent', selectedShipment.agent], ['Origin', selectedShipment.origin], ['Arrival', selectedShipment.arrival_date ? new Date(selectedShipment.arrival_date).toLocaleDateString('fr-FR') : 'Pending'], ['Packages', selectedShipment.packages?.toString()], ['Weight', selectedShipment.weight_kg ? selectedShipment.weight_kg.toLocaleString() + ' kg' : null]] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</div>
                    <div className="text-sm text-slate-200">{value}</div>
                  </div>
                ))}
                {selectedShipment.delivery_address && <div className="col-span-2"><div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Delivery Address</div><div className="text-sm text-slate-200 whitespace-pre-line">{selectedShipment.delivery_address}</div></div>}
                {selectedShipment.notes && <div className="col-span-2"><div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Notes</div><div className="text-sm text-slate-400">{selectedShipment.notes}</div></div>}
              </div>

              <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Checklist</div>
              <ChecklistPanel shipment={selectedShipment} onUpdate={fetchShipments} />

              <div className="flex gap-2 mt-5 flex-wrap">
                <button onClick={() => { setEditingShipment(selectedShipment); setSelectedShipment(null) }}
                  className="text-sm bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 text-blue-300 px-3 py-2 rounded-lg">✏️ Edit</button>
                <button onClick={() => { setShowEmailModal(selectedShipment); setSelectedShipment(null) }}
                  className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-300 px-3 py-2 rounded-lg">📧 Email</button>
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/confirm/${selectedShipment.consignee_token}`); toast.success('Link copied!') }}
                  className="text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-300 px-3 py-2 rounded-lg">🔗 Confirm Link</button>
                <button onClick={async () => { if (!confirm(`Delete ${selectedShipment.file_number}?`)) return; await fetch(`/api/shipments/${selectedShipment.id}`, { method: 'DELETE' }); toast.success('Deleted'); setSelectedShipment(null); fetchShipments() }}
                  className="text-sm bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 px-3 py-2 rounded-lg ml-auto">🗑 Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEmailModal && <EmailModal shipment={showEmailModal} onClose={() => setShowEmailModal(null)} onSend={sendEmail} />}
      {(showNewModal || editingShipment) && (
        <ShipmentModal shipment={editingShipment} onClose={() => { setShowNewModal(false); setEditingShipment(null) }}
          onSave={async (data) => {
            if (editingShipment) {
              const res = await fetch(`/api/shipments/${editingShipment.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
              const r = await res.json()
              if (r.error) { toast.error(r.error); return }
              toast.success('Shipment updated!')
            } else {
              const res = await fetch('/api/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
              const r = await res.json()
              if (r.error) { toast.error(r.error); return }
              toast.success(`File ${r.file_number} opened!`)
            }
            setShowNewModal(false); setEditingShipment(null); fetchShipments()
          }} />
      )}
    </>
  )
}

function ShipmentModal({ shipment, onClose, onSave }: { shipment: Shipment | null; onClose: () => void; onSave: (data: any) => void }) {
  const isEdit = !!shipment
  const [form, setForm] = useState({
    shipment_type: (shipment as any)?.shipment_type || 'Import',
    supplier: shipment?.supplier || '',
    client_name: shipment?.client_name || '',
    client_email: shipment?.client_email || '',
    awb: shipment?.awb || '',
    house_awb: (shipment as any)?.house_awb || '',
    agent: shipment?.agent || '',
    origin: shipment?.origin || '',
    packages: shipment?.packages?.toString() || '',
    weight_kg: shipment?.weight_kg?.toString() || '',
    arrival_date: shipment?.arrival_date || '',
    flight_vessel: (shipment as any)?.flight_vessel || '',
    delivery_address: shipment?.delivery_address || '',
    notes: shipment?.notes || '',
    status: shipment?.status || 'New File',
    quotation: shipment?.quotation || '',
  })
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inp = "w-full bg-[#243d5e] border border-white/14 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600"
  const lbl = "block text-[10px] text-slate-500 uppercase tracking-wide mb-1.5 font-medium"

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-5" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a2d45] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#1a2d45] border-b border-white/8 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold">{isEdit ? `Edit — ${shipment?.file_number}` : 'Open New Shipment File'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
        </div>
        <div className="p-6">
          <div className="mb-5">
            <label className={lbl}>Shipment Type</label>
            <div className="flex gap-3">
              {['Import', 'Export'].map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, shipment_type: t }))}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all
                    ${form.shipment_type === t ? t === 'Import' ? 'bg-sky-500/20 border-sky-500/50 text-sky-300' : 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'bg-white/4 border-white/8 text-slate-500 hover:border-white/20'}`}>
                  {t === 'Import' ? '📥 Import' : '📤 Export'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Supplier *</label><input type="text" value={form.supplier} onChange={set('supplier')} placeholder="Exporter name" className={inp} /></div>
            <div><label className={lbl}>Client *</label><input type="text" value={form.client_name} onChange={set('client_name')} placeholder="Importer/Client name" className={inp} /></div>
            <div><label className={lbl}>Client Email</label><input type="email" value={form.client_email} onChange={set('client_email')} placeholder="contact@client.fr" className={inp} /></div>
            <div><label className={lbl}>Status</label>
              <select value={form.status} onChange={set('status')} className={inp}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className={lbl}>AWB / MAWB</label><input type="text" value={form.awb} onChange={set('awb')} placeholder="e.g. 112-7404-4434" className={inp} /></div>
            <div><label className={lbl}>House AWB</label><input type="text" value={form.house_awb} onChange={set('house_awb')} placeholder="House AWB" className={inp} /></div>
            <div><label className={lbl}>Agent</label><input type="text" value={form.agent} onChange={set('agent')} placeholder="e.g. DTW, BSI" className={inp} /></div>
            <div><label className={lbl}>Origin Country</label><input type="text" value={form.origin} onChange={set('origin')} placeholder="e.g. CHINE, USA" className={inp} /></div>
            <div><label className={lbl}>Packages</label><input type="number" value={form.packages} onChange={set('packages')} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>Weight (kg)</label><input type="number" value={form.weight_kg} onChange={set('weight_kg')} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>Arrival Date</label><input type="date" value={form.arrival_date} onChange={set('arrival_date')} className={inp} /></div>
            <div><label className={lbl}>Flight / Vessel</label><input type="text" value={form.flight_vessel} onChange={set('flight_vessel')} placeholder="e.g. MU-553" className={inp} /></div>
            <div><label className={lbl}>Quotation</label><input type="text" value={form.quotation} onChange={set('quotation')} placeholder="e.g. €1500" className={inp} /></div>
            <div className="col-span-2"><label className={lbl}>Delivery Address</label><textarea value={form.delivery_address} onChange={set('delivery_address')} placeholder="Full delivery address" rows={2} className={inp + ' resize-none'} /></div>
            <div className="col-span-2"><label className={lbl}>Notes</label><textarea value={form.notes} onChange={set('notes')} placeholder="Internal notes…" rows={2} className={inp + ' resize-none'} /></div>
          </div>
          <div className="flex gap-3 mt-6 justify-end border-t border-white/8 pt-5">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-400 rounded-lg">Cancel</button>
            <button onClick={() => {
              if (!form.supplier || !form.client_name) { toast.error('Supplier and Client are required'); return }
              onSave({ ...form, packages: form.packages ? parseInt(form.packages) : null, weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null, arrival_date: form.arrival_date || null })
            }} className="px-5 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium">
              {isEdit ? '✓ Save Changes' : '✓ Open File'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailModal({ shipment, onClose, onSend }: { shipment: Shipment; onClose: () => void; onSend: (id: string, tpl: string, subj?: string, body?: string) => void }) {
  const [tab, setTab] = useState<'arrival' | 'docs_reminder' | 'customs_cleared' | 'custom'>('arrival')
  const [customSubject, setCustomSubject] = useState(`Re: Shipment ${shipment.file_number}`)
  const [customBody, setCustomBody] = useState(`Dear ${shipment.client_name},\n\n\n\nBest regards,\nFreightFlow Team`)
  const inp = "w-full bg-[#243d5e] border border-white/14 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-5" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a2d45] border border-white/10 rounded-2xl w-full max-w-xl">
        <div className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">📧 Send Email — {shipment.file_number}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
        </div>
        <div className="p-6">
          <div className="text-xs text-slate-500 mb-4">To: <span className="text-slate-300">{shipment.client_email || 'No email on file'}</span></div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {([['arrival','📬 New Arrival','Send confirmation link'],['docs_reminder','📋 Docs Reminder','List missing docs'],['customs_cleared','✅ Customs Cleared','Notify clearance'],['custom','✏️ Custom','Write your own']] as const).map(([id, label, desc]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 py-2.5 rounded-lg text-left border transition-all ${tab === id ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-white/4 border-white/8 text-slate-400 hover:border-white/15'}`}>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs opacity-70 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
          {tab === 'custom' && (
            <div className="space-y-3">
              <div><label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Subject</label><input type="text" value={customSubject} onChange={e => setCustomSubject(e.target.value)} className={inp} /></div>
              <div><label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Message</label><textarea value={customBody} onChange={e => setCustomBody(e.target.value)} rows={7} className={inp + ' resize-y'} /></div>
            </div>
          )}
          <div className="flex gap-3 mt-5 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-white/6 hover:bg-white/10 border border-white/8 text-slate-400 rounded-lg">Cancel</button>
            <button onClick={() => onSend(shipment.id, tab, customSubject, customBody)} disabled={!shipment.client_email}
              className="px-5 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50">Send ✓</button>
          </div>
        </div>
      </div>
    </div>
  )
}
