import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, RotateCw, Plus, Copy, Check, Layers, Eye, EyeOff, Calendar } from 'lucide-react'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'

export interface ServerItem {
    id: string
    internal_id: number
    name: string
    hostname: string
    location: string
    flag: string
    ip: string
    os_name?: string | null
    template_icon?: string | null
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

const ServerSvgIcon = ({ className = 'w-4 h-4 text-blue-400' }: { className?: string }) => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className={className}>
        <path d='M4.08 5.227A3 3 0 0 1 6.979 3H17.02a3 3 0 0 1 2.9 2.227l2.113 7.926A5.228 5.228 0 0 0 18.75 12H5.25a5.228 5.228 0 0 0-3.284 1.153L4.08 5.227Z' />
        <path fillRule='evenodd' d='M5.25 13.5a3.75 3.75 0 1 0 0 7.5h13.5a3.75 3.75 0 1 0 0-7.5H5.25Zm10.5 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm3.75-.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z' clipRule='evenodd' />
    </svg>
)

const renderDynamicCpuMeter = (usage: number) => {
    let trackClass = 'bg-[#102317] border-emerald-500/20'
    let fillClass = 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-green-300 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
    let textColor = 'text-emerald-400'

    if (usage > 85) {
        trackClass = 'bg-[#291014] border-rose-500/20'
        fillClass = 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
        textColor = 'text-rose-400'
    } else if (usage > 65) {
        trackClass = 'bg-[#261b0d] border-amber-500/20'
        fillClass = 'bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
        textColor = 'text-amber-400'
    } else if (usage > 40) {
        trackClass = 'bg-[#0b1f28] border-cyan-500/20'
        fillClass = 'bg-gradient-to-r from-teal-500 via-cyan-400 to-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
        textColor = 'text-cyan-400'
    }

    return (
        <div className='flex items-center gap-2.5'>
            <div className={`w-32 h-2.5 rounded-full ${trackClass} border p-[1.5px] relative overflow-hidden shadow-inner flex items-center`}>
                <div
                    className={`h-full rounded-full transition-all duration-500 ease-out relative ${fillClass}`}
                    style={{ width: `${Math.max(5, usage)}%` }}
                >
                    <div className='absolute right-0 top-0 bottom-0 w-1 bg-white/70 rounded-full shadow-[0_0_4px_#fff]' />
                </div>
            </div>
            <div className='flex items-center gap-1 font-mono text-[11px] font-bold text-slate-300 min-w-[36px] tracking-tight'>
                <Cpu className={`w-3 h-3 ${textColor}`} />
                <span>{usage}%</span>
            </div>
        </div>
    )
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
        <div
            className='p-6 bg-neutral-900/60 backdrop-blur-sm border border-white/[0.04] border-t border-t-blue-500/30 shadow-[0px_0px_120px_-20px_#0900ff] text-white relative rounded-2xl mb-8 font-sans text-left'
        >
            {/* Subtle top-to-bottom overlay gradient */}
            <div className='absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none z-0 rounded-2xl' />

            {/* Section Header */}
            <div className='relative z-10 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-neutral-700/80 text-left'>
                <div className='flex items-center gap-3'>
                    <h2 className='text-lg font-bold text-white tracking-tight font-sans'>Active Services</h2>
                    <span className='bg-neutral-800 border border-neutral-700 text-gray-400 text-xs rounded-full px-2 py-0.5 font-mono font-medium'>
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
                            className='mt-4 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-2 shadow-lg shadow-blue-600/25 transition cursor-pointer active:scale-95'
                        >
                            <Plus className='w-4 h-4' /> Deploy VPS Instance Now
                        </button>
                    </div>
                ) : (
                    <div className='overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'>
                        <table className='w-full text-left border-collapse font-sans'>
                            <thead>
                                <tr className='border-b border-neutral-700/80 text-xs font-bold uppercase tracking-wider text-gray-400 opacity-100 pb-3'>
                                    <th className='py-3 px-4'>Service Name</th>
                                    <th className='py-3 px-4'>Location</th>
                                    <th className='py-3 px-4'>IP</th>
                                    <th className='py-3 px-4'>OS</th>
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
                                            className='relative h-14 border-b border-neutral-700/80 group hover:bg-white/[0.05] transition-colors duration-150'
                                        >
                                            {/* Service Name & Subdomain Cell */}
                                            <td className='relative py-3 px-4 align-middle'>
                                                <div className='absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150' />
                                                <div className='flex items-center gap-2.5 pl-1'>
                                                    <ServerSvgIcon className='w-4 h-4 text-blue-400 shrink-0' />
                                                    <div>
                                                        <div className='font-semibold text-white text-sm font-sans tracking-tight leading-snug'>
                                                            <Link to={`/servers/${srv.id}`} className='hover:text-blue-400 transition-colors'>
                                                                {srv.name}
                                                            </Link>
                                                        </div>
                                                        <div className='text-xs text-gray-400 font-mono tracking-tight leading-none mt-0.5'>
                                                            {srv.hostname}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Location Cell */}
                                            <td className='py-3 px-4 align-middle whitespace-nowrap'>
                                                <div className='flex items-center gap-2 text-gray-300 text-xs font-medium whitespace-nowrap'>
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
                                                    <span className='whitespace-nowrap'>{srv.location}</span>
                                                </div>
                                            </td>

                                            {/* IP Address Cell */}
                                            <td className='py-3 px-4 align-middle min-w-[150px] font-mono whitespace-nowrap'>
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
                                                    <div className='relative inline-block group/ip'>
                                                        <span
                                                            onClick={(e) => toggleRevealIp(srv.ip, e)}
                                                            className='font-mono text-xs text-gray-400 blur-[3px] hover:blur-none select-none cursor-pointer tracking-wider inline-block transition-all duration-150 hover:text-white'
                                                        >
                                                            {srv.ip}
                                                        </span>
                                                        <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover/ip:opacity-100 transition-all duration-200 z-30 transform group-hover/ip:-translate-y-1'>
                                                            <div className='bg-black/90 text-white text-[10px] font-sans font-semibold px-2.5 py-1 rounded-md border border-white/[0.1] shadow-xl whitespace-nowrap flex items-center gap-1.5'>
                                                                <Eye className='w-3 h-3 text-blue-400' />
                                                                <span>Click to reveal</span>
                                                            </div>
                                                            <div className='w-2 h-2 bg-black/90 border-r border-b border-white/[0.1] rotate-45 mx-auto -mt-1' />
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* OS Template Column */}
                                            <td className='py-3 px-4 align-middle text-xs text-gray-300 font-sans max-w-[140px] whitespace-nowrap overflow-hidden'>
                                                <div className='flex items-center gap-1.5 truncate'>
                                                    {srv.template_icon ? (
                                                        <img
                                                            src={srv.template_icon}
                                                            alt={srv.os_name || 'OS'}
                                                            className='w-4 h-4 inline object-contain shrink-0'
                                                        />
                                                    ) : null}
                                                    <span className='truncate'>{srv.os_name || '—'}</span>
                                                </div>
                                            </td>

                                            {/* CPU Usage */}
                                            <td className='py-3 px-4 align-middle'>
                                                {renderDynamicCpuMeter(srv.cpu_usage)}
                                            </td>

                                            {/* Price Cell */}
                                            <td className='py-3 px-4 align-middle font-mono text-xs whitespace-nowrap'>
                                                <div className='inline-flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg'>
                                                    <BoltSvgIcon className='w-3.5 h-3.5 text-amber-400 shrink-0' />
                                                    <span>{srv.price.toFixed(2)} BOLTs / 30d</span>
                                                </div>
                                            </td>

                                            {/* Due Date Cell */}
                                            <td className='py-3 px-4 align-middle font-mono text-xs text-gray-300 whitespace-nowrap'>
                                                {srv.due_date}
                                            </td>

                                            {/* Status Cell */}
                                            <td className='py-3 px-4 align-middle whitespace-nowrap'>
                                                <span
                                                    className={`px-3 py-1 rounded-full text-xs font-mono font-semibold inline-block text-center ${
                                                        srv.status === 'Active'
                                                            ? 'bg-[#192f25] border border-[#22c55e]/30 text-[#22c55e]'
                                                            : 'bg-[#37191e] border border-[#ef4444]/30 text-[#ef4444]'
                                                    }`}
                                                >
                                                    {srv.status}
                                                </span>
                                            </td>

                                            {/* Action Button Cell */}
                                            <td className='py-3 px-4 text-right align-middle whitespace-nowrap'>
                                                <button
                                                    onClick={() => onRenew(srv)}
                                                    disabled={renewingId === srv.internal_id}
                                                    className='px-3.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-200 text-xs font-sans font-semibold inline-flex items-center gap-1.5 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50 hover:text-white'
                                                >
                                                    {renewingId === srv.internal_id ? (
                                                        <RotateCw className='w-3.5 h-3.5 text-blue-400 animate-spin' />
                                                    ) : (
                                                        <Calendar className='w-3.5 h-3.5 text-blue-400' />
                                                    )}
                                                    <span>Renew (+30d)</span>
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
