import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCw, Plus, Copy, Check, Layers, EyeOff } from 'lucide-react'
import { BoltIcon } from '@heroicons/react/24/outline'

export interface ServerItem {
    id: string
    internal_id: number
    name: string
    hostname: string
    location: string
    flag: string
    ip: string
    cpu_usage: number
    price: number
    due_date: string
    days_left: number
    status: 'Active' | 'Expired' | 'Stopped'
}

interface Props {
    servers: ServerItem[]
    loading: boolean
    onDeploy: () => void
    onRenew: (srv: ServerItem) => void
    renewingId: number | null
}

const ActiveServicesTable = ({ servers, loading, onDeploy, onRenew, renewingId }: Props) => {
    const [copiedIp, setCopiedIp] = useState<string | null>(null)
    const [revealedIps, setRevealedIps] = useState<Record<string, boolean>>({})

    const handleCopyIp = (ip: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard.writeText(ip)
        setCopiedIp(ip)
        setTimeout(() => setCopiedIp(null), 2000)
    }

    const toggleRevealIp = (ip: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setRevealedIps((prev) => ({ ...prev, [ip]: !prev[ip] }))
    }

    return (
        <div className='p-6 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 shadow-[0px_-13px_300px_0px_#0900ff] text-white relative overflow-hidden rounded-2xl mb-8 font-sans text-left'>
            {/* Section Header */}
            <div className='relative z-10 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-neutral-700/80 text-left'>
                <div className='flex items-center gap-3'>
                    <h2 className='text-lg font-bold text-white tracking-tight font-sans'>Active Services</h2>
                    <span className='bg-neutral-900/90 border border-gray-700/80 text-gray-400 text-xs rounded-full px-2 py-0.5 font-mono font-medium'>
                        {servers.length}
                    </span>
                </div>
            </div>

            {/* Table Content */}
            <div className='relative z-10'>
                {loading ? (
                    <div className='text-center py-16 text-gray-400 text-xs font-semibold flex flex-col items-center justify-center gap-3 font-sans'>
                        <RotateCw className='w-5 h-5 animate-spin text-blue-400' />
                        <span>Loading active services...</span>
                    </div>
                ) : servers.length === 0 ? (
                    <div className='text-center py-14 px-4 border border-dashed border-neutral-700/80 rounded-xl bg-neutral-900/60 font-sans'>
                        <div className='w-12 h-12 mx-auto rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-gray-400 mb-3 shadow-md'>
                            <Layers className='w-6 h-6' />
                        </div>
                        <h3 className='text-sm font-bold text-white'>No Active Virtual Services</h3>
                        <p className='text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed'>
                            You haven't requested any VPS instances yet. Use your account BOLTs to deploy a 30-day server instance.
                        </p>
                        <button
                            onClick={onDeploy}
                            className='mt-4 py-2.5 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs inline-flex items-center gap-2 transition cursor-pointer active:scale-95'
                        >
                            <Plus className='w-4 h-4' /> Deploy VPS Instance Now
                        </button>
                    </div>
                ) : (
                    <div className='overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'>
                        <table className='w-full text-left border-collapse font-sans'>
                            <thead>
                                <tr className='border-b border-neutral-700/80 text-xs font-bold uppercase tracking-wider text-gray-400 pb-3'>
                                    <th className='py-3 px-4'>Service Name</th>
                                    <th className='py-3 px-4'>Location</th>
                                    <th className='py-3 px-4'>IP</th>
                                    <th className='py-3 px-4'>CPU</th>
                                    <th className='py-3 px-4'>Price</th>
                                    <th className='py-3 px-4'>Due Date</th>
                                    <th className='py-3 px-4'>Status</th>
                                    <th className='py-3 px-4 text-right'>Action</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-neutral-700/80 text-xs font-medium text-gray-300'>
                                {servers.map((srv) => {
                                    const isRevealed = !!revealedIps[srv.ip]

                                    return (
                                        <tr
                                            key={srv.id}
                                            className='h-[52px] border-b border-neutral-700/80 hover:bg-white/[0.03] transition-colors duration-150 group'
                                        >
                                            {/* Service Name & Subdomain */}
                                            <td className='py-3 px-4 align-middle'>
                                                <div className='font-bold text-white text-sm font-sans tracking-tight'>
                                                    <Link to={`/servers/${srv.id}`} className='hover:text-blue-400 transition-colors'>
                                                        {srv.name}
                                                    </Link>
                                                </div>
                                                <div className='text-[11px] text-gray-400 font-mono tracking-tight mt-0.5'>
                                                    {srv.hostname}
                                                </div>
                                            </td>

                                            {/* Location */}
                                            <td className='py-3 px-4 align-middle'>
                                                <div className='flex items-center gap-2 text-gray-300 text-xs font-medium'>
                                                    {srv.flag && (srv.flag.startsWith('http://') || srv.flag.startsWith('https://') || srv.flag.startsWith('/')) ? (
                                                        <img
                                                            src={srv.flag}
                                                            alt={srv.location}
                                                            className='w-4 h-4 rounded-full object-cover border border-neutral-700 shrink-0'
                                                        />
                                                    ) : (
                                                        <span className='text-xs leading-none shrink-0 font-sans'>
                                                            {srv.flag || '🌐'}
                                                        </span>
                                                    )}
                                                    <span>{srv.location}</span>
                                                </div>
                                            </td>

                                            {/* IP Address */}
                                            <td className='py-3 px-4 align-middle min-w-[150px] font-mono'>
                                                {isRevealed ? (
                                                    <div className='inline-flex items-center gap-2 text-xs text-gray-200 font-mono'>
                                                        <span>{srv.ip}</span>
                                                        <button
                                                            onClick={(e) => handleCopyIp(srv.ip, e)}
                                                            title='Copy IP address'
                                                            className='text-gray-400 hover:text-white transition-colors cursor-pointer p-0.5'
                                                        >
                                                            {copiedIp === srv.ip ? (
                                                                <Check className='w-3.5 h-3.5 text-emerald-400' />
                                                            ) : (
                                                                <Copy className='w-3 h-3' />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={(e) => toggleRevealIp(srv.ip, e)}
                                                            title='Hide IP address'
                                                            className='text-gray-400 hover:text-white transition-colors cursor-pointer p-0.5'
                                                        >
                                                            <EyeOff className='w-3 h-3' />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span
                                                        onClick={(e) => toggleRevealIp(srv.ip, e)}
                                                        className='font-mono text-xs text-gray-400 blur-[3px] hover:blur-none select-none cursor-pointer tracking-wider inline-block transition-all duration-150 hover:text-white'
                                                    >
                                                        {srv.ip}
                                                    </span>
                                                )}
                                            </td>

                                            {/* CPU Percentage */}
                                            <td className='py-3 px-4 align-middle font-mono text-xs text-gray-300'>
                                                {srv.cpu_usage}%
                                            </td>

                                            {/* Price: Match plan card 10 BOLTs style with BoltIcon */}
                                            <td className='py-3 px-4 align-middle font-mono text-xs'>
                                                <div className='flex items-center gap-1 font-sans text-xs'>
                                                    <BoltIcon className='w-4 h-4 text-amber-400 fill-amber-400/20 shrink-0' />
                                                    <span className='text-amber-400 font-semibold'>{Math.round(srv.price ?? 30)} BOLTs</span>
                                                    <span className='text-gray-400 text-xs ml-1'>/ 30d</span>
                                                </div>
                                            </td>

                                            {/* Due Date */}
                                            <td className='py-3 px-4 align-middle font-mono text-xs text-gray-400'>
                                                {srv.due_date}
                                            </td>

                                            {/* Status: Match "Online" badge from Step 2 node row */}
                                            <td className='py-3 px-4 align-middle'>
                                                <span
                                                    className={`text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/30 font-semibold uppercase tracking-wider font-mono ${
                                                        srv.status === 'Active'
                                                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                                    }`}
                                                >
                                                    {srv.status === 'Active' ? 'Active' : srv.status.toUpperCase()}
                                                </span>
                                            </td>

                                            {/* Action Button: Match "Back" button from modal footer */}
                                            <td className='py-3 px-4 text-right align-middle'>
                                                <button
                                                    onClick={() => onRenew(srv)}
                                                    disabled={renewingId === srv.internal_id}
                                                    className='py-2.5 px-5 rounded-xl bg-neutral-900 border border-neutral-800 text-gray-300 hover:text-white font-bold text-xs cursor-pointer transition inline-flex items-center gap-1.5 disabled:opacity-50'
                                                >
                                                    {renewingId === srv.internal_id && (
                                                        <RotateCw className='w-3 h-3 animate-spin text-blue-400' />
                                                    )}
                                                    <span>Renew</span>
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ActiveServicesTable
