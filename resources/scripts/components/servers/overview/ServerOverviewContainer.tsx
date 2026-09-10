import React, { useState, useEffect } from 'react'
import { useStoreState } from '@/state'
import { ServerContext } from '@/state/server'

import ServerContentBlock from '@/components/servers/ServerContentBlock'
import ServerAdminBlock from '@/components/servers/overview/ServerAdminBlock'
import ServerDetailsBlock from '@/components/servers/overview/ServerDetailsBlock'
import ServerNetworkBlock from '@/components/servers/overview/ServerNetworkBlock'
import ServerPowerBlock from '@/components/servers/overview/ServerPowerBlock'
import ServerTerminalBlock from '@/components/servers/overview/ServerTerminalBlock'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'
import FreeServerRenewModal from '@/components/dashboard/FreeServerRenewModal'
import SuspendedClaimBackModal from '@/components/dashboard/SuspendedClaimBackModal'
import { Clock, ShieldAlert, AlertTriangle, Sparkles } from 'lucide-react'

const formatTimeRemaining = (totalSecs: number): string => {
    if (totalSecs <= 0) return '00:00'
    const days = Math.floor(totalSecs / 86400)
    const hours = Math.floor((totalSecs % 86400) / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`
    return `${mins}m ${secs}s`
}

const ServerOverviewContainer = () => {
    const rootAdmin = useStoreState(state => state.user.data!.rootAdmin)
    const server = ServerContext.useStoreState(state => state.server.data)
    const getServer = ServerContext.useStoreActions(actions => actions.server.getServer)

    const [renewModalOpen, setRenewModalOpen] = useState(false)
    const [claimModalOpen, setClaimModalOpen] = useState(false)
    const [countdown, setCountdown] = useState<number | null>(null)

    const isFree = server && server.planTier !== 'paid'

    useEffect(() => {
        if (server?.activityRemainingSeconds !== undefined && server?.activityRemainingSeconds !== null) {
            setCountdown(server.activityRemainingSeconds)
        }
    }, [server?.activityRemainingSeconds])

    useEffect(() => {
        if (countdown === null || countdown <= 0) return
        const timer = setInterval(() => {
            setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : 0))
        }, 1000)
        return () => clearInterval(timer)
    }, [countdown !== null && countdown > 0])

    const modalServer = server ? {
        id: server.id,
        internal_id: server.internalId,
        name: server.name,
        hostname: server.hostname,
        activity_remaining_seconds: countdown ?? server.activityRemainingSeconds,
        deletion_remaining_seconds: server.deletionRemainingSeconds,
        reactivation_progress: server.reactivationProgress,
        lifecycle_phase: server.lifecyclePhase,
    } : null

    return (
        <PageMaintenanceGuard pageKey='servers'>
            <ServerContentBlock title='Overview'>
                {isFree && server && (
                    <div className='mb-6'>
                        {server.lifecyclePhase === 'pre_delete_critical' ? (
                            <div className='p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 shadow-[0px_0px_50px_-10px_rgba(244,63,94,0.3)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse'>
                                <div className='flex items-center gap-3'>
                                    <div className='p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0'>
                                        <AlertTriangle className='w-6 h-6' />
                                    </div>
                                    <div>
                                        <h4 className='text-sm font-bold text-rose-300 font-sans'>
                                            CRITICAL: Permanent Deletion in Less Than 30 Minutes
                                        </h4>
                                        <p className='text-xs text-rose-200/80 mt-0.5'>
                                            Complete 3 sponsored links right now before VM and disk storage are permanently erased (&quot;GG&quot;).
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setClaimModalOpen(true)}
                                    className='px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-900/50 border border-rose-400 shrink-0 cursor-pointer active:scale-95 transition-all'
                                >
                                    Claim Back Server ({server.reactivationProgress?.display || '3 Links'})
                                </button>
                            </div>
                        ) : (server.status === 'suspended' || server.lifecyclePhase === 'suspended_recovery') ? (
                            <div className='p-4 rounded-2xl bg-violet-950/40 border border-violet-500/40 shadow-[0px_0px_50px_-10px_rgba(139,92,246,0.3)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4'>
                                <div className='flex items-center gap-3'>
                                    <div className='p-2.5 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30 shrink-0'>
                                        <ShieldAlert className='w-6 h-6' />
                                    </div>
                                    <div>
                                        <h4 className='text-sm font-bold text-violet-200 font-sans'>
                                            Server Suspended: 48-Hour Recovery Window Active
                                        </h4>
                                        <p className='text-xs text-violet-300/80 mt-0.5'>
                                            Complete 3 sponsored links ({server.reactivationProgress?.display || '0/3'} completed) to restore power and unsuspend.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setClaimModalOpen(true)}
                                    className='px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold text-xs shadow-lg shadow-violet-900/50 border border-violet-400 shrink-0 cursor-pointer active:scale-95 transition-all'
                                >
                                    Claim Back Server ({server.reactivationProgress?.display || '3 Links'})
                                </button>
                            </div>
                        ) : server.lifecyclePhase === 'pre_suspend_critical' ? (
                            <div className='p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 shadow-[0px_0px_50px_-10px_rgba(245,158,11,0.3)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse'>
                                <div className='flex items-center gap-3'>
                                    <div className='p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0'>
                                        <AlertTriangle className='w-6 h-6' />
                                    </div>
                                    <div>
                                        <h4 className='text-sm font-bold text-amber-300 font-sans'>
                                            Urgent: 30-Minute Grace Window Before Suspension
                                        </h4>
                                        <p className='text-xs text-amber-200/80 mt-0.5'>
                                            Your 72-hour activity period expired. Complete 1 sponsored link to keep this VM online for 3 days.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setRenewModalOpen(true)}
                                    className='px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-amber-900/50 border border-amber-400 shrink-0 cursor-pointer active:scale-95 transition-all'
                                >
                                    Renew 72h Activity Now
                                </button>
                            </div>
                        ) : (
                            <div className='p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800 shadow-[0px_0px_50px_-15px_rgba(59,130,246,0.2)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xl'>
                                <div className='flex items-center gap-3'>
                                    <div className='p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0'>
                                        <Clock className='w-5 h-5' />
                                    </div>
                                    <div>
                                        <div className='flex items-center gap-2'>
                                            <span className='text-xs font-bold uppercase tracking-wider text-gray-400'>
                                                Free Tier Activity Check
                                            </span>
                                            <span className='text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold'>
                                                Active (3-Day Cycle)
                                            </span>
                                        </div>
                                        <p className='text-xs text-gray-400 mt-0.5'>
                                            Time until check: <span className='font-mono font-bold text-white'>{countdown !== null ? formatTimeRemaining(countdown) : 'Calculating...'}</span>. You can renew at any time via 1 sponsored link.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setRenewModalOpen(true)}
                                    className='py-2 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-blue-500/50 text-gray-200 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 active:scale-95'
                                >
                                    <Sparkles className='w-3.5 h-3.5 text-blue-400' />
                                    <span>Renew Activity (72h)</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <ServerPowerBlock />
                <div className='grid grid-cols-10 gap-6'>
                    <ServerDetailsBlock />
                    <ServerNetworkBlock />
                    <ServerTerminalBlock />
                    {rootAdmin && <ServerAdminBlock />}
                </div>

                {isFree && modalServer && (
                    <>
                        <FreeServerRenewModal
                            server={modalServer}
                            opened={renewModalOpen}
                            onClose={() => setRenewModalOpen(false)}
                            onSuccess={() => {
                                setRenewModalOpen(false)
                                if (server?.uuid) getServer(server.uuid)
                            }}
                        />

                        <SuspendedClaimBackModal
                            server={modalServer}
                            opened={claimModalOpen}
                            onClose={() => setClaimModalOpen(false)}
                            onSuccess={() => {
                                setClaimModalOpen(false)
                                if (server?.uuid) getServer(server.uuid)
                            }}
                        />
                    </>
                )}
            </ServerContentBlock>
        </PageMaintenanceGuard>
    )
}

export default ServerOverviewContainer