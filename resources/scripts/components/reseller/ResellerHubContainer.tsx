import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
    Wallet,
    Link as LinkIcon,
    DollarSign,
    Copy,
    Check,
    Plus,
    ArrowUpRight,
    Lock,
    ShieldCheck,
    Settings,
    Layers,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ExternalLink,
    Percent,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    getResellerOverview,
    getResellerPlans,
    saveResellerPlanMarkup,
    getResellerPaymentLinks,
    createResellerPaymentLink,
    submitResellerWithdrawal,
    getResellerWithdrawals,
    CoinBalance,
    ResellerPlanConfig,
    PaymentLink,
    ResellerWithdrawal,
} from '@/api/reseller'

export default function ResellerHubContainer() {
    const [loading, setLoading] = useState(true)
    const [isReseller, setIsReseller] = useState(false)
    const [balances, setBalances] = useState<CoinBalance[]>([])
    const [stats, setStats] = useState({ total_links: 0, paid_links: 0, total_withdrawals: 0, min_withdrawal_usd: 10 })

    const [activeTab, setActiveTab] = useState<'links' | 'plans' | 'withdrawals'>('links')

    // Links state
    const [links, setLinks] = useState<PaymentLink[]>([])
    const [plans, setPlans] = useState<ResellerPlanConfig[]>([])
    const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
    const [serverName, setServerName] = useState('')
    const [selectedCoin, setSelectedCoin] = useState('USDT')
    const [copiedUuid, setCopiedUuid] = useState<string | null>(null)
    const [linkCreating, setLinkCreating] = useState(false)
    const [createdUrl, setCreatedUrl] = useState<string | null>(null)

    // Plans markup state
    const [savingPlanId, setSavingPlanId] = useState<number | null>(null)
    const [planMarkups, setPlanMarkups] = useState<{ [key: number]: { model_type: 'own_inventory' | 'zero_cost'; markup_percent: number; custom_price: number } }>({})

    // Withdrawals state
    const [withdrawals, setWithdrawals] = useState<ResellerWithdrawal[]>([])
    const [withdrawCoin, setWithdrawCoin] = useState('USDT')
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [withdrawAddress, setWithdrawAddress] = useState('')
    const [withdrawLoading, setWithdrawLoading] = useState(false)
    const [withdrawMessage, setWithdrawMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
        loadOverviewData()
    }, [])

    const loadOverviewData = async () => {
        setLoading(true)
        try {
            const overview = await getResellerOverview()
            setIsReseller(overview.is_reseller)
            setBalances(overview.balances)
            setStats(overview.stats)

            const plansData = await getResellerPlans()
            setPlans(plansData.plans)
            if (plansData.plans.length > 0) {
                setSelectedPlanId(plansData.plans[0].vps_plan_id)
            }

            const initialMarkups: any = {}
            plansData.plans.forEach(p => {
                initialMarkups[p.vps_plan_id] = {
                    model_type: p.model_type,
                    markup_percent: p.markup_percent,
                    custom_price: p.custom_price,
                }
            })
            setPlanMarkups(initialMarkups)

            const linksData = await getResellerPaymentLinks()
            setLinks(linksData.links.data)

            const withdrawData = await getResellerWithdrawals()
            setWithdrawals(withdrawData.withdrawals.data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateLink = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedPlanId || !serverName) return

        setLinkCreating(true)
        setCreatedUrl(null)
        try {
            // Pick default node (1) and template for demo quick link
            const res = await createResellerPaymentLink({
                vps_plan_id: selectedPlanId,
                node_id: 1,
                template_uuid: '19fb49d7-2d07-414c-adce-ddb4827742cd',
                server_name: serverName,
                coin: selectedCoin,
            })
            setCreatedUrl(res.checkout_url)
            setServerName('')
            // refresh links
            const linksData = await getResellerPaymentLinks()
            setLinks(linksData.links.data)
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Failed to create payment link')
        } finally {
            setLinkCreating(false)
        }
    }

    const handleSaveMarkup = async (planId: number) => {
        const markup = planMarkups[planId]
        if (!markup) return

        setSavingPlanId(planId)
        try {
            await saveResellerPlanMarkup({
                vps_plan_id: planId,
                model_type: markup.model_type,
                markup_percent: Number(markup.markup_percent),
                custom_price: Number(markup.custom_price),
            })
            alert('Markup saved successfully!')
            loadOverviewData()
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Failed to save markup')
        } finally {
            setSavingPlanId(null)
        }
    }

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault()
        setWithdrawMessage(null)
        setWithdrawLoading(true)
        try {
            const res = await submitResellerWithdrawal({
                coin: withdrawCoin,
                amount: Number(withdrawAmount),
                wallet_address: withdrawAddress,
            })
            setWithdrawMessage({ type: 'success', text: res.message })
            setWithdrawAmount('')
            setWithdrawAddress('')
            loadOverviewData()
        } catch (err: any) {
            setWithdrawMessage({ type: 'error', text: err?.response?.data?.message || 'Withdrawal failed' })
        } finally {
            setWithdrawLoading(false)
        }
    }

    const copyToClipboard = (url: string, uuid: string) => {
        navigator.clipboard.writeText(url)
        setCopiedUuid(uuid)
        setTimeout(() => setCopiedUuid(null), 2000)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500"></div>
            </div>
        )
    }

    if (!isReseller) {
        return (
            <div className="p-8 text-center max-w-xl mx-auto my-12 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur-xl">
                <Lock className="w-12 h-12 text-amber-400 mx-auto mb-4 animate-pulse" />
                <h2 className="text-2xl font-bold text-white mb-2">Reseller Access Required</h2>
                <p className="text-slate-400 text-sm mb-6">
                    Reseller Panel privileges have not been enabled for your account yet. Access is strictly granted by platform administrators.
                </p>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 py-1.5 px-4 text-xs">
                    Contact Admin for Authorization
                </Badge>
            </div>
        )
    }

    return (
        <div className="space-y-8 p-4 md:p-6 max-w-7xl mx-auto">
            {/* Top Banner Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/40 border border-cyan-500/20 p-6 md:p-8 backdrop-blur-2xl shadow-2xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 px-3 py-1 font-mono text-xs uppercase tracking-wider">
                                Verified Reseller Partner
                            </Badge>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Platform Protected
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                            Reseller Hub & Wallet
                        </h1>
                        <p className="text-slate-400 text-sm mt-1 max-w-xl">
                            Manage custom plan markups (up to 30% on 0-cost), generate server payment links, and withdraw earnings in zero-swap crypto assets.
                        </p>
                    </div>

                    {/* Header Quick Stats */}
                    <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-center min-w-[120px]">
                            <span className="text-xs text-slate-400 block">Total Links</span>
                            <span className="text-xl font-bold text-white">{stats.total_links}</span>
                        </div>
                        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-center min-w-[120px]">
                            <span className="text-xs text-slate-400 block">Paid Orders</span>
                            <span className="text-xl font-bold text-emerald-400">{stats.paid_links}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Zero-Swap Crypto Balances Ledger */}
            <div>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-cyan-400" /> Zero-Swap Crypto Coin Balances
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {balances.map(b => (
                        <motion.div key={b.coin} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                            <Card className="bg-slate-900/70 border-slate-800 hover:border-cyan-500/40 p-4 rounded-2xl backdrop-blur-xl relative overflow-hidden">
                                <div className="flex items-center justify-between mb-2">
                                    <Badge variant="outline" className="font-bold border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                                        {b.coin}
                                    </Badge>
                                    <span className="text-[10px] text-slate-500 font-mono">LEDGER POOL</span>
                                </div>
                                <div className="mt-2">
                                    <span className="text-2xl font-extrabold text-white tracking-tight">
                                        {b.available_balance.toFixed(4)}
                                    </span>
                                    <span className="text-xs font-mono text-slate-400 ml-1.5">{b.coin}</span>
                                </div>
                                {b.locked_balance > 0 && (
                                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                                        <span className="flex items-center gap-1 text-amber-400">
                                            <Lock className="w-3 h-3" /> Locked:
                                        </span>
                                        <span className="font-mono text-amber-300">{b.locked_balance.toFixed(4)}</span>
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-slate-800 space-x-6 text-sm font-semibold">
                <button
                    onClick={() => setActiveTab('links')}
                    className={cn(
                        'pb-3 border-b-2 transition-all flex items-center gap-2',
                        activeTab === 'links'
                            ? 'border-cyan-500 text-cyan-400'
                            : 'border-transparent text-slate-400 hover:text-white'
                    )}
                >
                    <LinkIcon className="w-4 h-4" /> Server Payment Links
                </button>
                <button
                    onClick={() => setActiveTab('plans')}
                    className={cn(
                        'pb-3 border-b-2 transition-all flex items-center gap-2',
                        activeTab === 'plans'
                            ? 'border-cyan-500 text-cyan-400'
                            : 'border-transparent text-slate-400 hover:text-white'
                    )}
                >
                    <Percent className="w-4 h-4" /> Plans & Markup Manager
                </button>
                <button
                    onClick={() => setActiveTab('withdrawals')}
                    className={cn(
                        'pb-3 border-b-2 transition-all flex items-center gap-2',
                        activeTab === 'withdrawals'
                            ? 'border-cyan-500 text-cyan-400'
                            : 'border-transparent text-slate-400 hover:text-white'
                    )}
                >
                    <DollarSign className="w-4 h-4" /> Crypto Withdrawals ($10 Min)
                </button>
            </div>

            {/* TAB 1: Payment Links */}
            {activeTab === 'links' && (
                <div className="space-y-6">
                    {/* Create Link Card */}
                    <Card className="bg-slate-900/60 border-slate-800 p-6 rounded-2xl">
                        <h4 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                            <Plus className="w-4 h-4 text-cyan-400" /> Generate Server Payment Link for Client
                        </h4>
                        <form onSubmit={handleCreateLink} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Target VPS Plan</label>
                                <select
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                    value={selectedPlanId || ''}
                                    onChange={e => setSelectedPlanId(Number(e.target.value))}
                                >
                                    {plans.map(p => (
                                        <option key={p.vps_plan_id} value={p.vps_plan_id}>
                                            {p.name} — Retail: ${p.custom_price}/mo ({p.model_type === 'zero_cost' ? `${p.markup_percent}% Markup` : 'Own Inv'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Server Name</label>
                                <input
                                    placeholder="e.g. Client-VPS-Node01"
                                    value={serverName}
                                    onChange={e => setServerName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Payment Crypto Coin</label>
                                <select
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                    value={selectedCoin}
                                    onChange={e => setSelectedCoin(e.target.value)}
                                >
                                    <option value="USDT">USDT</option>
                                    <option value="SOL">SOL (Solana)</option>
                                    <option value="BTC">BTC (Bitcoin)</option>
                                    <option value="LTC">LTC (Litecoin)</option>
                                    <option value="ETH">ETH (Ethereum)</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    disabled={linkCreating || !serverName}
                                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2 rounded-lg text-sm transition"
                                >
                                    {linkCreating ? 'Generating...' : 'Generate Payment Link'}
                                </button>
                            </div>
                        </form>

                        {createdUrl && (
                            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                                <div className="truncate mr-4">
                                    <span className="text-xs text-emerald-400 font-bold block mb-1">Generated Link Ready:</span>
                                    <span className="text-sm font-mono text-white truncate">{createdUrl}</span>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(createdUrl, 'new')}
                                    className="bg-emerald-500 text-slate-950 font-bold text-xs shrink-0 px-3 py-1.5 rounded-lg flex items-center"
                                >
                                    {copiedUuid === 'new' ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                                    Copy Link
                                </button>
                            </div>
                        )}
                    </Card>

                    {/* Payment Links Table */}
                    <Card className="bg-slate-900/60 border-slate-800 rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800">
                            <h4 className="font-bold text-white text-sm">Active & Historic Payment Links</h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-950/40">
                                        <th className="p-3">Server Name</th>
                                        <th className="p-3">Model</th>
                                        <th className="p-3">Retail Price</th>
                                        <th className="p-3">Reseller Profit</th>
                                        <th className="p-3">Coin</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {links.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-6 text-center text-slate-500">
                                                No payment links created yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        links.map(link => {
                                            const url = `${window.location.origin}/pay/${link.uuid}`
                                            return (
                                                <tr key={link.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                                                    <td className="p-3 font-semibold text-white">{link.server_name}</td>
                                                    <td className="p-3">
                                                        <Badge variant="outline" className="text-[10px] uppercase border-slate-700">
                                                            {link.model_type}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 font-mono text-slate-200">${link.selling_price}</td>
                                                    <td className="p-3 font-mono text-emerald-400">+${link.markup_amount}</td>
                                                    <td className="p-3 font-mono text-cyan-400">{link.coin}</td>
                                                    <td className="p-3">
                                                        {link.status === 'paid' ? (
                                                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                                                PAID & PROVISIONED
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                                                PENDING PAYMENT
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        <button
                                                            onClick={() => copyToClipboard(url, link.uuid)}
                                                            className="text-xs bg-slate-950 border border-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-md flex items-center"
                                                        >
                                                            {copiedUuid === link.uuid ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 2: Plans & Markup Manager */}
            {activeTab === 'plans' && (
                <div className="space-y-6">
                    <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-start gap-3">
                        <Percent className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-300">
                            <span className="font-bold text-white block mb-0.5">Markup Rules & Capping:</span>
                            For <strong>0-Cost (Dropshipping)</strong> model, custom markups are capped up to <strong>30% max</strong> over our base plan price. For <strong>Own Inventory</strong> model, custom wholesale prices can be set freely.
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {plans.map(p => {
                            const config = planMarkups[p.vps_plan_id] || { model_type: p.model_type, markup_percent: p.markup_percent, custom_price: p.custom_price }

                            return (
                                <Card key={p.vps_plan_id} className="bg-slate-900/60 border-slate-800 p-6 rounded-2xl space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                        <h4 className="font-bold text-white text-lg">{p.name}</h4>
                                        <Badge className="bg-slate-800 text-slate-300 font-mono text-xs">
                                            Base: ${p.base_price}/mo
                                        </Badge>
                                    </div>

                                    <div className="text-xs text-slate-400 space-y-1 font-mono">
                                        <div>CPU: {p.cpu} Core(s)</div>
                                        <div>RAM: {p.ram} MB</div>
                                        <div>Disk: {p.disk} GB NVMe</div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Operating Model</label>
                                            <select
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                                                value={config.model_type}
                                                onChange={e => {
                                                    const mType = e.target.value as any
                                                    setPlanMarkups({
                                                        ...planMarkups,
                                                        [p.vps_plan_id]: { ...config, model_type: mType },
                                                    })
                                                }}
                                            >
                                                <option value="zero_cost">0-Cost Dropshipping (Max 30% Markup)</option>
                                                <option value="own_inventory">Own Inventory (Custom Price)</option>
                                            </select>
                                        </div>

                                        {config.model_type === 'zero_cost' ? (
                                            <div>
                                                <label className="text-xs text-slate-400 mb-1 block flex justify-between">
                                                    <span>Markup Percentage</span>
                                                    <span className="text-cyan-400 font-bold">{config.markup_percent}% (Max 30%)</span>
                                                </label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="30"
                                                    step="1"
                                                    value={config.markup_percent}
                                                    onChange={e => {
                                                        const pct = Number(e.target.value)
                                                        const calcPrice = roundTwo(p.base_price * (1 + pct / 100))
                                                        setPlanMarkups({
                                                            ...planMarkups,
                                                            [p.vps_plan_id]: { ...config, markup_percent: pct, custom_price: calcPrice },
                                                        })
                                                    }}
                                                    className="w-full accent-cyan-500 cursor-pointer"
                                                />
                                                <div className="text-xs text-slate-400 font-mono mt-1 text-right">
                                                    Client Retail: <span className="text-emerald-400 font-bold">${roundTwo(p.base_price * (1 + config.markup_percent / 100))}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="text-xs text-slate-400 mb-1 block">Custom Selling Price ($)</label>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    value={config.custom_price}
                                                    onChange={e => {
                                                        setPlanMarkups({
                                                            ...planMarkups,
                                                            [p.vps_plan_id]: { ...config, custom_price: Number(e.target.value) },
                                                        })
                                                    }}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs"
                                                />
                                            </div>
                                        )}

                                        <button
                                            onClick={() => handleSaveMarkup(p.vps_plan_id)}
                                            disabled={savingPlanId === p.vps_plan_id}
                                            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2 rounded-lg transition"
                                        >
                                            {savingPlanId === p.vps_plan_id ? 'Saving...' : 'Save Config'}
                                        </button>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* TAB 3: Crypto Withdrawals */}
            {activeTab === 'withdrawals' && (
                <div className="space-y-6">
                    <Card className="bg-slate-900/60 border-slate-800 p-6 rounded-2xl">
                        <h4 className="text-md font-bold text-white mb-2 flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-400" /> Request Zero-Swap Crypto Payout
                        </h4>
                        <p className="text-xs text-slate-400 mb-6">
                            Minimum withdrawal threshold is <strong>$10 USD equivalent</strong>. Funds are paid out in the exact cryptocurrency asset earned from your client sales, incurring 0 platform swap fees.
                        </p>

                        <form onSubmit={handleWithdraw} className="space-y-4 max-w-xl">
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Select Coin Ledger</label>
                                <select
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                                    value={withdrawCoin}
                                    onChange={e => setWithdrawCoin(e.target.value)}
                                >
                                    {balances.map(b => (
                                        <option key={b.coin} value={b.coin}>
                                            {b.coin} (Available: {b.available_balance.toFixed(4)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Withdrawal Amount ({withdrawCoin})</label>
                                <input
                                    type="number"
                                    step="any"
                                    placeholder="e.g. 15.00"
                                    value={withdrawAmount}
                                    onChange={e => setWithdrawAmount(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Destination Crypto Wallet Address</label>
                                <input
                                    placeholder={`Enter your ${withdrawCoin} wallet address`}
                                    value={withdrawAddress}
                                    onChange={e => setWithdrawAddress(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-sm"
                                />
                            </div>

                            {withdrawMessage && (
                                <div
                                    className={cn(
                                        'p-3 rounded-xl text-xs border',
                                        withdrawMessage.type === 'success'
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                    )}
                                >
                                    {withdrawMessage.text}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={withdrawLoading || !withdrawAmount || !withdrawAddress}
                                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-6 py-2.5 rounded-lg transition"
                            >
                                {withdrawLoading ? 'Submitting...' : 'Submit Withdrawal Request'}
                            </button>
                        </form>
                    </Card>

                    {/* Withdrawal History Table */}
                    <Card className="bg-slate-900/60 border-slate-800 rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800">
                            <h4 className="font-bold text-white text-sm">Payout History & Status</h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-950/40">
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Amount</th>
                                        <th className="p-3">Coin</th>
                                        <th className="p-3">Wallet Address</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">TxID Hash</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {withdrawals.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-6 text-center text-slate-500">
                                                No withdrawal requests submitted yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        withdrawals.map(w => (
                                            <tr key={w.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                                                <td className="p-3 font-mono text-xs text-slate-400">
                                                    {new Date(w.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="p-3 font-mono font-bold text-white">{w.amount}</td>
                                                <td className="p-3 font-mono text-cyan-400">{w.coin}</td>
                                                <td className="p-3 font-mono text-xs text-slate-300 truncate max-w-[180px]">
                                                    {w.wallet_address}
                                                </td>
                                                <td className="p-3">
                                                    {w.status === 'approved' ? (
                                                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                                            APPROVED & PAID
                                                        </Badge>
                                                    ) : w.status === 'rejected' ? (
                                                        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px]">
                                                            REJECTED / REFUNDED
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                                            PENDING APPROVAL
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="p-3 font-mono text-xs text-slate-400">
                                                    {w.tx_hash ? (
                                                        <span className="text-cyan-400 truncate block max-w-[140px]" title={w.tx_hash}>
                                                            {w.tx_hash}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-600">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}

function roundTwo(val: number) {
    return Math.round(val * 100) / 100
}
