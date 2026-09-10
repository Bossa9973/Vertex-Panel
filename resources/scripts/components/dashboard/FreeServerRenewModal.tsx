import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X,
    ExternalLink,
    ShieldCheck,
    Clock,
    AlertTriangle,
    RotateCw,
    CheckCircle2,
    Sparkles,
    KeyRound,
    HelpCircle,
} from 'lucide-react'
import {
    startServerActivitySession,
    claimActivityCode,
    ActivityRenewalSession,
} from '@/api/server/activity'

interface Props {
    opened: boolean
    server: {
        id: string
        internal_id: number
        name: string
        hostname: string
        activity_remaining_seconds?: number | null
        lifecycle_phase?: string
    } | null
    onClose: () => void
    onSuccess: () => void
}

const formatSecondsToTime = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return '00:00'
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`
    }
    return `${minutes}m ${seconds}s`
}

export const FreeServerRenewModal: React.FC<Props> = ({
    opened,
    server,
    onClose,
    onSuccess,
}) => {
    const [loadingSession, setLoadingSession] = useState(false)
    const [submittingCode, setSubmittingCode] = useState(false)
    const [session, setSession] = useState<ActivityRenewalSession | null>(null)
    const [claimCode, setClaimCode] = useState('')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)
    const [waitCountdown, setWaitCountdown] = useState<number>(0)

    // Countdown interval for anti-bypass guidance (20s)
    useEffect(() => {
        let timer: any = null
        if (waitCountdown > 0) {
            timer = setInterval(() => {
                setWaitCountdown((prev) => Math.max(0, prev - 1))
            }, 1000)
        }
        return () => {
            if (timer) clearInterval(timer)
        }
    }, [waitCountdown])

    // Reset local state when opened
    useEffect(() => {
        if (opened) {
            setSession(null)
            setClaimCode('')
            setErrorMsg(null)
            setSuccessMsg(null)
            setWaitCountdown(0)
        }
    }, [opened, server?.internal_id])

    if (!opened || !server) return null

    const remainingSecs = server.activity_remaining_seconds ?? 0
    const isCritical = server.lifecycle_phase === 'pre_suspend_critical' || remainingSecs <= 0

    const handleStartLink = async () => {
        setLoadingSession(true)
        setErrorMsg(null)
        try {
            const data = await startServerActivitySession(server.internal_id)
            setSession(data)
            setWaitCountdown(20)

            // Open Shrinkme URL in new window
            if (data.shrinkme_url) {
                window.open(data.shrinkme_url, '_blank', 'noopener,noreferrer')
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.message || 'Failed to generate verification session. Please try again.')
        } finally {
            setLoadingSession(false)
        }
    }

    const handleSubmitCode = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!claimCode.trim()) {
            setErrorMsg('Please enter your claim code.')
            return
        }

        setSubmittingCode(true)
        setErrorMsg(null)
        try {
            const res = await claimActivityCode(server.internal_id, claimCode.trim())
            setSuccessMsg(res.message || 'Server renewed for an additional 72 hours!')
            setTimeout(() => {
                onSuccess()
                onClose()
            }, 1800)
        } catch (err: any) {
            setErrorMsg(err.response?.data?.message || 'Failed to verify claim code. Please check the code and try again.')
        } finally {
            setSubmittingCode(false)
        }
    }

    return (
        <AnimatePresence>
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto'>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    className='relative w-full max-w-lg bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-[0px_0px_120px_-20px_#0900ff] text-white overflow-hidden font-sans text-left'
                >
                    {/* Subtle top glow bar */}
                    <div className='absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent' />

                    {/* Close Button */}
                    <button
                        type='button'
                        onClick={onClose}
                        className='absolute top-5 right-5 p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-gray-400 hover:text-white transition cursor-pointer'
                        aria-label='Close'
                    >
                        <X className='w-4 h-4' />
                    </button>

                    {/* Header */}
                    <div className='flex items-start gap-4 mb-5'>
                        <div className='w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner shrink-0 mt-0.5'>
                            <Clock className='w-6 h-6' />
                        </div>
                        <div>
                            <div className='flex items-center gap-2 flex-wrap'>
                                <span className='text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30'>
                                    Free Plan Activity Check
                                </span>
                                {isCritical && (
                                    <span className='text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-1'>
                                        <AlertTriangle className='w-3 h-3' /> 30m Critical Grace
                                    </span>
                                )}
                            </div>
                            <h3 className='text-xl font-bold text-white mt-1'>
                                Renew Free Server
                            </h3>
                            <p className='text-xs text-gray-400 mt-0.5'>
                                Keep <span className='text-blue-300 font-semibold'>{server.name}</span> active for another 72 hours (3 days).
                            </p>
                        </div>
                    </div>

                    {/* Countdown Status Card */}
                    <div className={`p-4 rounded-2xl border mb-5 flex items-center justify-between ${
                        isCritical
                            ? 'bg-rose-950/30 border-rose-500/40 text-rose-300 shadow-inner'
                            : 'bg-neutral-950/60 border-neutral-800 text-gray-300'
                    }`}>
                        <div className='flex items-center gap-3'>
                            <Clock className={`w-5 h-5 ${isCritical ? 'text-rose-400 animate-pulse' : 'text-blue-400'}`} />
                            <div>
                                <span className='text-[10px] font-bold uppercase tracking-wider block text-gray-400'>
                                    {isCritical ? 'Time Before Suspension' : 'Activity Timer Remaining'}
                                </span>
                                <span className={`text-base font-bold font-mono ${isCritical ? 'text-rose-400' : 'text-white'}`}>
                                    {formatSecondsToTime(remainingSecs)}
                                </span>
                            </div>
                        </div>
                        <span className='text-[11px] font-medium bg-black/40 px-2.5 py-1 rounded-lg border border-white/5 text-gray-300'>
                            +72 Hours on Claim
                        </span>
                    </div>

                    {/* Alerts */}
                    {errorMsg && (
                        <div className='mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium flex items-start gap-2 leading-relaxed'>
                            <AlertTriangle className='w-4 h-4 shrink-0 mt-0.5 text-rose-400' />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div className='mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-medium flex items-center gap-2'>
                            <CheckCircle2 className='w-4 h-4 shrink-0 text-emerald-400' />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    {/* Step 1: Sponsored Link */}
                    <div className='space-y-4'>
                        <div className='p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800'>
                            <div className='flex items-center justify-between mb-2'>
                                <span className='text-xs font-bold text-gray-200 flex items-center gap-2'>
                                    <span className='w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center border border-blue-500/30'>
                                        1
                                    </span>
                                    Open Verification Link
                                </span>
                                {session && (
                                    <span className='text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1'>
                                        <CheckCircle2 className='w-3 h-3' /> Link Generated
                                    </span>
                                )}
                            </div>
                            <p className='text-xs text-gray-400 leading-relaxed mb-3'>
                                Click below to generate your sponsored verification link. Complete the sponsor steps to receive your one-time claim code.
                            </p>

                            <button
                                type='button'
                                onClick={handleStartLink}
                                disabled={loadingSession}
                                className='w-full py-2.5 px-4 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/40 border border-blue-400 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50'
                            >
                                {loadingSession ? (
                                    <>
                                        <RotateCw className='w-4 h-4 animate-spin' /> Generating Link...
                                    </>
                                ) : session ? (
                                    <>
                                        <ExternalLink className='w-4 h-4' /> Re-open Sponsored Link
                                    </>
                                ) : (
                                    <>
                                        <ExternalLink className='w-4 h-4' /> Start Verification Link
                                    </>
                                )}
                            </button>

                            {session && (
                                <div className='mt-2.5 flex items-center gap-2 text-[11px] text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20'>
                                    <ShieldCheck className='w-3.5 h-3.5 text-blue-400 shrink-0' />
                                    <span>Complete the sponsor steps in the opened window to receive your claim code.</span>
                                </div>
                            )}
                        </div>

                        {/* Step 2: Enter Code */}
                        <form onSubmit={handleSubmitCode} className='p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800 space-y-3'>
                            <div className='flex items-center justify-between'>
                                <span className='text-xs font-bold text-gray-200 flex items-center gap-2'>
                                    <span className='w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center border border-blue-500/30'>
                                        2
                                    </span>
                                    Submit Claim Code
                                </span>
                                <span className='text-[10px] text-gray-500'>Format: ACT-XXXX-XXXX</span>
                            </div>

                            <div className='relative'>
                                <input
                                    type='text'
                                    value={claimCode}
                                    onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                                    placeholder='Paste code (e.g. ACT-4K8P-9Z2X)'
                                    className='w-full px-4 py-2.5 bg-black/60 border border-neutral-700 rounded-xl text-xs font-mono tracking-widest text-white focus:outline-none focus:border-blue-500 uppercase placeholder:normal-case placeholder:tracking-normal transition'
                                />
                            </div>

                            <button
                                type='submit'
                                disabled={submittingCode || !claimCode.trim()}
                                className='w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold border border-neutral-700 hover:border-neutral-600 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
                            >
                                {submittingCode ? (
                                    <>
                                        <RotateCw className='w-4 h-4 animate-spin text-blue-400' /> Verifying Code...
                                    </>
                                ) : (
                                    <>
                                        <KeyRound className='w-4 h-4 text-blue-400' /> Apply Code &amp; Renew (+72h)
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Anti-Bypass Notice Footer */}
                    <div className='mt-4 flex items-center gap-2 text-[11px] text-gray-500 justify-center'>
                        <ShieldCheck className='w-3.5 h-3.5 text-blue-400 shrink-0' />
                        <span>Protected by Anti-Bypass Guard. Automated bypassers will burn the token.</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}

export default FreeServerRenewModal
