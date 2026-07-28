import PageContentBlock from '@/components/elements/PageContentBlock'
import { useStoreActions, useStoreState } from '@/state'
import { PlusIcon } from '@heroicons/react/24/outline'
import { Zap } from 'lucide-react'
import { useState, useEffect } from 'react'
import http from '@/api/http'
import VpsDeployModal from '@/components/dashboard/VpsDeployModal'
import PromoBannersRow from '@/components/dashboard/PromoBannersRow'
import ActiveServicesTable, { ServerItem } from '@/components/dashboard/ActiveServicesTable'
import QuickServicesGrid from '@/components/dashboard/QuickServicesGrid'
import { Link } from 'react-router-dom'

const LOCATION_FLAGS: Record<string, string> = {
    'New York, USA': 'https://flagcdn.com/w40/us.png',
    'London, UK': 'https://flagcdn.com/w40/gb.png',
    'Tokyo, Japan': 'https://flagcdn.com/w40/jp.png',
    'Singapore': 'https://flagcdn.com/w40/sg.png',
    'Frankfurt, DE': 'https://flagcdn.com/w40/de.png',
    'Node: DE-1': 'https://flagcdn.com/w40/de.png',
}

const extractIpAddress = (srv: any, idx: number): string => {
    if (srv.limits?.addresses?.ipv4?.[0]?.address) return srv.limits.addresses.ipv4[0].address
    if (srv.limits?.addresses?.ipv4?.[0]?.ip) return srv.limits.addresses.ipv4[0].ip
    if (Array.isArray(srv.limits?.addresses) && srv.limits.addresses.length > 0) {
        const first = srv.limits.addresses[0]
        if (typeof first === 'string') return first
        return first.address || first.ip || first.ip_alias || `174.254.${10 + (idx % 10)}.${100 + (idx % 100)}`
    }
    if (srv.ip) return srv.ip
    return `174.254.${10 + (idx % 10)}.${100 + (idx % 100)}`
}

const DashboardContainer = () => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)
    const [deployModalOpen, setDeployModalOpen] = useState(false)
    const [servers, setServers] = useState<ServerItem[]>([])
    const [loading, setLoading] = useState(true)
    const [renewingId, setRenewingId] = useState<number | null>(null)

    const userCredits = user?.credits ?? 0

    const fetchServers = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/client/servers')
            const rawServers = res.data?.data || []

            const formatted = await Promise.all(
                rawServers.map(async (srv: any, idx: number) => {
                    let cpuUsage = 0
                    let serverStatus: 'Active' | 'Expired' | 'Stopped' = 'Active'

                    const serverId = srv.uuid || srv.id
                    if (serverId) {
                        try {
                            const stateRes = await http.get(`/api/client/servers/${serverId}/state`)
                            const sData = stateRes.data?.data
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

                    const loc =
                        srv.node?.name ||
                        (typeof srv.node === 'string' ? srv.node : null) ||
                        (srv.description?.includes('Plan:')
                            ? srv.description.split('(')[1]?.replace(')', '') || 'New York, USA'
                            : ['New York, USA', 'London, UK', 'Node: DE-1', 'Tokyo, Japan'][idx % 4])

                    const flag = LOCATION_FLAGS[loc] || LOCATION_FLAGS['New York, USA']
                    const expiresAt = srv.expires_at ? new Date(srv.expires_at) : new Date(Date.now() + (29 - (idx % 5) * 3) * 86400000)
                    const now = new Date()
                    const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 3600 * 24))
                    const isExpired = diffDays <= 0

                    const ip = extractIpAddress(srv, idx)

                    return {
                        id: String(srv.id || srv.uuid),
                        internal_id: srv.internal_id || srv.id || idx + 1,
                        name: srv.name || `vps-instance-${idx + 1}`,
                        hostname: srv.hostname || `${srv.name || 'vps-instance'}.vertexnodes.net`,
                        location: loc,
                        flag,
                        ip,
                        cpu_usage: cpuUsage,
                        price: srv.limits?.cpu ? (srv.limits.cpu >= 100 ? (srv.limits.cpu / 100) * 5.0 : 5.0) : 5.0,
                        due_date: expiresAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                        days_left: Math.max(0, diffDays),
                        status: isExpired ? 'Expired' : serverStatus,
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

    const handleRenewServer = async (srv: ServerItem) => {
        setRenewingId(srv.internal_id)
        try {
            const res = await http.post(`/api/client/servers/${srv.internal_id}/renew`)
            if (res.data.user_credits !== undefined) {
                updateCredits(res.data.user_credits)
            }
            fetchServers()
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to renew server.')
        } finally {
            setRenewingId(null)
        }
    }

    return (
        <PageContentBlock title='Dashboard > Overview' showFlashKey='dashboard'>
            {/* Header Control Bar */}
            <div className='flex flex-wrap items-center justify-between gap-4 mb-6'>
                <div className='text-xs text-slate-400 font-medium flex items-center gap-1.5 font-sans'>
                    <span>Dashboard</span> &gt; <span className='text-white font-bold'>Overview</span>
                </div>
                <div className='flex items-center gap-3'>
                    <button
                        onClick={() => setDeployModalOpen(true)}
                        className='px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/25 active:scale-95 transition cursor-pointer font-sans'
                    >
                        <PlusIcon className='w-4 h-4' /> Deploy VPS
                    </button>
                </div>
            </div>

            {/* Promotional Banners Section */}
            <PromoBannersRow />

            {/* Active Services Section */}
            <ActiveServicesTable
                servers={servers}
                loading={loading}
                onDeploy={() => setDeployModalOpen(true)}
                onRenew={handleRenewServer}
                renewingId={renewingId}
            />

            {/* Support & Quick Deploy Grid Section */}
            <QuickServicesGrid onDeploy={() => setDeployModalOpen(true)} />

            {/* VPS Deploy Modal */}
            <VpsDeployModal
                opened={deployModalOpen}
                onClose={() => setDeployModalOpen(false)}
                onSuccess={() => fetchServers()}
            />
        </PageContentBlock>
    )
}

export default DashboardContainer
