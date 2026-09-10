import React, { useEffect, useState } from 'react'
import { useStoreState, useStoreActions } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import http from '@/api/http'
import ActiveServicesTable, { ServerItem } from '@/components/dashboard/ActiveServicesTable'
import VpsDeployModal from '@/components/dashboard/VpsDeployModal'
import PromoBannersRow from '@/components/dashboard/PromoBannersRow'
import QuickServicesGrid from '@/components/dashboard/QuickServicesGrid'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal'
import { RocketLaunchIcon } from '@heroicons/react/24/outline'
import FreeServerRenewModal from '@/components/dashboard/FreeServerRenewModal'
import SuspendedClaimBackModal from '@/components/dashboard/SuspendedClaimBackModal'
import { AlertTriangle } from 'lucide-react'

const LOCATION_FLAGS: Record<string, string> = {
    'India': 'https://flagcdn.com/in.svg',
    'Mumbai, India': 'https://flagcdn.com/in.svg',
    'Mumbai, IN': 'https://flagcdn.com/in.svg',
    'Delhi, India': 'https://flagcdn.com/in.svg',
    'Delhi, IN': 'https://flagcdn.com/in.svg',
    'Bangalore, IN': 'https://flagcdn.com/in.svg',
    'Node: IN-1': 'https://flagcdn.com/in.svg',
    'Node: IN-2': 'https://flagcdn.com/in.svg',
    'IN-1': 'https://flagcdn.com/in.svg',
    'IN-2': 'https://flagcdn.com/in.svg',
    'IN': 'https://flagcdn.com/in.svg',
    'IND': 'https://flagcdn.com/in.svg',
    'New York, USA': 'https://flagcdn.com/us.svg',
    'London, UK': 'https://flagcdn.com/gb.svg',
    'Frankfurt, DE': 'https://flagcdn.com/de.svg',
    'Node: DE-1': 'https://flagcdn.com/de.svg',
    'Node: US-1': 'https://flagcdn.com/us.svg',
    'Node: UK-1': 'https://flagcdn.com/gb.svg',
    'DE-1': 'https://flagcdn.com/de.svg',
    'US-1': 'https://flagcdn.com/us.svg',
    'UK-1': 'https://flagcdn.com/gb.svg',
    'Germany': 'https://flagcdn.com/de.svg',
    'Tokyo, Japan': 'https://flagcdn.com/jp.svg',
    'Tokyo, JP': 'https://flagcdn.com/jp.svg',
    'Singapore, SG': 'https://flagcdn.com/sg.svg',
    'Sydney, AU': 'https://flagcdn.com/au.svg',
}

const getFlagForLocationString = (locString: string): string => {
    if (!locString) return 'https://flagcdn.com/w40/de.png'
    const lower = locString.toLowerCase()
    if (lower.includes('india') || lower.includes('mumbai') || lower.includes('delhi') || lower.includes('bangalore') || lower.includes('chennai') || lower.includes('hyderabad') || lower.includes('in-') || lower.includes('in_') || lower === 'in' || lower === 'ind') {
        return 'https://flagcdn.com/in.svg'
    }
    if (lower.includes('us') || lower.includes('united states') || lower.includes('new york')) {
        return 'https://flagcdn.com/us.svg'
    }
    if (lower.includes('uk') || lower.includes('london') || lower.includes('great britain') || lower.includes('gb')) {
        return 'https://flagcdn.com/gb.svg'
    }
    if (lower.includes('japan') || lower.includes('tokyo') || lower.includes('jp')) {
        return 'https://flagcdn.com/jp.svg'
    }
    if (lower.includes('singapore') || lower.includes('sg')) {
        return 'https://flagcdn.com/sg.svg'
    }
    if (lower.includes('australia') || lower.includes('sydney') || lower.includes('au')) {
        return 'https://flagcdn.com/au.svg'
    }
    if (lower.includes('germany') || lower.includes('frankfurt') || lower.includes('de')) {
        return 'https://flagcdn.com/de.svg'
    }
    return LOCATION_FLAGS[locString] || 'https://flagcdn.com/w40/de.png'
}

const extractIpAddress = (srv: any, idx: number): string => {
    if (srv.limits?.addresses && Array.isArray(srv.limits.addresses) && srv.limits.addresses.length > 0) {
        const addrObj = srv.limits.addresses[0]
        const ipVal = addrObj.ip || addrObj.address || addrObj.ip_address
        if (ipVal && typeof ipVal === 'string') return ipVal
    }
    if (srv.addresses && Array.isArray(srv.addresses) && srv.addresses.length > 0) {
        const addrObj = srv.addresses[0]
        const ipVal = addrObj.ip || addrObj.address || addrObj.ip_address
        if (ipVal && typeof ipVal === 'string') return ipVal
    }
    if (srv.ip_address && typeof srv.ip_address === 'string') return srv.ip_address
    if (srv.ip && typeof srv.ip === 'string') return srv.ip
    return '—'
}

export const DashboardContainer: React.FC = () => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)
    const [deployModalOpen, setDeployModalOpen] = useState(false)
    const [servers, setServers] = useState<ServerItem[]>([])
    const [loading, setLoading] = useState(true)
    const [freeRenewServer, setFreeRenewServer] = useState<ServerItem | null>(null)
    const [suspendedServer, setSuspendedServer] = useState<ServerItem | null>(null)
    const [renewingId, setRenewingId] = useState<number | null>(null)

    const userCredits = user?.credits ?? 0

    const fetchServers = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/client/servers')
            const rawItems = res.data?.data || res.data || []

            const formatted = await Promise.all(
                rawItems.map(async (item: any, idx: number) => {
                    const srv = item.attributes || item

                    let cpuUsage = 0
                    let serverStatus: 'Active' | 'Expired' | 'Stopped' | 'Suspended' = 'Active'

                    const serverId = srv.uuid || srv.id
                    if (serverId) {
                        try {
                            const stateRes = await http.get(`/api/client/servers/${serverId}/state`, { timeout: 3000 })
                            const sData = stateRes.data?.data?.attributes || stateRes.data?.data
                            if (sData) {
                                if (typeof sData.cpu_used === 'number') {
                                    const rawCpu = sData.cpu_used
                                    cpuUsage = Math.round(rawCpu <= 1 ? rawCpu * 100 : rawCpu)
                                }
                                if (sData.state === 'stopped' || sData.state === 'offline') {
                                    serverStatus = 'Stopped'
                                    cpuUsage = 0
                                }
                            }
                        } catch (e) {
                            cpuUsage = 0
                        }
                    }

                    const nodeData = typeof srv.node === 'object' ? srv.node : null
                    const loc =
                        nodeData?.location_name ||
                        nodeData?.name ||
                        (typeof srv.node === 'string' ? srv.node : null) ||
                        (srv.description?.includes('Plan:')
                            ? srv.description.split('(')[1]?.replace(')', '') || 'Node: DE-1'
                            : ['Node: DE-1', 'London, UK', 'New York, USA', 'Tokyo, Japan'][idx % 4])

                    const flag =
                        nodeData?.flag ||
                        getFlagForLocationString(loc) ||
                        getFlagForLocationString(nodeData?.name || '') ||
                        'https://flagcdn.com/w40/de.png'
                    const expiresAt = srv.expires_at ? new Date(srv.expires_at) : new Date(Date.now() + (29 - (idx % 5) * 3) * 86400000)
                    const now = new Date()
                    const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 3600 * 24))
                    const isExpired = diffDays <= 0

                    const planTier = srv.plan_tier ?? 'free'
                    const activityExpiresAt = srv.activity_expires_at ? new Date(srv.activity_expires_at) : null
                    const deletionDeadlineAt = srv.deletion_deadline_at ? new Date(srv.deletion_deadline_at) : null
                    const isSuspended = srv.status === 'suspended' || srv.is_suspended === true

                    const activityRemainingSecs = srv.activity_remaining_seconds !== undefined && srv.activity_remaining_seconds !== null
                        ? srv.activity_remaining_seconds
                        : (activityExpiresAt ? Math.max(0, Math.floor((activityExpiresAt.getTime() - now.getTime()) / 1000)) : null)

                    const deletionRemainingSecs = srv.deletion_remaining_seconds !== undefined && srv.deletion_remaining_seconds !== null
                        ? srv.deletion_remaining_seconds
                        : (deletionDeadlineAt ? Math.max(0, Math.floor((deletionDeadlineAt.getTime() - now.getTime()) / 1000)) : null)

                    const reactivationProgress = srv.reactivation_progress || {
                        completed: srv.reactivation_codes_completed ?? 0,
                        required: 3,
                        remaining: Math.max(0, 3 - (srv.reactivation_codes_completed ?? 0)),
                        display: `${srv.reactivation_codes_completed ?? 0}/3`,
                    }

                    let lifecyclePhase = srv.lifecycle_phase
                    if (!lifecyclePhase) {
                        if (planTier === 'paid') {
                            lifecyclePhase = 'paid'
                        } else if (isSuspended) {
                            lifecyclePhase = (deletionRemainingSecs !== null && deletionRemainingSecs <= 1800)
                                ? 'pre_delete_critical'
                                : 'suspended_recovery'
                        } else if (activityRemainingSecs !== null && activityRemainingSecs <= 0) {
                            lifecyclePhase = 'pre_suspend_critical'
                        } else {
                            lifecyclePhase = 'active'
                        }
                    }

                    const ip = extractIpAddress(srv, idx)
                    const cpuCores = srv.limits?.cpu ? Math.max(1, Math.round(srv.limits.cpu / 100)) : 1
                    const ramMb = srv.limits?.memory ? (srv.limits.memory > 100000 ? Math.round(srv.limits.memory / (1024 * 1024)) : srv.limits.memory) : 1024
                    const boltsPrice = srv.price !== undefined && srv.price !== null && Number(srv.price) > 0
                        ? Number(srv.price)
                        : (cpuCores >= 4 || ramMb >= 8192 ? 30.0 : (cpuCores >= 2 || ramMb >= 4096 ? 15.0 : 10.0))

                    const osName =
                        srv.template_name ||
                        srv.template?.name ||
                        srv.os_name ||
                        srv.os ||
                        srv.egg_name ||
                        (srv.description?.includes('OS:') ? srv.description.split('OS:')[1]?.trim() : null) ||
                        null

                    const templateIcon =
                        srv.template_icon ||
                        srv.template?.icon ||
                        srv.template?.icon_svg ||
                        srv.os_icon ||
                        srv.icon_svg ||
                        null

                    return {
                        id: String(srv.id || srv.uuid),
                        internal_id: srv.internal_id || srv.id || idx + 1,
                        name: srv.name || `vps-instance-${idx + 1}`,
                        hostname: srv.hostname || `${srv.name || 'vps-instance'}.vertex-vms.host`,
                        location: loc,
                        flag,
                        ip,
                        os_name: osName,
                        template_icon: templateIcon,
                        cpu_usage: cpuUsage,
                        price: boltsPrice,
                        due_date: expiresAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                        days_left: Math.max(0, diffDays),
                        status: isSuspended ? 'Suspended' : (isExpired ? 'Expired' : serverStatus),
                        plan_tier: planTier,
                        activity_remaining_seconds: activityRemainingSecs,
                        deletion_remaining_seconds: deletionRemainingSecs,
                        reactivation_progress: reactivationProgress,
                        lifecycle_phase: lifecyclePhase,
                    }
                })
            )

            setServers(formatted)
        } catch (err) {
            console.error('Failed to fetch servers:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchServers()
    }, [])

    const handleRenew = async (srv: ServerItem) => {
        if (renewingId) return
        if (userCredits < srv.price) {
            alert(`Insufficient BOLT balance! You have ${userCredits.toFixed(2)} BOLTs, but renewal costs ${srv.price.toFixed(2)} BOLTs. Please top up your account.`)
            return
        }

        const confirmRenew = window.confirm(
            `Renew ${srv.name} for 30 Days?\nCost: ${srv.price.toFixed(2)} BOLTs\nCurrent Balance: ${userCredits.toFixed(2)} BOLTs`
        )
        if (!confirmRenew) return

        setRenewingId(srv.internal_id)
        try {
            const res = await http.post(`/api/client/servers/${srv.internal_id}/renew`)
            const data = res.data
            if (data.new_balance !== undefined) {
                updateCredits(data.new_balance)
            }
            alert(`Successfully renewed ${srv.name}! 30 days added to server duration.`)
            fetchServers()
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Failed to renew server. Please try again.'
            alert(msg)
        } finally {
            setRenewingId(null)
        }
    }

    const handleOpenDeploy = () => {
        if (!user?.rootAdmin && servers.length >= 2) {
            alert('Non-admin accounts are limited to a maximum of 2 active VPS instances. Please delete an existing instance before deploying a new one.')
            return
        }
        setDeployModalOpen(true)
    }

    const handleRenewFree = (srv: ServerItem) => {
        setFreeRenewServer(srv)
    }

    const handleClaimBackSuspended = (srv: ServerItem) => {
        setSuspendedServer(srv)
    }

    const urgentPreDeleteServer = servers.find(s => s.lifecycle_phase === 'pre_delete_critical')
    const urgentPreSuspendServer = servers.find(s => s.lifecycle_phase === 'pre_suspend_critical')
    const suspendedRecoveryServer = servers.find(
        s => s.lifecycle_phase === 'suspended_recovery' || (s.status === 'Suspended' && s.plan_tier !== 'paid')
    )

    return (
        <PageMaintenanceGuard pageKey='dashboard'>
        <PageContentBlock title='Dashboard' showFlashKey='dashboard'>
            <div className='pb-12'>
                <div className='flex items-start justify-between font-sans mb-8 mt-6 text-left'>
                    <div>
                        <h2 className='text-3xl font-semibold text-white flex gap-1.5'>
                            <VerticalCutReveal
                                splitBy='words'
                                staggerDuration={0.12}
                                staggerFrom='first'
                                reverse={true}
                                containerClassName='gap-1.5'
                            >
                                Cloud Instances &amp; VPS
                            </VerticalCutReveal>
                        </h2>
                        <p className='text-sm text-gray-400 font-normal mt-1'>
                            Manage, monitor, deploy, and scale your active cloud virtual servers.
                        </p>
                    </div>

                    <button
                        onClick={handleOpenDeploy}
                        className='py-3 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-sm flex items-center gap-2.5 cursor-pointer transition shrink-0 active:scale-95'
                    >
                        <RocketLaunchIcon className='w-5 h-5' /> Deploy VPS
                    </button>
                </div>

                <PromoBannersRow />

                {urgentPreDeleteServer ? (
                    <div className='mb-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 shadow-[0px_0px_50px_-10px_rgba(244,63,94,0.3)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0'>
                                <AlertTriangle className='w-6 h-6' />
                            </div>
                            <div>
                                <h4 className='text-sm font-bold text-rose-300 font-sans flex items-center gap-2'>
                                    CRITICAL WARNING: Permanent Deletion Imminent ({urgentPreDeleteServer.name})
                                </h4>
                                <p className='text-xs text-rose-200/80 mt-0.5'>
                                    Final 30-minute grace window active. Your server will be permanently deleted (&quot;GG&quot;) unless claimed immediately.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleClaimBackSuspended(urgentPreDeleteServer)}
                            className='px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-900/50 border border-rose-400 shrink-0 cursor-pointer active:scale-95 transition-all'
                        >
                            Claim Back Server ({urgentPreDeleteServer.reactivation_progress?.display || '3 Links'})
                        </button>
                    </div>
                ) : urgentPreSuspendServer ? (
                    <div className='mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 shadow-[0px_0px_50px_-10px_rgba(245,158,11,0.3)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0'>
                                <AlertTriangle className='w-6 h-6' />
                            </div>
                            <div>
                                <h4 className='text-sm font-bold text-amber-300 font-sans flex items-center gap-2'>
                                    30-Minute Grace Window: Renew Activity ({urgentPreSuspendServer.name})
                                </h4>
                                <p className='text-xs text-amber-200/80 mt-0.5'>
                                    Your 72-hour activity period expired. Renew via 1 sponsored link now to avoid server power-off and suspension.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleRenewFree(urgentPreSuspendServer)}
                            className='px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-amber-900/50 border border-amber-400 shrink-0 cursor-pointer active:scale-95 transition-all'
                        >
                            Renew 72h Activity (1 Link)
                        </button>
                    </div>
                ) : suspendedRecoveryServer ? (
                    <div className='mb-6 p-4 rounded-2xl bg-violet-950/40 border border-violet-500/40 shadow-[0px_0px_50px_-10px_rgba(139,92,246,0.3)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2.5 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30 shrink-0'>
                                <AlertTriangle className='w-6 h-6' />
                            </div>
                            <div>
                                <h4 className='text-sm font-bold text-violet-200 font-sans flex items-center gap-2'>
                                    Server Suspended: Recovery Window Open ({suspendedRecoveryServer.name})
                                </h4>
                                <p className='text-xs text-violet-300/80 mt-0.5'>
                                    You have 48 hours to claim back your VPS by completing 3 sponsored links ({suspendedRecoveryServer.reactivation_progress?.display || '0/3'} completed).
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleClaimBackSuspended(suspendedRecoveryServer)}
                            className='px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold text-xs shadow-lg shadow-violet-900/50 border border-violet-400 shrink-0 cursor-pointer active:scale-95 transition-all'
                        >
                            Claim Back ({suspendedRecoveryServer.reactivation_progress?.display || '3 Links'})
                        </button>
                    </div>
                ) : null}

                <ActiveServicesTable
                    servers={servers}
                    loading={loading}
                    renewingId={renewingId}
                    onRenew={handleRenew}
                    onDeploy={handleOpenDeploy}
                    onRenewFree={handleRenewFree}
                    onClaimBackSuspended={handleClaimBackSuspended}
                />

                <QuickServicesGrid
                    onDeploy={handleOpenDeploy}
                />

                <VpsDeployModal
                    opened={deployModalOpen}
                    onClose={() => setDeployModalOpen(false)}
                    onSuccess={() => {
                        fetchServers()
                    }}
                />

                <FreeServerRenewModal
                    server={freeRenewServer}
                    opened={!!freeRenewServer}
                    onClose={() => setFreeRenewServer(null)}
                    onSuccess={() => {
                        setFreeRenewServer(null)
                        fetchServers()
                    }}
                />

                <SuspendedClaimBackModal
                    server={suspendedServer}
                    opened={!!suspendedServer}
                    onClose={() => setSuspendedServer(null)}
                    onSuccess={() => {
                        setSuspendedServer(null)
                        fetchServers()
                    }}
                />
            </div>
        </PageContentBlock>
        </PageMaintenanceGuard>
    )
}

export default DashboardContainer
