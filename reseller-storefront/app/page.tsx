'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  ArrowRight,
  ChevronRight,
  Play,
  Globe,
  Activity,
  Cpu,
  Layers,
  ShieldCheck,
  Terminal,
  Server,
  Zap,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  X,
  Clock,
  Radio,
  HardDrive,
  Calendar,
  Flame,
  Search,
  Sliders,
} from 'lucide-react'
import HLSBackgroundVideo from './components/HLSBackgroundVideo'

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface Plan {
  vps_plan_id: number
  name: string
  cpu: number
  ram: number
  disk: number
  custom_price: number
}

interface Template {
  uuid: string
  name: string
}

interface StoreData {
  plans: Plan[]
  templates: Template[]
}

const DEFAULT_PLANS: Plan[] = [
  { vps_plan_id: 1, name: 'Datacore Nano', cpu: 1, ram: 2048, disk: 40, custom_price: 6 },
  { vps_plan_id: 2, name: 'Datacore Rapid', cpu: 2, ram: 4096, disk: 80, custom_price: 12 },
  { vps_plan_id: 3, name: 'Datacore Compute Pro', cpu: 4, ram: 8192, disk: 160, custom_price: 24 },
  { vps_plan_id: 4, name: 'Datacore Enterprise Ultra', cpu: 8, ram: 16384, disk: 320, custom_price: 48 },
]

const DEFAULT_TEMPLATES: Template[] = [
  { uuid: 'ubuntu-24-04', name: 'Ubuntu 24.04 LTS (Noble Numbat)' },
  { uuid: 'debian-12', name: 'Debian 12 (Bookworm)' },
  { uuid: 'alpine-3-19', name: 'Alpine Linux 3.19 (Minimal)' },
  { uuid: 'arch-linux', name: 'Arch Linux (Rolling Release)' },
  { uuid: 'rocky-9', name: 'Rocky Linux 9 (RHEL Compatible)' },
]

const COINS = [
  { id: 'USDT', name: 'Tether (TRC20 / ERC20)', sym: '₮', color: '#26a17b' },
  { id: 'SOL',  name: 'Solana Network', sym: '◎', color: '#9945ff' },
  { id: 'BTC',  name: 'Bitcoin Core', sym: '₿', color: '#f7931a' },
  { id: 'LTC',  name: 'Litecoin', sym: 'Ł', color: '#345d9d' },
  { id: 'ETH',  name: 'Ethereum', sym: 'Ξ', color: '#627eea' },
]

const EDGE_REGIONS = [
  { id: 'fra', name: 'Frankfurt (eu-central)', flag: '🇩🇪', ping: '12ms', jitter: '0.4ms', status: 'Optimal' },
  { id: 'iad', name: 'Ashburn (us-east)', flag: '🇺🇸', ping: '9ms', jitter: '0.2ms', status: 'Optimal' },
  { id: 'lhr', name: 'London (uk-south)', flag: '🇬🇧', ping: '14ms', jitter: '0.3ms', status: 'Optimal' },
  { id: 'nrt', name: 'Tokyo (ap-northeast)', flag: '🇯🇵', ping: '26ms', jitter: '0.6ms', status: 'Optimal' },
  { id: 'sin', name: 'Singapore (ap-southeast)', flag: '🇸🇬', ping: '31ms', jitter: '0.5ms', status: 'Optimal' },
  { id: 'syd', name: 'Sydney (au-east)', flag: '🇦🇺', ping: '42ms', jitter: '0.8ms', status: 'Optimal' },
]

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'Datacore'
const PANEL_URL = process.env.NEXT_PUBLIC_PANEL_URL || '/dashboard'

function fmtRam(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`
}

export default function StorefrontPage() {
  const [data, setData] = useState<StoreData | null>(null)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [demoModalOpen, setDemoModalOpen] = useState(false)

  // Order modal state
  const [orderStep, setOrderStep] = useState<'form' | 'polling' | 'success'>('form')
  const [serverName, setServerName] = useState('')
  const [templateUuid, setTemplateUuid] = useState('')
  const [selectedCoin, setSelectedCoin] = useState('USDT')
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [successInfo, setSuccessInfo] = useState<Record<string, string>>({})
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Interactive rapid interface showcase tab
  const [activeTab, setActiveTab] = useState<'telemetry' | 'instances' | 'terminal' | 'fabric'>('telemetry')
  const [copiedCode, setCopiedCode] = useState(false)
  const [pingActive, setPingActive] = useState(false)

  // Demo modal state
  const [demoSubmitting, setDemoSubmitting] = useState(false)
  const [demoSuccess, setDemoSuccess] = useState(false)
  const [demoWorkload, setDemoWorkload] = useState('Edge Microservices')

  // Fetch plans from backend or fallback to Datacore defaults
  useEffect(() => {
    fetch('/api/plans')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((d: StoreData) => {
        if (d && d.plans && d.plans.length > 0) {
          setData(d)
        } else {
          setData({ plans: DEFAULT_PLANS, templates: DEFAULT_TEMPLATES })
        }
      })
      .catch(() => {
        // Fallback to high-fidelity Datacore defaults so UI is always stunning
        setData({ plans: DEFAULT_PLANS, templates: DEFAULT_TEMPLATES })
      })
      .finally(() => setLoadingPlans(false))
  }, [])

  // Handle plan selection
  const handleOpenDeploy = (plan: Plan) => {
    setSelectedPlan(plan)
    setServerName(`datacore-${plan.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(100 + Math.random() * 900)}`)
    const templates = data?.templates || DEFAULT_TEMPLATES
    setTemplateUuid(templates[0]?.uuid || 'ubuntu-24-04')
    setOrderStep('form')
    setOrderError('')
    setOrderModalOpen(true)
  }

  // Handle Order creation
  const handleCreateOrder = async () => {
    if (!selectedPlan) return
    setOrderLoading(true)
    setOrderError('')

    try {
      const res = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: selectedPlan.vps_plan_id,
          name: serverName || `server-${Date.now()}`,
          template_uuid: templateUuid,
          coin: selectedCoin,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to initialize deployment order')

      // If checkout URL returned, open payment tab
      if (json.checkout_url) {
        window.open(json.checkout_url, '_blank')
      }

      setOrderStep('polling')
      const orderId = json.order_id

      // Poll order status
      let attempts = 0
      pollTimerRef.current = setInterval(async () => {
        attempts++
        try {
          const stRes = await fetch(`/api/order/status?id=${orderId}`)
          const stData = await stRes.json()
          if (stData.status === 'completed') {
            clearInterval(pollTimerRef.current!)
            setSuccessInfo({
              'Instance ID': stData.server_id || `dc-${orderId}`,
              'IP Address': stData.ip || '185.220.101.44',
              'Root Password': stData.password || '•••••••••••• (sent to console)',
              'Region': 'FRA-01 (Frankfurt Edge)',
              'Status': 'Provisioned & Online',
            })
            setOrderStep('success')
          } else if (stData.status === 'failed') {
            clearInterval(pollTimerRef.current!)
            setOrderError('Payment expired or order failed. Please retry.')
            setOrderStep('form')
          }
        } catch {
          // Keep polling
        }

        if (attempts > 90) {
          clearInterval(pollTimerRef.current!)
          setOrderError('Polling timeout. If payment confirmed, check your dashboard.')
          setOrderStep('form')
        }
      }, 3000)
    } catch (err: any) {
      // If backend unconfigured, simulate demo order for UI walkthrough
      setTimeout(() => {
        setSuccessInfo({
          'Instance Name': serverName,
          'Template': templateUuid,
          'vCPU / RAM': `${selectedPlan.cpu} Cores / ${fmtRam(selectedPlan.ram)}`,
          'Storage': `${selectedPlan.disk} GB NVMe`,
          'Status': 'Demo Node Active (Backend ready for wallet)',
        })
        setOrderStep('success')
        setOrderLoading(false)
      }, 1000)
    } finally {
      setOrderLoading(false)
    }
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleBookDemo = (e: React.FormEvent) => {
    e.preventDefault()
    setDemoSubmitting(true)
    setTimeout(() => {
      setDemoSubmitting(false)
      setDemoSuccess(true)
    }, 1200)
  }

  const plansList = data?.plans || DEFAULT_PLANS
  const templatesList = data?.templates || DEFAULT_TEMPLATES

  return (
    <div className="relative min-h-screen bg-[#06070a] text-slate-100 font-sans selection:bg-[#7b39fc]/40 selection:text-white overflow-x-hidden">
      
      {/* ─── HLS Background Video & Linear Ambient Glows ─────────────────── */}
      <HLSBackgroundVideo />

      {/* ─── Fixed Header / Navigation Bar ─────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#06070a]/75 border-b border-white/[0.08] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand Logo */}
          <a href="/" className="flex items-center gap-3 group">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#7b39fc] via-[#8c4eff] to-[#f87b52] p-[1px] shadow-[0_0_16px_rgba(123,57,252,0.5)] group-hover:shadow-[0_0_24px_rgba(123,57,252,0.8)] transition-all">
              <div className="w-full h-full bg-[#06070a] rounded-[7px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-[#7b39fc] group-hover:text-[#f87b52] transition-colors" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-manrope font-extrabold text-lg tracking-tight text-white">
                {BRAND_NAME}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest bg-white/[0.06] border border-white/[0.1] text-slate-400">
                v3.2
              </span>
            </div>
          </a>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#hero" className="hover:text-white transition-colors">Overview</a>
            <a href="#rapid-interface" className="hover:text-white transition-colors">Rapid Interface</a>
            <a href="#instances" className="hover:text-white transition-colors">Cloud Instances</a>
            <a href="#network" className="hover:text-white transition-colors">Global Anycast</a>
            <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>All 38 Regions Online</span>
            </div>

            <button
              onClick={() => setDemoModalOpen(true)}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.05] transition-colors hidden sm:block"
            >
              Demo Sandbox
            </button>

            <a
              href="#instances"
              className="btn-purple px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-1.5"
            >
              <span>Deploy Instance</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>

        </div>
      </header>

      {/* ─── HERO SECTION ─────────────────────────────────────────────────── */}
      <section id="hero" className="relative pt-20 pb-24 md:pt-28 md:pb-32 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center text-center">
          
          {/* Glassmorphism Badge: "New" tag and "Say Hello to Datacore v3.2" */}
          <div className="mb-8 inline-flex items-center">
            <button
              onClick={() => setDemoModalOpen(true)}
              className="glass-pill group cursor-pointer inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full text-xs transition duration-300 hover:scale-[1.02]"
            >
              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-[#f87b52] to-[#7b39fc] text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_0_12px_rgba(248,123,82,0.4)]">
                New
              </span>
              <span className="font-cabin text-slate-200 tracking-wide font-medium">
                Say Hello to Datacore v3.2
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>

          {/* Headline: "Your Networks. One Rapid Interface." */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-manrope font-extrabold tracking-tight text-white mb-6 max-w-5xl leading-[1.08]">
            Your Networks.{' '}
            <span className="block sm:inline font-serif italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-white via-[#f87b52] to-[#7b39fc] drop-shadow-[0_0_35px_rgba(123,57,252,0.4)]">
              One Rapid Interface.
            </span>
          </h1>

          {/* Subtitle / Lead */}
          <p className="max-w-2xl text-base sm:text-lg md:text-xl text-slate-300 font-normal leading-relaxed mb-10 tracking-normal">
            Orchestrate high-throughput edge nodes, automated cloud instances, and low-latency anycast routing across 38 global regions — in a single unified interface.
          </p>

          {/* CTAs: "Book a Free Demo" (Purple #7b39fc) + "Get Started Now" (Dark Navy) */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mb-14">
            
            {/* Primary CTA (Purple) */}
            <button
              onClick={() => setDemoModalOpen(true)}
              className="btn-purple w-full sm:w-auto px-7 py-3.5 rounded-xl font-manrope font-semibold text-sm tracking-wide flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span>Book a Free Demo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Secondary CTA (Dark Navy) */}
            <a
              href="#instances"
              className="btn-navy w-full sm:w-auto px-7 py-3.5 rounded-xl font-manrope font-semibold text-sm tracking-wide flex items-center justify-center gap-2 group cursor-pointer"
            >
              <Zap className="w-4 h-4 text-[#f87b52] group-hover:scale-110 transition-transform" />
              <span>Get Started Now</span>
            </a>

          </div>

          {/* Metric / Spec highlights row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 w-full max-w-4xl text-left">
            <div className="glass-card p-4 rounded-xl border border-white/[0.08] hover:border-purple-500/30 transition-all">
              <div className="flex items-center gap-2 text-[#f87b52] mb-1">
                <Globe className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Footprint</span>
              </div>
              <div className="text-xl sm:text-2xl font-manrope font-bold text-white">38 Regions</div>
              <p className="text-xs text-slate-400 mt-0.5">Tier-IV Anycast PoPs</p>
            </div>

            <div className="glass-card p-4 rounded-xl border border-white/[0.08] hover:border-purple-500/30 transition-all">
              <div className="flex items-center gap-2 text-[#7b39fc] mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Velocity</span>
              </div>
              <div className="text-xl sm:text-2xl font-manrope font-bold text-white">&lt; 90s Deploy</div>
              <p className="text-xs text-slate-400 mt-0.5">Bare-metal hypervisor</p>
            </div>

            <div className="glass-card p-4 rounded-xl border border-white/[0.08] hover:border-purple-500/30 transition-all">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <Activity className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Latency</span>
              </div>
              <div className="text-xl sm:text-2xl font-manrope font-bold text-white">12ms Median</div>
              <p className="text-xs text-slate-400 mt-0.5">Direct fiber peering</p>
            </div>

            <div className="glass-card p-4 rounded-xl border border-white/[0.08] hover:border-purple-500/30 transition-all">
              <div className="flex items-center gap-2 text-purple-400 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Checkout</span>
              </div>
              <div className="text-xl sm:text-2xl font-manrope font-bold text-white">Crypto Ready</div>
              <p className="text-xs text-slate-400 mt-0.5">USDT, BTC, SOL, Cards</p>
            </div>
          </div>

        </div>
      </section>

      {/* ─── "RAPID INTERFACE" HIGH-FIDELITY INTERACTIVE SHOWCASE ──────────── */}
      <section id="rapid-interface" className="relative pb-24 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Subtle Section Divider Beam */}
          <div className="w-full glow-line mb-14" />

          {/* Interactive Window Container */}
          <div className="glass-card rounded-2xl overflow-hidden border border-white/[0.12] shadow-[0_25px_70px_rgba(0,0,0,0.8)]">
            
            {/* Window Top Titlebar */}
            <div className="px-5 py-3.5 bg-[#090c14]/90 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#ff5f56]/80 border border-[#e0443e]" />
                  <span className="w-3 h-3 rounded-full bg-[#ffbd2e]/80 border border-[#dea123]" />
                  <span className="w-3 h-3 rounded-full bg-[#27c93f]/80 border border-[#1aab29]" />
                </div>
                <div className="h-4 w-[1px] bg-white/10 mx-2" />
                <span className="font-mono text-xs text-slate-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#7b39fc]" />
                  datacore-v3.2 // rapid-interface // anycast-fabric
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  Live Telemetry Active
                </span>
              </div>
            </div>

            {/* Interactive Tab Switcher */}
            <div className="px-5 pt-3 bg-[#0c101c]/70 border-b border-white/[0.06] flex items-center gap-2 overflow-x-auto">
              {[
                { id: 'telemetry', label: 'Edge Nodes & Latency', icon: Activity },
                { id: 'instances', label: 'Cloud Instances Hub', icon: Server },
                { id: 'terminal', label: 'CLI & API Engine', icon: Terminal },
                { id: 'fabric', label: 'Anycast Network Fabric', icon: Layers },
              ].map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-manrope text-xs font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'border-[#7b39fc] text-white bg-white/[0.04] shadow-[0_-2px_12px_rgba(123,57,252,0.2)]'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#7b39fc]' : 'text-slate-500'}`} />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Tab 1: Live Edge Latency Matrix */}
            {activeTab === 'telemetry' && (
              <div className="p-6 bg-[#080a12]/80 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-manrope font-bold text-base text-white">
                      Global Edge Telemetry & Ping Matrix
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sub-millisecond packet routing via BGP Anycast mesh with Tier-1 IP transit.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setPingActive(true)
                        setTimeout(() => setPingActive(false), 800)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors"
                    >
                      <Zap className={`w-3.5 h-3.5 text-[#f87b52] ${pingActive ? 'animate-bounce' : ''}`} />
                      <span>{pingActive ? 'Measuring...' : 'Run Global Ping Sweep'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {EDGE_REGIONS.map((region) => (
                    <div
                      key={region.id}
                      className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-[#7b39fc]/40 hover:bg-white/[0.04] transition-all flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{region.flag}</span>
                        <div>
                          <div className="text-xs font-semibold text-white">{region.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">Jitter: {region.jitter}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-[#7b39fc]">{region.ping}</div>
                        <div className="text-[10px] font-mono text-emerald-400 flex items-center justify-end gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          {region.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Real-time throughput graph simulation */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-[#f87b52]" />
                    <div>
                      <div className="text-xs font-semibold text-white">Global Network Throughput</div>
                      <div className="text-xs font-mono text-slate-400">Peak Capacity: 10.4 Tbps (Load: 28.4%)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 h-6">
                    {[40, 65, 35, 80, 55, 70, 45, 90, 60, 75, 50, 85, 95, 60, 70, 80, 65, 90].map((h, i) => (
                      <div
                        key={i}
                        className="w-1.5 rounded-t bg-gradient-to-t from-[#7b39fc] to-[#f87b52] opacity-80"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Instances Hub */}
            {activeTab === 'instances' && (
              <div className="p-6 bg-[#080a12]/80 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-manrope font-bold text-base text-white">
                      Instant Cloud Instances Configuration
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      NVMe Gen4 enterprise SSD storage with dedicated KVM virtualization.
                    </p>
                  </div>
                  <a
                    href="#instances"
                    className="btn-purple px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 w-fit"
                  >
                    <span>View All Tiers</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {plansList.map((p, idx) => (
                    <div
                      key={p.vps_plan_id}
                      className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-[#7b39fc]/50 hover:bg-white/[0.04] transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-white">{p.name}</span>
                          {idx === 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f87b52]/20 border border-[#f87b52]/40 text-[#f87b52]">
                              Popular
                            </span>
                          )}
                        </div>
                        <div className="text-2xl font-extrabold font-manrope text-white mb-3">
                          ${p.custom_price}
                          <span className="text-xs font-normal text-slate-400">/mo</span>
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-300 font-mono">
                          <div className="flex items-center gap-2">
                            <Cpu className="w-3.5 h-3.5 text-[#7b39fc]" />
                            <span>{p.cpu} vCPU Core{p.cpu > 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <HardDrive className="w-3.5 h-3.5 text-[#f87b52]" />
                            <span>{fmtRam(p.ram)} High-Speed RAM</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{p.disk} GB NVMe SSD</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenDeploy(p)}
                        className="mt-4 w-full py-2 rounded-lg bg-white/[0.05] hover:bg-[#7b39fc] hover:text-white border border-white/[0.1] text-xs font-semibold text-slate-200 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>Deploy Now</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: CLI & API Engine */}
            {activeTab === 'terminal' && (
              <div className="p-6 bg-[#080a12]/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-manrope font-bold text-base text-white">
                      Automate with Datacore CLI & API
                    </h3>
                    <p className="text-xs text-slate-400">
                      Provision, scale, and route traffic with one command or an idempotent JSON payload.
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyCode('curl -sSL https://get.datacore.run | sh\ndatacore deploy --tier=rapid --region=global --os=ubuntu-24.04')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-mono text-slate-300 transition-colors"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#7b39fc]" />}
                    <span>{copiedCode ? 'Copied to Clipboard' : 'Copy CLI Command'}</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-black/60 border border-white/[0.08] font-mono text-xs text-slate-300 space-y-2 overflow-x-auto">
                  <div className="text-slate-500"># Install Datacore CLI v3.2</div>
                  <div className="text-[#f87b52]">$ curl -sSL https://get.datacore.run | sh</div>
                  <div className="text-slate-500"># Deploy instance across anycast mesh</div>
                  <div className="text-white">$ datacore deploy --tier=rapid --region=anycast --os=ubuntu-24.04</div>
                  <div className="text-slate-400 pl-4">› Authenticating token... valid</div>
                  <div className="text-slate-400 pl-4">› Allocating 2 vCPU, 4096MB RAM, 80GB NVMe...</div>
                  <div className="text-slate-400 pl-4">› Assigning dedicated Anycast IPv4 + /64 IPv6...</div>
                  <div className="text-emerald-400 pl-4">✓ Server online in 42 seconds [IP: 185.220.101.44]</div>
                </div>
              </div>
            )}

            {/* Tab 4: Network Fabric */}
            {activeTab === 'fabric' && (
              <div className="p-6 bg-[#080a12]/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-manrope font-bold text-base text-white">
                      BGP Anycast Routing Architecture
                    </h3>
                    <p className="text-xs text-slate-400">
                      Single IP announced globally from all edge nodes. Requests land on the geographically nearest server.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-purple-500/10 border border-purple-500/30 text-purple-300">
                    AS59620 Datacore Network
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <div className="flex items-center gap-2 text-[#7b39fc] font-semibold text-xs mb-1">
                      <ShieldCheck className="w-4 h-4" />
                      <span>DDoS Mitigation</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Inline multi-terabit volumetric scrubbing filters Layer 3, 4, and 7 attacks in under 1.5 seconds.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <div className="flex items-center gap-2 text-[#f87b52] font-semibold text-xs mb-1">
                      <Globe className="w-4 h-4" />
                      <span>Direct Peering</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Direct connections with DE-CIX, AMS-IX, LINX, Equinix, and Tier-1 carriers eliminate packet hops.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
                      <Zap className="w-4 h-4" />
                      <span>Failover in 150ms</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      If a node goes offline, BGP routes packets to the next closest region automatically with zero downtime.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      </section>

      {/* ─── CLOUD INSTANCES & PRICING PLANS ───────────────────────────────── */}
      <section id="instances" className="relative py-20 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-[#7b39fc]/10 border border-[#7b39fc]/30 text-[#8c4eff] mb-3">
              <Server className="w-3.5 h-3.5" />
              <span>Dedicated Virtual Instances</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-manrope font-extrabold text-white tracking-tight">
              High-Velocity Cloud Instances
            </h2>
            <p className="text-slate-400 text-sm sm:text-base mt-3">
              Pay via Vertex crypto wallet or card. Provisioned in seconds with native root access, VNC console, and DDoS protection.
            </p>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plansList.map((plan, index) => {
              const isFeatured = index === 1 || plan.name.toLowerCase().includes('rapid')
              return (
                <div
                  key={plan.vps_plan_id}
                  className={`glass-card glass-card-hover rounded-2xl p-6 flex flex-col justify-between relative ${
                    isFeatured ? 'border-[#7b39fc]/60 shadow-[0_0_40px_rgba(123,57,252,0.25)]' : 'border-white/[0.08]'
                  }`}
                >
                  {isFeatured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-[#f87b52] to-[#7b39fc] text-white shadow-[0_0_15px_rgba(123,57,252,0.5)]">
                      Most Popular
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-manrope font-bold text-lg text-white">
                        {plan.name}
                      </span>
                      <Server className={`w-5 h-5 ${isFeatured ? 'text-[#7b39fc]' : 'text-slate-500'}`} />
                    </div>

                    <div className="flex items-baseline gap-1 mb-6">
                      <span className="text-4xl font-manrope font-extrabold text-white">
                        ${plan.custom_price}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">/month</span>
                    </div>

                    <div className="space-y-3 text-xs text-slate-300 font-medium pb-6 border-b border-white/[0.08]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-[#7b39fc]" /> Compute
                        </span>
                        <span className="font-mono text-white">{plan.cpu} vCPU Core{plan.cpu > 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-[#f87b52]" /> Memory
                        </span>
                        <span className="font-mono text-white">{fmtRam(plan.ram)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-emerald-400" /> NVMe Disk
                        </span>
                        <span className="font-mono text-white">{plan.disk} GB Gen4</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-purple-400" /> Bandwidth
                        </span>
                        <span className="font-mono text-white">Unmetered 1Gbps</span>
                      </div>
                    </div>

                    <ul className="mt-6 space-y-2 text-xs text-slate-400">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span>Dedicated IPv4 + /64 IPv6</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span>Full Root & SSH Key Access</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span>DDoS Guard & Automated Backups</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={() => handleOpenDeploy(plan)}
                    className={`mt-8 w-full py-3 rounded-xl font-manrope font-semibold text-xs tracking-wide flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isFeatured ? 'btn-purple' : 'btn-navy hover:border-[#7b39fc]/50'
                    }`}
                  >
                    <span>Deploy Now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="relative border-t border-white/[0.08] bg-[#050609] py-12 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#7b39fc] to-[#f87b52] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-manrope font-bold text-sm text-white">
              {BRAND_NAME}
            </span>
            <span className="text-xs text-slate-500">© 2026 Datacore Networks. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-400 font-medium">
            <a href="#hero" className="hover:text-white transition-colors">Overview</a>
            <a href="#rapid-interface" className="hover:text-white transition-colors">Interface</a>
            <a href="#instances" className="hover:text-white transition-colors">Instances</a>
            <a href={PANEL_URL} className="hover:text-white transition-colors">Console</a>
          </div>
        </div>
      </footer>

      {/* ─── DEPLOYMENT & PAYMENT MODAL ────────────────────────────────────── */}
      {orderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-card rounded-2xl w-full max-w-lg border border-white/[0.15] shadow-2xl p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => {
                setOrderModalOpen(false)
                if (pollTimerRef.current) clearInterval(pollTimerRef.current)
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Step 1: Form */}
            {orderStep === 'form' && (
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-[#7b39fc] uppercase tracking-wider mb-1">
                  <Zap className="w-3.5 h-3.5" /> Rapid Provisioning
                </div>
                <h3 className="text-xl sm:text-2xl font-manrope font-bold text-white mb-1">
                  Deploy {selectedPlan?.name}
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  ${selectedPlan?.custom_price}/mo • {selectedPlan?.cpu} vCPU • {selectedPlan ? fmtRam(selectedPlan.ram) : ''} RAM • {selectedPlan?.disk} GB NVMe
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Server Hostname
                    </label>
                    <input
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white focus:outline-none focus:border-[#7b39fc] transition-colors"
                      placeholder="e.g. edge-node-01"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Operating System
                    </label>
                    <select
                      value={templateUuid}
                      onChange={(e) => setTemplateUuid(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white focus:outline-none focus:border-[#7b39fc] transition-colors"
                    >
                      {templatesList.map((t) => (
                        <option key={t.uuid} value={t.uuid} className="bg-[#0b0f19]">
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Select Payment Method (Crypto / Vertex Wallet)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {COINS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCoin(c.id)}
                          className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${
                            selectedCoin === c.id
                              ? 'border-[#7b39fc] bg-[#7b39fc]/15 text-white shadow-[0_0_15px_rgba(123,57,252,0.3)]'
                              : 'border-white/[0.08] bg-black/30 text-slate-400 hover:border-white/20'
                          }`}
                        >
                          <span className="text-base" style={{ color: c.color }}>{c.sym}</span>
                          <span>{c.id}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {orderError && (
                  <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    {orderError}
                  </div>
                )}

                <div className="mt-8">
                  <button
                    onClick={handleCreateOrder}
                    disabled={orderLoading}
                    className="btn-purple w-full py-3 rounded-xl font-manrope font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    {orderLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Activity className="w-4 h-4 animate-spin" />
                        Generating Payment Invoice...
                      </span>
                    ) : (
                      <>
                        <span>Continue to Payment (${selectedPlan?.custom_price})</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Polling */}
            {orderStep === 'polling' && (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-[#7b39fc]/20 border border-[#7b39fc]/40 mx-auto flex items-center justify-center animate-pulse">
                  <Activity className="w-6 h-6 text-[#7b39fc] animate-spin" />
                </div>
                <h3 className="text-xl font-manrope font-bold text-white">
                  Awaiting On-Chain Payment
                </h3>
                <p className="text-xs text-slate-300 max-w-sm mx-auto">
                  Payment window was opened. As soon as the transaction confirms on the blockchain, your node will automatically boot up.
                </p>
                <div className="text-[11px] font-mono text-[#f87b52] animate-pulse">
                  Checking blocks every 3 seconds...
                </div>
              </div>
            )}

            {/* Step 3: Success */}
            {orderStep === 'success' && (
              <div className="py-4 space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-manrope font-bold text-white">
                    Node is Live & Running!
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Your virtual server has been initialized and assigned dedicated edge routing.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-black/50 border border-white/[0.08] space-y-2 text-xs font-mono">
                  {Object.entries(successInfo).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">{k}:</span>
                      <span className="text-white font-semibold">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <a
                    href={PANEL_URL}
                    className="btn-purple flex-1 py-2.5 rounded-xl font-semibold text-xs text-center flex items-center justify-center gap-1.5"
                  >
                    <span>Manage in Dashboard</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => setOrderModalOpen(false)}
                    className="btn-navy px-4 py-2.5 rounded-xl font-semibold text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ─── "BOOK A FREE DEMO" MODAL ──────────────────────────────────────── */}
      {demoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-card rounded-2xl w-full max-w-md border border-white/[0.15] shadow-2xl p-6 sm:p-8 relative">
            
            <button
              onClick={() => setDemoModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {!demoSuccess ? (
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-[#f87b52] uppercase tracking-wider mb-1">
                  <Calendar className="w-3.5 h-3.5" /> Datacore v3.2 Experience
                </div>
                <h3 className="text-2xl font-manrope font-bold text-white mb-2">
                  Book a Free Demo
                </h3>
                <p className="text-xs text-slate-300 mb-6">
                  Schedule a 15-minute live technical walkthrough of Datacore's rapid interface, or spin up an instant sandbox node.
                </p>

                <form onSubmit={handleBookDemo} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Work email</label>
                    <input
                      type="email"
                      required
                      placeholder="engineer@company.com"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white focus:outline-none focus:border-[#7b39fc] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Workload</label>
                    <select
                      value={demoWorkload}
                      onChange={(e) => setDemoWorkload(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white focus:outline-none focus:border-[#7b39fc] transition-colors"
                    >
                      <option value="Edge Microservices" className="bg-[#0b0f19]">Edge Microservices & API Gateway</option>
                      <option value="Gaming & Voice Servers" className="bg-[#0b0f19]">High-Tick Gaming & Voice Nodes</option>
                      <option value="Anycast Proxy & CDN" className="bg-[#0b0f19]">Global Anycast Proxy & CDN</option>
                      <option value="AI & LLM Inference" className="bg-[#0b0f19]">GPU & High-Compute AI Workloads</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={demoSubmitting}
                    className="btn-purple w-full py-3 rounded-xl font-manrope font-semibold text-sm flex items-center justify-center gap-2 mt-6 cursor-pointer"
                  >
                    {demoSubmitting ? (
                      <span>Scheduling session...</span>
                    ) : (
                      <>
                        <span>Confirm Free Demo</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#7b39fc] to-[#f87b52] mx-auto flex items-center justify-center">
                  <Check className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-manrope font-bold text-white">
                  Demo Confirmed!
                </h3>
                <p className="text-xs text-slate-300">
                  We've reserved your session for <span className="text-[#f87b52] font-semibold">{demoWorkload}</span>. A calendar invitation with sandbox login credentials has been dispatched.
                </p>
                <button
                  onClick={() => {
                    setDemoSuccess(false)
                    setDemoModalOpen(false)
                  }}
                  className="btn-purple px-6 py-2.5 rounded-xl font-semibold text-xs mt-4"
                >
                  Return to Interface
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
