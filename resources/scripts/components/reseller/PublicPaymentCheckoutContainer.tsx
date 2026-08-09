import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Cpu, HardDrive, Server as ServerIcon, CheckCircle2, XCircle, ExternalLink, Lock, Coins, Sparkles, TestTube } from 'lucide-react'
import { getPublicPaymentLinkDetails, processPublicPaymentLink } from '@/api/reseller'

export default function PublicPaymentCheckoutContainer() {
    const { uuid } = useParams<{ uuid: string }>()
    const [searchParams] = useSearchParams()

    const [loading, setLoading] = useState(true)
    const [details, setDetails] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const [password, setPassword] = useState('')
    const [simulating, setSimulating] = useState(false)
    const [showSandboxForm, setShowSandboxForm] = useState(false)

    const returnStatus = searchParams.get('status')

    useEffect(() => {
        if (uuid) loadDetails(uuid)
    }, [uuid])

    const loadDetails = async (id: string) => {
        setLoading(true)
        try {
            const data = await getPublicPaymentLinkDetails(id)
            setDetails(data)
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Payment link not found or expired.')
        } finally {
            setLoading(false)
        }
    }

    const handleSimulatePayment = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!uuid) return

        setSimulating(true)
        setError(null)
        try {
            await processPublicPaymentLink(uuid, { account_password: password || 'TestPass123!' })
            loadDetails(uuid)
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Payment processing failed')
        } finally {
            setSimulating(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500"></div>
            </div>
        )
    }

    if (error && !details) {
        return (
            <div className="max-w-md mx-auto my-16 p-6 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <h3 className="text-xl font-bold text-rose-400 mb-2">Checkout Error</h3>
                <p className="text-slate-400 text-sm">{error}</p>
            </div>
        )
    }

    const { payment_link, plan, node, template } = details

    if (payment_link?.status === 'paid' || returnStatus === 'success') {
        return (
            <div className="max-w-lg mx-auto my-16 p-8 text-center bg-slate-900/90 border border-emerald-500/30 rounded-3xl backdrop-blur-2xl space-y-5">
                <div className="flex justify-center">
                    <div className="bg-emerald-500/20 rounded-full p-5">
                        <CheckCircle2 className="w-14 h-14 text-emerald-400 animate-bounce" />
                    </div>
                </div>
                <h2 className="text-2xl font-extrabold text-white">Payment Confirmed!</h2>
                <p className="text-slate-300 text-sm max-w-xs mx-auto">
                    Your VPS <strong className="text-white">{payment_link.server_name}</strong> is provisioned & ready.
                    Reseller earnings credited in <strong className="text-cyan-400">{payment_link.coin}</strong>.
                </p>
                <div className="bg-slate-950/60 border border-emerald-500/20 rounded-xl p-4 text-left space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                        <span className="text-slate-400">Paid Amount</span>
                        <span className="text-emerald-400 font-bold">${payment_link.selling_price} {payment_link.coin}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Server Name</span>
                        <span className="text-white">{payment_link.server_name}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Status</span>
                        <span className="text-emerald-400 font-bold">Completed & Provisioned</span>
                    </div>
                </div>
            </div>
        )
    }

    if (returnStatus === 'cancelled') {
        return (
            <div className="max-w-md mx-auto my-16 p-8 text-center bg-slate-900/90 border border-rose-500/30 rounded-3xl backdrop-blur-2xl space-y-4">
                <div className="flex justify-center">
                    <div className="bg-rose-500/20 rounded-full p-5">
                        <XCircle className="w-14 h-14 text-rose-400" />
                    </div>
                </div>
                <h2 className="text-2xl font-extrabold text-white">Payment Cancelled</h2>
                <p className="text-slate-400 text-sm">Your payment was cancelled. No charge was made.</p>
                <button
                    onClick={() => window.location.href = window.location.pathname}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition text-sm border border-slate-700"
                >
                    Try Again
                </button>
            </div>
        )
    }

    // Check if checkout_url is an external URL (e.g. MaxelPay hosted checkout page)
    const isExternalCheckout = Boolean(
        payment_link.checkout_url && 
        payment_link.checkout_url.startsWith('http') && 
        !payment_link.checkout_url.includes(window.location.host)
    )

    return (
        <div className="max-w-2xl mx-auto my-8 p-4">
            <Card className="bg-slate-900/90 border-slate-800 p-6 md:p-8 rounded-3xl backdrop-blur-2xl space-y-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 mb-2">
                            Partner Hosted VPS
                        </Badge>
                        <h2 className="text-2xl font-bold text-white">{payment_link.server_name}</h2>
                        <span className="text-xs text-slate-400">Sold by {payment_link.reseller_name}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-extrabold text-white font-mono">${payment_link.selling_price}</span>
                        <span className="text-xs text-slate-400 block font-mono">/ month</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                        <Cpu className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                        <span className="text-xs text-slate-400 block">vCPU</span>
                        <span className="font-bold text-white text-sm">{plan?.cpu ?? '-'} Core</span>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                        <ServerIcon className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                        <span className="text-xs text-slate-400 block">RAM</span>
                        <span className="font-bold text-white text-sm">{plan?.ram ?? '-'} MB</span>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                        <HardDrive className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                        <span className="text-xs text-slate-400 block">Storage</span>
                        <span className="font-bold text-white text-sm">{plan?.disk ?? '-'} GB</span>
                    </div>
                </div>

                <div className="space-y-2 text-xs text-slate-400 font-mono bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                    <div>Hypervisor Node: <span className="text-white font-bold">{node ? node.name : 'Default Node'}</span></div>
                    <div>OS Image: <span className="text-white font-bold">{template ? template.name : 'Linux Server'}</span></div>
                    <div>Payment Currency: <span className="text-cyan-400 font-bold">{payment_link.coin}</span></div>
                </div>

                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl">
                        {error}
                    </div>
                )}

                <div className="space-y-3">
                    {/* Primary Button */}
                    {isExternalCheckout ? (
                        <button
                            onClick={() => window.location.href = payment_link.checkout_url}
                            className="w-full bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-base py-4 rounded-xl transition flex items-center justify-center gap-3 shadow-lg shadow-violet-500/20"
                        >
                            <Coins className="w-5 h-5" />
                            Pay ${payment_link.selling_price} with Crypto (Maxelpay)
                            <ExternalLink className="w-4 h-4 opacity-70" />
                        </button>
                    ) : (
                        <button
                            onClick={() => handleSimulatePayment()}
                            disabled={simulating}
                            className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-base py-4 rounded-xl transition flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
                        >
                            <Sparkles className="w-5 h-5 animate-pulse" />
                            {simulating ? 'Processing Test Payment...' : `Complete Test Payment ($${payment_link.selling_price} ${payment_link.coin})`}
                        </button>
                    )}

                    {/* Secondary Test Mode Box */}
                    <div className="border border-slate-800/80 bg-slate-950/40 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-slate-300 font-semibold">
                                <TestTube className="w-4 h-4 text-emerald-400" />
                                <span>Developer Sandbox Mode</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSandboxForm(!showSandboxForm)}
                                className="text-xs text-cyan-400 hover:underline font-mono"
                            >
                                {showSandboxForm ? 'Hide Form' : 'Set Root Password & Test'}
                            </button>
                        </div>

                        {showSandboxForm && (
                            <form onSubmit={handleSimulatePayment} className="space-y-3 pt-2">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Custom Root Password (Optional)</label>
                                    <input
                                        type="password"
                                        placeholder="Default: TestPass123!"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={simulating}
                                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs py-2.5 rounded-lg transition flex items-center justify-center gap-2"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    {simulating ? 'Processing Sandbox Test...' : `Confirm & Deploy VPS ($${payment_link.selling_price})`}
                                </button>
                            </form>
                        )}
                    </div>

                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                        <Lock className="w-3 h-3" />
                        <span>Secure crypto payment powered by <strong className="text-slate-400">Maxelpay</strong></span>
                    </div>
                </div>
            </Card>
        </div>
    )
}
