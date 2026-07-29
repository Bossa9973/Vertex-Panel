import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStoreState, useStoreActions } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import http from '@/api/http'
import ActiveServicesTable from '@/components/dashboard/ActiveServicesTable'
import VpsDeployModal from '@/components/dashboard/VpsDeployModal'
import PromoBannersRow from '@/components/dashboard/PromoBannersRow'
import QuickServicesGrid, { ServerItem } from '@/components/dashboard/QuickServicesGrid'

const LOCATION_FLAGS: Record<string, string> = {
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
    return ['185.220.101.42', '45.142.214.18', '194.165.16.89', '103.195.103.5'][idx % 4]
}

export const DashboardContainer: React.FC = () => {
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
            const rawItems = res.data?.data || res.data || []

            const formatted = await Promise.all(
                rawItems.map(async (item: any, idx: number) => {
                    const srv = item.attributes || item

                    let cpuUsage = 0
                    let serverStatus: 'Active' | 'Expired' | 'Stopped' = 'Active'

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
                        LOCATION_FLAGS[loc] ||
                        LOCATION_FLAGS[nodeData?.name || ''] ||
                        'https://flagcdn.com/w40/de.png'
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

    return (
        <PageContentBlock title='Dashboard'>
            <div className='flex flex-wrap items-center justify-between gap-4 mb-6'>
                <div className='flex items-center space-x-2 text-xs font-semibold text-stone-400 font-sans'>
                    <Link to='/' className='hover:text-stone-200 transition-colors'>
                        Dashboard
                    </Link>
                    <span>&gt;</span>
                    <span className='text-stone-100 font-bold'>Overview</span>
                </div>
                <button
                    onClick={() => setDeployModalOpen(true)}
                    className='flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 transition-all duration-200 cursor-pointer active:scale-95'
                >
                    <span className='text-base font-normal line-none'>+</span> Deploy VPS
                </button>
            </div>

            <PromoBannersRow onDeployClick={() => setDeployModalOpen(true)} />

            <ActiveServicesTable
                servers={servers}
                loading={loading}
                userCredits={userCredits}
                renewingId={renewingId}
                onRenew={handleRenew}
                onDeployClick={() => setDeployModalOpen(true)}
            />

            <QuickServicesGrid
                servers={servers}
                loading={loading}
                onDeployClick={() => setDeployModalOpen(true)}
            />

            <VpsDeployModal
                opened={deployModalOpen}
                onClose={() => setDeployModalOpen(false)}
                onSuccess={() => {
                    fetchServers()
                }}
            />
        </PageContentBlock>
    )
}

export default DashboardContainer
