import { bytesToString } from '@/util/helpers'
import {
    CircleStackIcon,
    CpuChipIcon,
    ExclamationTriangleIcon,
    ServerStackIcon,
    SignalIcon,
    UsersIcon,
} from '@heroicons/react/24/outline'
import { Badge, Skeleton } from '@mantine/core'
import { ComponentType } from 'react'
import { Link } from 'react-router-dom'

import useOverviewSWR from '@/api/admin/overview/useOverviewSWR'
import {
    DashboardMetric,
    DashboardNode,
} from '@/api/admin/overview/getOverview'

import MessageBox from '@/components/elements/MessageBox'
import PageContentBlock from '@/components/elements/PageContentBlock'

interface IconProps {
    className?: string
}

interface StatCardProps {
    title: string
    value: number | string
    detail?: string
    icon: ComponentType<IconProps>
    to?: string
    tone?: 'default' | 'warning' | 'error'
}

const toneClasses = {
    default: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    warning: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    error: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
}

const StatCard = ({
    title,
    value,
    detail,
    icon: Icon,
    to,
    tone = 'default',
}: StatCardProps) => {
    const content = (
        <div className='flex items-start justify-between gap-4 p-5 bg-neutral-900/70 border border-white/10 rounded-2xl shadow-xl shadow-blue-950/20 backdrop-blur-xl transition-all hover:border-white/20 h-full'>
            <div>
                <p className='text-[11px] font-bold uppercase tracking-wider text-gray-400'>{title}</p>
                <p className='mt-2 text-3xl font-extrabold text-white tracking-tight'>
                    {value}
                </p>
                {detail && <p className='text-xs text-gray-400 mt-2 font-medium'>{detail}</p>}
            </div>
            <div className={`rounded-xl border p-2.5 shadow-sm ${toneClasses[tone]}`}>
                <Icon className='h-6 w-6' />
            </div>
        </div>
    )

    if (to) {
        return (
            <Link
                to={to}
                className='col-span-12 block sm:col-span-6 xl:col-span-3'
            >
                {content}
            </Link>
        )
    }

    return (
        <div className='col-span-12 sm:col-span-6 xl:col-span-3'>
            {content}
        </div>
    )
}

const UsageBar = ({
    label,
    metric,
}: {
    label: string
    metric: DashboardMetric
}) => {
    return (
        <div>
            <div className='flex items-center justify-between gap-3'>
                <p className='text-xs font-bold text-gray-200'>{label}</p>
                <p className='text-xs font-mono font-bold text-blue-400'>
                    {bytesToString(metric.allocated)} /{' '}
                    {bytesToString(metric.total)}
                </p>
            </div>
            <div className='mt-2 h-2.5 overflow-hidden rounded-full bg-[#1c1e22] p-0.5 border border-gray-800'>
                <div
                    className={`h-full rounded-full transition-all duration-300 ${
                        metric.percent >= 90
                            ? 'bg-rose-500'
                            : metric.percent >= 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(metric.percent, 100)}%` }}
                />
            </div>
            <p className='text-xs text-gray-400 mt-1.5 font-medium'>
                {metric.percent}% allocated
            </p>
        </div>
    )
}

const NodeRow = ({ node }: { node: DashboardNode }) => {
    return (
        <div className='border-b border-gray-800/80 py-4 last:border-0 last:pb-0'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <Link
                        to={`/admin/nodes/${node.id}`}
                        className='font-bold text-base text-white hover:text-blue-400 transition'
                    >
                        {node.name}
                    </Link>
                    <p className='text-xs text-gray-400 mt-0.5 font-mono'>
                        Cluster: {node.cluster} &bull; FQDN: {node.fqdn}
                    </p>
                </div>
                <span className='px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20'>
                    {node.servers} Server{node.servers === 1 ? '' : 's'}
                </span>
            </div>
            <div className='mt-4 grid gap-4 lg:grid-cols-2'>
                <UsageBar label='Memory Allocation' metric={node.memory} />
                <UsageBar label='Disk Allocation' metric={node.disk} />
            </div>
        </div>
    )
}

const OverviewSkeleton = () => (
    <div className='grid grid-cols-12 gap-6'>
        {[1, 2, 3, 4].map(item => (
            <Skeleton
                key={item}
                className='col-span-12 sm:col-span-6 xl:col-span-3'
                height={142}
            />
        ))}
        <Skeleton className='col-span-12 lg:col-span-7' height={420} />
        <Skeleton className='col-span-12 lg:col-span-5' height={420} />
    </div>
)

const OverviewContainer = () => {
    const { data, error } = useOverviewSWR()

    return (
        <PageContentBlock title='System Overview'>
            <div className='mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-4'>
                <div>
                    <h1 className='text-2xl font-extrabold text-white tracking-tight'>
                        System Infrastructure Overview
                    </h1>
                    <p className='text-xs text-gray-400 mt-1'>
                        Global hypervisor nodes, cluster allocation metrics, and server states.
                    </p>
                </div>
            </div>

            {error && (
                <MessageBox
                    type='error'
                    title='Failed to Load Overview'
                    className='mb-6'
                >
                    Could not fetch administration stats. Please check database connection.
                </MessageBox>
            )}

            {!data ? (
                <OverviewSkeleton />
            ) : (
                <div className='grid grid-cols-12 gap-6'>
                    <StatCard
                        title='Servers'
                        value={data.summary.servers}
                        detail={`${data.servers.ready} Ready / ${data.servers.installing} Installing`}
                        icon={ServerStackIcon}
                        to='/admin/servers'
                    />
                    <StatCard
                        title='Hypervisor Nodes'
                        value={data.summary.nodes}
                        detail={`${data.summary.locations} Location(s) Active`}
                        icon={CpuChipIcon}
                        to='/admin/nodes'
                    />
                    <StatCard
                        title='Registered Users'
                        value={data.summary.users}
                        detail='Active Accounts'
                        icon={UsersIcon}
                        to='/admin/users'
                    />
                    <StatCard
                        title='Attention Required'
                        value={data.summary.failedServers}
                        detail={`${data.backups.failed} failed backup(s)`}
                        icon={ExclamationTriangleIcon}
                        to='/admin/servers'
                        tone={
                            data.summary.failedServers > 0
                                ? 'error'
                                : 'default'
                        }
                    />

                    <div className='col-span-12 lg:col-span-7 bg-neutral-900/70 border border-white/10 rounded-2xl p-6 shadow-xl shadow-blue-950/20 backdrop-blur-xl hover:border-white/20 transition-all'>
                        <div className='flex items-center justify-between gap-3 border-b border-gray-800 pb-4'>
                            <div>
                                <h2 className='text-lg font-bold text-white'>Capacity & Allocations</h2>
                                <p className='text-xs text-gray-400 mt-0.5'>
                                    Combined RAM and NVMe/SSD storage assigned to active virtual machines.
                                </p>
                            </div>
                            <CircleStackIcon className='h-6 w-6 text-blue-400' />
                        </div>
                        <div className='mt-6 grid gap-6'>
                            <UsageBar
                                label='System Memory (RAM)'
                                metric={data.capacity.memory}
                            />
                            <UsageBar
                                label='Disk Storage (NVMe/SSD)'
                                metric={data.capacity.disk}
                            />
                        </div>

                        <div className='mt-8 grid gap-4 sm:grid-cols-3 pt-4 border-t border-gray-800'>
                            <div className='border-l-2 border-blue-500 py-1 pl-4'>
                                <p className='text-[10px] font-bold text-gray-400 uppercase tracking-wider'>IP Addresses</p>
                                <p className='mt-1 text-xl font-bold text-white font-mono'>
                                    {data.addresses.assigned} /{' '}
                                    {data.addresses.total}
                                </p>
                                <p className='text-xs text-gray-400 mt-0.5'>
                                    {data.addresses.available} available in {data.addresses.pools} pool(s)
                                </p>
                            </div>
                            <div className='border-l-2 border-indigo-500 py-1 pl-4'>
                                <p className='text-[10px] font-bold text-gray-400 uppercase tracking-wider'>Backups</p>
                                <p className='mt-1 text-xl font-bold text-white font-mono'>
                                    {data.backups.successful} /{' '}
                                    {data.backups.total}
                                </p>
                                <p className='text-xs text-gray-400 mt-0.5'>
                                    {data.backups.pending} pending, {data.backups.failed} failed
                                </p>
                            </div>
                            <div className='border-l-2 border-emerald-500 py-1 pl-4'>
                                <p className='text-[10px] font-bold text-gray-400 uppercase tracking-wider'>ISOs</p>
                                <p className='mt-1 text-xl font-bold text-white font-mono'>
                                    {data.isos.successful} /{' '}
                                    {data.isos.total}
                                </p>
                                <p className='text-xs text-gray-400 mt-0.5'>
                                    {data.isos.pending} pending ISO download(s)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className='col-span-12 lg:col-span-5 bg-neutral-900/70 border border-white/10 rounded-2xl p-6 shadow-xl shadow-blue-950/20 backdrop-blur-xl hover:border-white/20 transition-all'>
                        <div className='flex items-center justify-between gap-3 border-b border-gray-800 pb-4'>
                            <div>
                                <h2 className='text-lg font-bold text-white'>Server Operational States</h2>
                                <p className='text-xs text-gray-400 mt-0.5'>
                                    Status breakdown of all managed instances.
                                </p>
                            </div>
                            <SignalIcon className='h-6 w-6 text-emerald-400' />
                        </div>
                        <div className='mt-6 grid grid-cols-2 gap-4'>
                            {[
                                ['Ready', data.servers.ready, 'text-emerald-400'],
                                ['Installing', data.servers.installing, 'text-blue-400'],
                                ['Suspended', data.servers.suspended, 'text-amber-400'],
                                ['Restoring', data.servers.restoring, 'text-indigo-400'],
                                ['Deleting', data.servers.deleting, 'text-gray-400'],
                                ['Failed', data.servers.failed, 'text-rose-400'],
                            ].map(([label, value, colorClass]) => (
                                <div
                                    key={label as string}
                                    className='border-l-2 border-gray-800 py-2 pl-4 bg-[#1c1e22] rounded-r-xl'
                                >
                                    <p className='text-xs font-semibold text-gray-400'>{label}</p>
                                    <p className={`mt-1 text-2xl font-extrabold font-mono ${colorClass}`}>
                                        {value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className='col-span-12 bg-[#141619] border border-gray-800 rounded-2xl p-6 shadow-xl'>
                        <div className='border-b border-gray-800 pb-4 mb-4'>
                            <h2 className='text-lg font-bold text-white'>Hypervisor Nodes</h2>
                            <p className='text-xs text-gray-400 mt-0.5'>
                                Real-time node resource utilization and cluster connections.
                            </p>
                        </div>
                        <div className='mt-2'>
                            {data.nodes.length === 0 ? (
                                <p className='text-xs text-gray-400 py-6 text-center italic'>
                                    No hypervisor nodes registered yet. Add a node in Admin &gt; Nodes.
                                </p>
                            ) : (
                                data.nodes.map(node => (
                                    <NodeRow key={node.id} node={node} />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </PageContentBlock>
    )
}

export default OverviewContainer

