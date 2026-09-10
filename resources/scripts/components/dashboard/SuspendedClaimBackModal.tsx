import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X,
    ExternalLink,
    ShieldAlert,
    Clock,
    AlertOctagon,
    RotateCw,
    CheckCircle2,
    Sparkles,
    Power,
    Loader2,
} from 'lucide-react'
import {
    startServerActivitySession,
    getServerSessionStatus,
    getServerActivityStatus,
    ActivityRenewalSession,
} from '@/api/server/activity'

interface Props {
    opened: boolean
    server: {
        id: string
        internal_id: number
        name: string
        hostname: string
        deletion_remaining_seconds?: number | null
        reactivation_progress?: {
            completed: number
            required: number
            remaining: number
            display: string
        } | null
        lifecycle_phase?: string
    } | null
    onClose: () => void
    onSuccess: () => void
}

const formatSecondsToTime = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return '00:00:00'
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const SuspendedClaimBackModal: React.FC<Props> = ({ opened, server, onClose, onSuccess }) => {
    const [loadingLink, setLoadingLink] = useState(false)
    const [session, setSession] = useState<ActivityRenewalSession | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)
    const [completedSteps, setCompletedSteps] = useState<number>(0)
    const [isFullyRestored, setIsFullyRestored] = useState(false)
    const [polling, setPolling] = useState(false)
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Local ticking countdown
    const [secondsLeft, setSecondsLeft] = useState<number>(0)

    useEffect(() => {
        if (server?.deletion_remaining_seconds != null) {
            setSecondsLeft(server.deletion_remaining_seconds)
        }
        if (server?.reactivation_progress) {
            setCompletedSteps(server.reactivation_progress.completed)
        }
    }, [server])

    useEffect(() => {
        const timer = setInterval(() => {
            setSecondsLeft((prev) => Math.max(0, prev - 1))
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    // BroadcastChannel handshake listener (two-tab security)
    useEffect(() => {
        if (!opened) return

        let channel: BroadcastChannel | null = null
        try {
            channel = new BroadcastChannel('vertex_activity_handshake')
            channel.onmessage = (evt) => {
                const data = evt.data
                if (!data) return
                if (data.type === 'CHALLENGE_REQUEST') {
                    const currentNonce = sessionStorage.getItem('vertex_activity_client_nonce')
                    if (currentNonce && channel) {
                        channel.postMessage({
                            type: 'CHALLENGE_RESPONSE',
                            session: data.session,
                            clientNonce: currentNonce,
                        })
                    }
                } else if (data.type === 'GRANT_COMPLETE') {
                    handleStepComplete(data)
                }
            }
        } catch (e) {
            // Ignore if BroadcastChannel not available
        }

        return () => {
            channel?.close()
        }
    }, [opened])

    // Reset state when opened
    useEffect(() => {
        if (opened && server) {
            setSession(null)
            setErrorMsg(null)
            setSuccessMsg(null)
            setIsFullyRestored(false)
            setCompletedSteps(server.reactivation_progress?.completed ?? 0)
            setPolling(false)
        } else {
            stopPolling()
        }
    }, [opened, server?.internal_id])

    const stopPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
        }
        setPolling(false)
    }

    const startPolling = (serverId: number) => {
        setPolling(true)
        pollIntervalRef.current = setInterval(async () => {
            try {
                const status = await getServerSessionStatus(serverId)
                if (status.is_claimed) {
                    stopPolling()
                    // Re-read server status to get updated step count
                    try {
                        const freshStatus = await getServerActivityStatus(serverId)
                        const newCompleted = freshStatus.reactivation_progress?.completed ?? completedSteps + 1
                        handleStepComplete({ newCompleted, restored: !freshStatus.is_suspended })
                    } catch {
                        handleStepComplete({ newCompleted: completedSteps + 1, restored: false })
                    }
                }
            } catch {
                // Silently retry
            }
        }, 3000)
    }

    const handleStepComplete = (data: { newCompleted?: number; restored?: boolean; message?: string }) => {
        stopPolling()
        const newCompleted = data.newCompleted ?? completedSteps + 1

        if (data.restored || newCompleted >= 3) {
            setCompletedSteps(3)
            setIsFullyRestored(true)
            setSuccessMsg(data.message || 'All 3 links verified! Server is being unsuspended…')
            setTimeout(() => {
                onSuccess()
                onClose()
            }, 2200)
        } else {
            setCompletedSteps(newCompleted)
            setSession(null)
            setSuccessMsg(data.message || `Step ${newCompleted}/3 complete! Open Link ${newCompleted + 1} to continue.`)
        }
    }

    if (!opened || !server) return null

    const currentStepNumber = Math.min(3, completedSteps + 1)
    const isFinalCritical = secondsLeft <= 1800 // Final 30 minutes before deletion

    const handleStartStepLink = async () => {
        setLoadingLink(true)
        setErrorMsg(null)
        setSuccessMsg(null)
        try {
            const clientNonce =
                typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : Math.random().toString(36).substring(2) + Date.now().toString(36)
            sessionStorage.setItem('vertex_activity_client_nonce', clientNonce)

            const data = await startServerActivitySession(server.internal_id, clientNonce)
            setSession(data)

            if (data.shrinkme_url) {
                window.open(data.shrinkme_url, '_blank', 'noopener,noreferrer')
            }

            startPolling(server.internal_id)
        } catch (err: any) {
            setErrorMsg(
                err.response?.data?.message ||
                    'Failed to generate step verification link. Please try again.'
            )
        } finally {
            setLoadingLink(false)
        }
    }

    return (
        <AnimatePresence>
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto'>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    className={`relative w-full max-w-lg bg-neutral-900/95 border rounded-3xl p-6 sm:p-7 text-white overflow-hidden font-sans text-left transition-all ${
                        isFinalCritical
                            ? 'border-rose-500/50 shadow-[0px_0px_140px_-20px_#e11d48]'
                            : 'border-violet-500/40 shadow-[0px_0px_120px_-20px_#7c3aed]'
                    }`}
                >
                    {/* Top ambient highlight bar */}
                    <div
                        className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
                            isFinalCritical
                                ? 'from-transparent via-rose-500 to-transparent animate-pulse'
                                : 'from-transparent via-violet-500 to-transparent'
                        }`}
                    />

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
                        <div
                            className={`w-12 h-12 rounded-2xl border flex items-center justify-center shadow-inner shrink-0 mt-0.5 ${
                                isFinalCritical
                                    ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                                    : 'bg-violet-500/20 border-violet-500/30 text-violet-400'
                            }`}
                        >
                            <Power className='w-6 h-6' />
                        </div>
                        <div>
                            <div className='flex items-center gap-2 flex-wrap'>
                                <span className='text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30'>
                                    VPS Suspended
                                </span>
                                {isFinalCritical && (
                                    <span className='text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-1'>
                                        <AlertOctagon className='w-3 h-3' /> Final 30m Window
                                    </span>
                                )}
                            </div>
                            <h3 className='text-xl font-bold text-white mt-1'>Claim Back Your Server</h3>
                            <p className='text-xs text-gray-400 mt-0.5'>
                                Complete 3 sequential links to unsuspend{' '}
                                <span className='text-violet-300 font-semibold'>{server.name}</span>.
                            </p>
                        </div>
                    </div>

                    {/* Live Deletion Countdown Warning */}
                    <div
                        className={`p-4 rounded-2xl border mb-5 flex items-center justify-between ${
                            isFinalCritical
                                ? 'bg-rose-950/40 border-rose-500/50 text-rose-300 animate-pulse'
                                : 'bg-neutral-950/70 border-neutral-800 text-gray-300'
                        }`}
                    >
                        <div className='flex items-center gap-3'>
                            <Clock className={`w-5 h-5 ${isFinalCritical ? 'text-rose-400' : 'text-amber-400'}`} />
                            <div>
                                <span className='text-[10px] font-bold uppercase tracking-wider block text-gray-400'>
                                    {isFinalCritical
                                        ? 'FINAL CHANCE BEFORE DELETION (GG)'
                                        : 'Permanent Deletion Deadline'}
                                </span>
                                <span
                                    className={`text-base font-bold font-mono tracking-tight ${isFinalCritical ? 'text-rose-400' : 'text-amber-400'}`}
                                >
                                    {formatSecondsToTime(secondsLeft)}
                                </span>
                            </div>
                        </div>
                        <span
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                                isFinalCritical
                                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                    : 'bg-neutral-900 border-neutral-800 text-gray-400'
                            }`}
                        >
                            48h Grace Window
                        </span>
                    </div>

                    {/* 3-Step Progress Stepper */}
                    <div className='p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 mb-5'>
                        <div className='flex items-center justify-between mb-2.5'>
                            <span className='text-xs font-bold text-gray-300'>Recovery Progress:</span>
                            <span
                                className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full border ${
                                    completedSteps === 3
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                        : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                                }`}
                            >
                                {completedSteps}/3 Links Completed
                            </span>
                        </div>

                        <div className='grid grid-cols-3 gap-2'>
                            {[1, 2, 3].map((step) => {
                                const isDone = completedSteps >= step
                                const isCurrent = currentStepNumber === step && !isFullyRestored

                                return (
                                    <div
                                        key={step}
                                        className={`py-2 px-3 rounded-xl border text-center transition-all ${
                                            isDone
                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 font-bold'
                                                : isCurrent
                                                  ? 'bg-violet-500/20 border-violet-500/60 text-white font-bold ring-1 ring-violet-500/40 shadow-md'
                                                  : 'bg-neutral-900/60 border-neutral-800 text-gray-500'
                                        }`}
                                    >
                                        <div className='flex items-center justify-center gap-1.5 text-xs'>
                                            {isDone ? (
                                                <CheckCircle2 className='w-3.5 h-3.5 text-emerald-400 shrink-0' />
                                            ) : (
                                                <span
                                                    className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${
                                                        isCurrent
                                                            ? 'bg-violet-500 text-white'
                                                            : 'bg-neutral-800 text-gray-400'
                                                    }`}
                                                >
                                                    {step}
                                                </span>
                                            )}
                                            <span>Link {step}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Alerts */}
                    {errorMsg && (
                        <div className='mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium flex items-start gap-2 leading-relaxed'>
                            <AlertOctagon className='w-4 h-4 shrink-0 mt-0.5 text-rose-400' />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div className='mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-medium flex items-center gap-2'>
                            <CheckCircle2 className='w-4 h-4 shrink-0 text-emerald-400' />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    {/* Active Step UI */}
                    {!isFullyRestored ? (
                        <div className='p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 space-y-3'>
                            <div className='flex items-center justify-between mb-1'>
                                <span className='text-xs font-bold text-gray-200 flex items-center gap-2'>
                                    <span className='w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] flex items-center justify-center border border-violet-500/30'>
                                        {currentStepNumber}
                                    </span>
                                    Open Sponsored Link #{currentStepNumber}
                                </span>
                                {session && !polling && (
                                    <span className='text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1'>
                                        <CheckCircle2 className='w-3 h-3' /> Link #{currentStepNumber} Active
                                    </span>
                                )}
                            </div>
                            <p className='text-xs text-gray-400 leading-relaxed'>
                                Click below to start verification link #{currentStepNumber} of 3.
                                Complete the sponsor steps — your progress will advance automatically.
                            </p>

                            <button
                                type='button'
                                onClick={handleStartStepLink}
                                disabled={loadingLink || polling}
                                className='w-full py-2.5 px-4 rounded-xl bg-gradient-to-t from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-xs font-bold shadow-lg shadow-violet-900/40 border border-violet-400 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50'
                            >
                                {loadingLink ? (
                                    <>
                                        <RotateCw className='w-4 h-4 animate-spin' /> Generating
                                        Link #{currentStepNumber}...
                                    </>
                                ) : session ? (
                                    <>
                                        <ExternalLink className='w-4 h-4' /> Re-open Link #
                                        {currentStepNumber}
                                    </>
                                ) : (
                                    <>
                                        <ExternalLink className='w-4 h-4' /> Start Link #
                                        {currentStepNumber} of 3
                                    </>
                                )}
                            </button>

                            {/* Polling indicator */}
                            {polling && (
                                <div className='flex items-center gap-2 text-[11px] text-violet-300 bg-violet-500/10 px-3 py-2.5 rounded-xl border border-violet-500/20 animate-pulse'>
                                    <Loader2 className='w-3.5 h-3.5 text-violet-400 shrink-0 animate-spin' />
                                    <span>
                                        Waiting for link #{currentStepNumber} to complete… Progress
                                        will advance automatically.
                                    </span>
                                </div>
                            )}

                            {session && !polling && (
                                <div className='flex items-center gap-2 text-[11px] text-violet-300 bg-violet-500/10 px-3 py-1.5 rounded-lg border border-violet-500/20'>
                                    <Sparkles className='w-3.5 h-3.5 text-violet-400 shrink-0' />
                                    <span>
                                        Complete the sponsor steps in the new window. No code needed
                                        — your progress updates automatically.
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className='py-8 text-center space-y-3'>
                            <div className='w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/50'>
                                <CheckCircle2 className='w-8 h-8' />
                            </div>
                            <h4 className='text-lg font-bold text-white'>Server Unsuspended &amp; Booting!</h4>
                            <p className='text-xs text-gray-400 max-w-sm mx-auto'>
                                All 3 links have been verified. Your VPS is being started and granted
                                72 hours of active time.
                            </p>
                        </div>
                    )}

                    {/* Anti-Bypass Footer */}
                    <div className='mt-4 flex items-center gap-2 text-[11px] text-gray-500 justify-center'>
                        <ShieldAlert className='w-3.5 h-3.5 text-violet-400 shrink-0' />
                        <span>Protected by Anti-Bypass Guard. Automated tools will be rejected.</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}

export default SuspendedClaimBackModal
