import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, RotateCw, Plus, Copy, Check, Layers, Eye, EyeOff, Calendar } from 'lucide-react'
import BorderBeam from '@/components/ui/BorderBeam'

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
        <div className='relative overflow-hidden bg-gradient-to-b from-[#141619] via-[#121417] to-[#0c0d10] border border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-black/60 mb-8 backdrop-blur-md font-sans'>
            {/* Border Beam Accent Animation */}
            <BorderBeam size={280} duration={14} delay={0} colorFrom='#3b82f6' colorTo='#8b5cf6' borderWidth={1.5} />

            {/* Section Header */}
            <div className='relative z-10 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.08]'>
                <div className='flex items-center gap-3.5'>
                    <div className='w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]'>
                        <ServerSvgIcon className='w-5 h-5 text-blue-400' />
                    </div>
                    <div>
                        <div className='flex items-center gap-2.5'>
                            <h2 className='text-lg font-bold text-white tracking-tight font-sans'>Active Services</h2>
                            <span className='px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono font-bold'>
                                {servers.length}
                            </span>
                        </div>
                        <p className='text-xs text-slate-400 mt-0.5 font-sans'>
                            Virtual server instances deployed on your account. Each server lasts 30 days before expiration.
                        </p>
                    </div>
                </div>
            </div>

            {/* Table Content */}
            <div className='relative z-10'>
                {loading ? (
                    <div className='text-center py-16 text-slate-400 text-xs font-semibold flex flex-col items-center justify-center gap-3 font-sans'>
                        <RotateCw className='w-6 h-6 animate-spin text-blue-500' />
                        <span>Loading active services from panel...</span>
                    </div>
                ) : servers.length === 0 ? (
                    <div className='text-center py-14 px-4 border border-dashed border-white/[0.08] rounded-2xl bg-white/[0.02] backdrop-blur-xs font-sans'>
                        <div className='w-14 h-14 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400 mb-3.5 shadow-lg'>
                            <Layers className='w-7 h-7' />
                        </div>
                        <h3 className='text-sm font-bold text-slate-200'>No Active Virtual Services</h3>
                        <p className='text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed'>
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
                                <tr className='border-b border-white/[0.08] text-xs font-medium text-slate-400 pb-3 tracking-wide'>
                                    <th className='py-3.5 px-3.5'>Service Name</th>
                                    <th className='py-3.5 px-3.5'>Location</th>
                                    <th className='py-3.5 px-3.5'>IP</th>
                                    <th className='py-3.5 px-3.5'>CPU</th>
                                    <th className='py-3.5 px-3.5'>Price</th>
                                    <th className='py-3.5 px-3.5'>Due Date</th>
                                    <th className='py-3.5 px-3.5'>Status</th>
                                    <th className='py-3.5 px-3.5 text-right'>Action</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-white/[0.04] text-xs font-medium text-slate-200'>
                                {servers.map((srv) => {
                                    const isRevealed = !!revealedIps[srv.ip]

                                    return (
                                        <tr key={srv.id} className='hover:bg-white/[0.03] transition-colors duration-150 group'>
                                            {/* Service Name & SVG Icon */}
                                            <td className='py-4 px-3.5 align-middle'>
                                                <div className='font-bold text-white flex items-center gap-2.5 text-xs font-sans tracking-tight'>
                                                    <ServerSvgIcon className='w-4 h-4 text-blue-400 shrink-0' />
                                                    <Link to={`/servers/${srv.id}`} className='hover:text-blue-400 transition-colors'>
                                                        {srv.name}
                                                    </Link>
                                                </div>
                                                <div className='text-[10px] text-slate-500 font-mono tracking-tight mt-0.5 pl-6.5'>
                                                    {srv.hostname}
                                                </div>
                                            </td>

                                            {/* Location (Circular Flag + Text) */}
                                            <td className='py-4 px-3.5 align-middle'>
                                                <div className='flex items-center gap-2.5'>
                                                    <img
                                                        src={srv.flag}
                                                        alt={srv.location}
                                                        className='w-5 h-5 rounded-full object-cover shadow-xs border border-white/10 shrink-0'
                                                    />
                                                    <span className='text-slate-300 font-medium text-xs font-sans tracking-tight'>{srv.location}</span>
                                                </div>
                                            </td>

                                            {/* IP Address Column: Blurred text with floating hover message bubble */}
                                            <td className='py-4 px-3.5 align-middle min-w-[170px]'>
                                                {isRevealed ? (
                                                    <div className='inline-flex items-center gap-2 font-mono text-xs text-slate-200 font-semibold bg-[#0d0e11] border border-blue-500/30 px-2.5 py-1 rounded-lg shadow-sm tracking-tight'>
                                                        <span>{srv.ip}</span>
                                                        <div className='flex items-center gap-1 border-l border-white/[0.08] pl-1.5 ml-0.5'>
                                                            <button
                                                                onClick={(e) => handleCopyIp(srv.ip, e)}
                                                                title='Copy IP address'
                                                                className='text-slate-400 hover:text-white transition-colors cursor-pointer p-0.5 rounded'
                                                            >
                                                                {copiedIp === srv.ip ? (
                                                                    <Check className='w-3.5 h-3.5 text-emerald-400' />
                                                                ) : (
                                                                    <Copy className='w-3.5 h-3.5' />
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={(e) => toggleRevealIp(srv.ip, e)}
                                                                title='Hide IP address'
                                                                className='text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-0.5 rounded'
                                                            >
                                                                <EyeOff className='w-3.5 h-3.5' />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className='relative inline-block group/ip'>
                                                        {/* Blurred IP text - clicking toggles reveal */}
                                                        <span
                                                            onClick={(e) => toggleRevealIp(srv.ip, e)}
                                                            className='font-mono text-xs text-slate-300 blur-[4px] hover:blur-[2px] select-none cursor-pointer tracking-wider inline-block py-1 px-1.5 rounded transition-all duration-200 hover:text-white'
                                                        >
                                                            {srv.ip}
                                                        </span>

                                                        {/* Floating Tooltip Bubble on Hover */}
                                                        <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover/ip:opacity-100 transition-all duration-200 z-30 transform group-hover/ip:-translate-y-1'>
                                                            <div className='bg-black/90 text-white text-[10px] font-sans font-semibold px-2.5 py-1 rounded-md border border-white/[0.1] shadow-xl whitespace-nowrap flex items-center gap-1.5'>
                                                                <Eye className='w-3 h-3 text-blue-400' />
                                                                <span>Click to review</span>
                                                            </div>
                                                            {/* Tooltip arrow */}
                                                            <div className='w-2 h-2 bg-black/90 border-r border-b border-white/[0.1] rotate-45 mx-auto -mt-1' />
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Dynamic CPU Usage Bar */}
                                            <td className='py-4 px-3.5 align-middle'>
                                                {renderDynamicCpuMeter(srv.cpu_usage)}
                                            </td>

                                            {/* Price */}
                                            <td className='py-4 px-3.5 align-middle font-mono text-xs text-slate-300 font-medium tracking-tight'>
                                                ${(srv.price ?? 0).toFixed(2)} / Hours
                                            </td>

                                            {/* Due Date */}
                                            <td className='py-4 px-3.5 align-middle text-xs text-slate-300 font-medium font-sans tracking-tight'>
                                                {srv.due_date}
                                            </td>

                                            {/* Status Badge */}
                                            <td className='py-4 px-3.5 align-middle'>
                                                <span
                                                    className={`px-3.5 py-1 rounded-full text-xs font-mono font-semibold inline-block text-center transition-all tracking-tight ${
                                                        srv.status === 'Active'
                                                            ? 'bg-[#192f25] border border-[#22c55e]/30 text-[#22c55e]'
                                                            : 'bg-[#37191e] border border-[#ef4444]/30 text-[#ef4444]'
                                                    }`}
                                                >
                                                    {srv.status}
                                                </span>
                                            </td>

                                            {/* Action Button */}
                                            <td className='py-4 px-3.5 text-right align-middle'>
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
