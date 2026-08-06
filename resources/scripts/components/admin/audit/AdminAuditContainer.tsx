import PageContentBlock from '@/components/elements/PageContentBlock'
import { useState, useEffect } from 'react'
import http from '@/api/http'
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowPathIcon,
    ShieldCheckIcon,
    ServerIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
    UserIcon,
    ComputerDesktopIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    XMarkIcon,
    ClipboardDocumentIcon,
    CheckIcon,
} from '@heroicons/react/24/outline'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'

interface AuditActor {
    id: number
    name: string
    email: string
    root_admin: boolean
}

interface AuditLogItem {
    id: number
    event: string
    description: string
    status: string
    ip: string
    user_agent: string | null
    properties: Record<string, any>
    created_at: string | null
    timestamp: number
    actor: AuditActor | null
}

interface AuditStats {
    total_logs: number
    auth_count: number
    vps_count: number
    bolts_count: number
    admin_count: number
    unique_users: number
    unique_ips: number
}

const AdminAuditContainer = () => {
    const [logs, setLogs] = useState<AuditLogItem[]>([])
    const [stats, setStats] = useState<AuditStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'all' | 'auth' | 'vps' | 'bolts' | 'admin'>('all')
    const [search, setSearch] = useState('')
    const [filterUserId, setFilterUserId] = useState<number | null>(null)
    const [filterIp, setFilterIp] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(25)
    const [totalPages, setTotalPages] = useState(1)
    const [totalItems, setTotalItems] = useState(0)
    const [copiedIp, setCopiedIp] = useState<string | null>(null)

    const fetchLogs = async () => {
        setLoading(true)
        try {
            const params: Record<string, any> = {
                tab: activeTab,
                page,
                per_page: perPage,
            }

            if (search.trim()) params.search = search.trim()
            if (filterUserId) params.user_id = filterUserId
            if (filterIp) params.ip = filterIp

            const res = await http.get('/api/admin/audit-logs', { params })
            setLogs(res.data.data || [])
            setStats(res.data.stats || null)
            if (res.data.pagination) {
                setTotalPages(res.data.pagination.last_page || 1)
                setTotalItems(res.data.pagination.total || 0)
            }
        } catch (err) {
            console.error('Failed to fetch audit logs:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        setPage(1)
    }, [activeTab, search, filterUserId, filterIp, perPage])

    useEffect(() => {
        fetchLogs()
    }, [activeTab, search, filterUserId, filterIp, page, perPage])

    const handleCopyIp = (ip: string) => {
        navigator.clipboard.writeText(ip)
        setCopiedIp(ip)
        setTimeout(() => setCopiedIp(null), 2000)
    }

    const formatRelativeTime = (isoStr: string | null) => {
        if (!isoStr) return 'N/A'
        const date = new Date(isoStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffSecs = Math.floor(diffMs / 1000)
        const diffMins = Math.floor(diffSecs / 60)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffSecs < 60) return 'Just now'
        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`
        return date.toLocaleDateString()
    }

    const getEventBadgeClass = (event: string) => {
        if (event.startsWith('auth:login-failed')) return 'bg-red-500/10 text-red-400 border-red-500/30'
        if (event.startsWith('auth:')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        if (event.startsWith('server:delete')) return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        if (event.startsWith('server:')) return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
        if (event.startsWith('bolts:admin')) return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
        if (event.startsWith('bolts:')) return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
        if (event.startsWith('admin:')) return 'bg-purple-500/10 text-purple-400 border-purple-500/30'
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30'
    }

    return (
        <PageContentBlock title='Audit Logs' showFlashKey='admin:audit'>
            <div className='pb-12 text-left font-sans'>
                {/* Header */}
                <div className='flex flex-col md:flex-row md:items-center justify-between mb-8 mt-6 gap-4'>
                    <div>
                        <h2 className='text-3xl font-semibold text-white flex items-center gap-3'>
                            <DocumentTextIcon className='w-8 h-8 text-blue-400' /> System Audit Logs
                        </h2>
                        <p className='text-sm text-gray-400 mt-1'>
                            Real-time security, user sign-ins, IP addresses, VPS provisioning, and financial tracking.
                        </p>
                    </div>

                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className='py-2.5 px-5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-semibold text-sm flex items-center gap-2 transition cursor-pointer self-start md:self-auto active:scale-95'
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Logs
                    </button>
                </div>

                {/* Metrics Grid */}
                {stats && (
                    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8'>
                        <div className='p-5 rounded-2xl bg-[#0c0f18]/80 border border-blue-500/20 flex items-center gap-4 shadow-lg backdrop-blur-md'>
                            <div className='p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20'>
                                <DocumentTextIcon className='w-6 h-6' />
                            </div>
                            <div>
                                <span className='text-xs text-gray-400 uppercase font-semibold tracking-wider'>Total Events</span>
                                <div className='text-2xl font-bold text-white mt-0.5'>{stats.total_logs.toLocaleString()}</div>
                                <span className='text-xs text-gray-500'>{stats.unique_ips} Unique IPs</span>
                            </div>
                        </div>

                        <div className='p-5 rounded-2xl bg-[#0c0f18]/80 border border-emerald-500/20 flex items-center gap-4 shadow-lg backdrop-blur-md'>
                            <div className='p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>
                                <ShieldCheckIcon className='w-6 h-6' />
                            </div>
                            <div>
                                <span className='text-xs text-gray-400 uppercase font-semibold tracking-wider'>Auth &amp; Security</span>
                                <div className='text-2xl font-bold text-white mt-0.5'>{stats.auth_count.toLocaleString()}</div>
                                <span className='text-xs text-gray-500'>{stats.unique_users} Active Users</span>
                            </div>
                        </div>

                        <div className='p-5 rounded-2xl bg-[#0c0f18]/80 border border-cyan-500/20 flex items-center gap-4 shadow-lg backdrop-blur-md'>
                            <div className='p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'>
                                <ServerIcon className='w-6 h-6' />
                            </div>
                            <div>
                                <span className='text-xs text-gray-400 uppercase font-semibold tracking-wider'>VPS Operations</span>
                                <div className='text-2xl font-bold text-white mt-0.5'>{stats.vps_count.toLocaleString()}</div>
                                <span className='text-xs text-gray-500'>Provisioning &amp; Power</span>
                            </div>
                        </div>

                        <div className='p-5 rounded-2xl bg-[#0c0f18]/80 border border-amber-500/20 flex items-center gap-4 shadow-lg backdrop-blur-md'>
                            <div className='p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20'>
                                <BoltSvgIcon className='w-6 h-6' />
                            </div>
                            <div>
                                <span className='text-xs text-gray-400 uppercase font-semibold tracking-wider'>BOLTs Finances</span>
                                <div className='text-2xl font-bold text-white mt-0.5'>{stats.bolts_count.toLocaleString()}</div>
                                <span className='text-xs text-gray-500'>Credits &amp; Redemptions</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Filter & Tabs Container */}
                <div className='bg-[#0c0f18]/90 border border-blue-500/20 rounded-2xl p-6 shadow-xl backdrop-blur-md'>
                    {/* Navigation Tabs */}
                    <div className='flex items-center gap-2 border-b border-gray-800 pb-4 mb-6 overflow-x-auto scrollbar-none'>
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`py-2 px-4 rounded-xl font-semibold text-sm transition flex items-center gap-2 cursor-pointer ${
                                activeTab === 'all'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                            }`}
                        >
                            🌐 All Events
                        </button>
                        <button
                            onClick={() => setActiveTab('auth')}
                            className={`py-2 px-4 rounded-xl font-semibold text-sm transition flex items-center gap-2 cursor-pointer ${
                                activeTab === 'auth'
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                            }`}
                        >
                            🔐 Auth &amp; Security
                        </button>
                        <button
                            onClick={() => setActiveTab('vps')}
                            className={`py-2 px-4 rounded-xl font-semibold text-sm transition flex items-center gap-2 cursor-pointer ${
                                activeTab === 'vps'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                            }`}
                        >
                            🚀 VPS &amp; Servers
                        </button>
                        <button
                            onClick={() => setActiveTab('bolts')}
                            className={`py-2 px-4 rounded-xl font-semibold text-sm transition flex items-center gap-2 cursor-pointer ${
                                activeTab === 'bolts'
                                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                            }`}
                        >
                            ⚡ BOLTs &amp; Finances
                        </button>
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`py-2 px-4 rounded-xl font-semibold text-sm transition flex items-center gap-2 cursor-pointer ${
                                activeTab === 'admin'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                            }`}
                        >
                            ⚙️ Admin Actions
                        </button>
                    </div>

                    {/* Filter controls */}
                    <div className='flex flex-col sm:flex-row items-center justify-between gap-4 mb-6'>
                        <div className='relative w-full sm:w-80'>
                            <MagnifyingGlassIcon className='w-5 h-5 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2' />
                            <input
                                type='text'
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder='Search description, IP, user...'
                                className='w-full bg-[#121624] border border-gray-800 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition'
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white'
                                >
                                    <XMarkIcon className='w-4 h-4' />
                                </button>
                            )}
                        </div>

                        {/* Active Filter Tags */}
                        <div className='flex items-center gap-2 flex-wrap'>
                            {filterUserId && (
                                <span className='bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium'>
                                    <UserIcon className='w-3.5 h-3.5' /> User ID: #{filterUserId}
                                    <button onClick={() => setFilterUserId(null)} className='hover:text-white ml-1'>
                                        <XMarkIcon className='w-3.5 h-3.5' />
                                    </button>
                                </span>
                            )}
                            {filterIp && (
                                <span className='bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium'>
                                    <ComputerDesktopIcon className='w-3.5 h-3.5' /> IP: {filterIp}
                                    <button onClick={() => setFilterIp(null)} className='hover:text-white ml-1'>
                                        <XMarkIcon className='w-3.5 h-3.5' />
                                    </button>
                                </span>
                            )}

                            {/* Per page selector */}
                            <select
                                value={perPage}
                                onChange={(e) => setPerPage(Number(e.target.value))}
                                className='bg-[#121624] border border-gray-800 text-gray-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer'
                            >
                                <option value={15}>15 per page</option>
                                <option value={25}>25 per page</option>
                                <option value={50}>50 per page</option>
                                <option value={100}>100 per page</option>
                            </select>
                        </div>
                    </div>

                    {/* Table View */}
                    <div className='overflow-x-auto rounded-xl border border-gray-800/80'>
                        <table className='w-full text-left text-sm border-collapse'>
                            <thead>
                                <tr className='bg-[#121624]/90 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-800'>
                                    <th className='py-3.5 px-4'>Time</th>
                                    <th className='py-3.5 px-4'>Actor</th>
                                    <th className='py-3.5 px-4'>Event</th>
                                    <th className='py-3.5 px-4'>Description &amp; Metadata</th>
                                    <th className='py-3.5 px-4 text-right'>IP Address</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-800/60 text-gray-300'>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className='py-12 text-center text-gray-500'>
                                            <ArrowPathIcon className='w-6 h-6 animate-spin mx-auto mb-2 text-blue-400' />
                                            Loading audit logs...
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className='py-12 text-center text-gray-500'>
                                            No audit log records found matching your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className='hover:bg-blue-500/[0.02] transition-colors'>
                                            {/* Timestamp */}
                                            <td className='py-3.5 px-4 whitespace-nowrap'>
                                                <div className='text-xs font-semibold text-gray-200'>
                                                    {formatRelativeTime(log.created_at)}
                                                </div>
                                                <div className='text-[11px] text-gray-500 font-mono mt-0.5'>
                                                    {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                                                </div>
                                            </td>

                                            {/* Actor */}
                                            <td className='py-3.5 px-4 whitespace-nowrap'>
                                                {log.actor ? (
                                                    <div className='flex items-center gap-2'>
                                                        <div className='w-7 h-7 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center justify-center text-xs font-bold shrink-0'>
                                                            {log.actor.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className='flex items-center gap-1.5'>
                                                                <button
                                                                    onClick={() => setFilterUserId(log.actor!.id)}
                                                                    className='font-semibold text-xs text-white hover:text-blue-400 transition cursor-pointer'
                                                                >
                                                                    {log.actor.name}
                                                                </button>
                                                                {log.actor.root_admin && (
                                                                    <span className='bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 font-bold'>
                                                                        ADMIN
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className='text-[11px] text-gray-400 font-mono'>
                                                                {log.actor.email}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className='text-xs text-gray-500 font-mono italic'>Anonymous / System</span>
                                                )}
                                            </td>

                                            {/* Event Badge */}
                                            <td className='py-3.5 px-4 whitespace-nowrap'>
                                                <span
                                                    className={`inline-block px-2.5 py-1 rounded-lg text-xs font-mono border font-semibold ${getEventBadgeClass(
                                                        log.event
                                                    )}`}
                                                >
                                                    {log.event}
                                                </span>
                                            </td>

                                            {/* Description */}
                                            <td className='py-3.5 px-4 max-w-md'>
                                                <div className='text-xs text-gray-200 font-medium leading-relaxed'>
                                                    {log.description}
                                                </div>
                                                {log.properties && Object.keys(log.properties).length > 0 && (
                                                    <div className='flex flex-wrap gap-1.5 mt-1.5'>
                                                        {Object.entries(log.properties)
                                                            .filter(([k]) => !['ip', 'useragent', 'user_agent'].includes(k))
                                                            .slice(0, 4)
                                                            .map(([k, v]) => (
                                                                <span
                                                                    key={k}
                                                                    className='text-[10px] bg-gray-800/80 text-gray-400 px-2 py-0.5 rounded border border-gray-700 font-mono'
                                                                >
                                                                    <span className='text-gray-500'>{k}:</span>{' '}
                                                                    <span className='text-blue-300'>
                                                                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                                                    </span>
                                                                </span>
                                                            ))}
                                                    </div>
                                                )}
                                            </td>

                                            {/* IP Address */}
                                            <td className='py-3.5 px-4 text-right whitespace-nowrap'>
                                                <div className='flex items-center justify-end gap-1.5'>
                                                    <button
                                                        onClick={() => setFilterIp(log.ip)}
                                                        className='font-mono text-xs text-gray-300 hover:text-blue-400 bg-gray-800/60 px-2 py-1 rounded border border-gray-700/80 transition cursor-pointer'
                                                        title='Filter by this IP'
                                                    >
                                                        {log.ip}
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopyIp(log.ip)}
                                                        className='text-gray-500 hover:text-gray-300 p-1 transition'
                                                        title='Copy IP'
                                                    >
                                                        {copiedIp === log.ip ? (
                                                            <CheckIcon className='w-3.5 h-3.5 text-emerald-400' />
                                                        ) : (
                                                            <ClipboardDocumentIcon className='w-3.5 h-3.5' />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    <div className='flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 text-xs text-gray-400'>
                        <div>
                            Showing <span className='text-white font-semibold'>{logs.length}</span> of{' '}
                            <span className='text-white font-semibold'>{totalItems}</span> events
                        </div>

                        <div className='flex items-center gap-2'>
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1 || loading}
                                className='p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition'
                            >
                                <ChevronLeftIcon className='w-4 h-4' />
                            </button>
                            <span className='px-3 py-1.5 rounded-xl bg-[#121624] text-gray-300 font-semibold border border-gray-800'>
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages || loading}
                                className='p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition'
                            >
                                <ChevronRightIcon className='w-4 h-4' />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </PageContentBlock>
    )
}

export default AdminAuditContainer
