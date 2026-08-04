import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, RotateCw, Plus, Copy, Check, Layers, Eye, EyeOff, Calendar } from 'lucide-react'
import BorderBeam from '@/components/ui/BorderBeam'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'

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
        <div
            className='relative overflow-hidden rounded-[11px] p-6 mb-8 font-sans text-left transition-all'
            style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
        >
            {/* Section Header */}
            <div className='relative z-10 flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-[rgba(255,255,255,0.07)] text-left'>
                <div className='flex items-center gap-3'>
                    <h2 className='text-lg font-bold text-white tracking-tight font-sans'>Active Services</h2>
                    <span className='px-2 py-0.5 rounded-full border border-neutral-700/80 text-neutral-400 text-xs font-mono font-normal bg-transparent'>
                        {servers.length}
                    </span>
                </div>
            </div>

            {/* Table Content */}
            <div className='relative z-10'>
                {loading ? (
                    <div className='text-center py-16 text-neutral-400 text-xs font-semibold flex flex-col items-center justify-center gap-3 font-sans'>
                        <RotateCw className='w-5 h-5 animate-spin text-neutral-400' />
                        <span>Loading active services...</span>
                    </div>
                ) : servers.length === 0 ? (
                    <div className='text-center py-14 px-4 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/30 font-sans'>
                        <div className='w-12 h-12 mx-auto rounded-xl bg-neutral-800/50 border border-neutral-700 flex items-center justify-center text-neutral-400 mb-3'>
                            <Layers className='w-6 h-6' />
                        </div>
                        <h3 className='text-sm font-bold text-neutral-200'>No Active Virtual Services</h3>
                        <p className='text-xs text-neutral-400 mt-1 max-w-sm mx-auto leading-relaxed'>
                            You haven't requested any VPS instances yet. Use your account BOLTs to deploy a 30-day server instance.
                        </p>
                        <button
                            onClick={onDeploy}
                            className='mt-4 px-4 py-2 rounded-[4px] bg-white hover:bg-neutral-200 text-black font-semibold text-xs inline-flex items-center gap-2 transition cursor-pointer shadow-sm'
                        >
                            <Plus className='w-4 h-4' /> Deploy VPS Instance Now
                        </button>
                    </div>
                ) : (
                    <div className='overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'>
                        <table className='w-full text-left border-collapse font-sans'>
                            <thead>
                                <tr className='border-b border-[rgba(255,255,255,0.07)] text-[11px] font-semibold text-neutral-300 tracking-wider uppercase opacity-90'>
                                    <th className='py-2.5 px-3.5'>Service Name</th>
                                    <th className='py-2.5 px-3.5'>Location</th>
                                    <th className='py-2.5 px-3.5'>IP</th>
                                    <th className='py-2.5 px-3.5'>CPU</th>
                                    <th className='py-2.5 px-3.5'>Price</th>
                                    <th className='py-2.5 px-3.5'>Due Date</th>
                                    <th className='py-2.5 px-3.5'>Status</th>
                                    <th className='py-2.5 px-3.5 text-right'>Action</th>
                                </tr>
                            </thead>
                            <tbody className='text-xs font-medium text-neutral-200'>
                                {servers.map((srv) => {
                                    const isRevealed = !!revealedIps[srv.ip]

                                    return (
                                        <tr
                                            key={srv.id}
                                            className='h-11 transition-all duration-150 ease-out group border-b border-[rgba(255,255,255,0.05)] border-l-2 border-l-transparent hover:border-l-[#22c55e] hover:bg-[rgba(255,255,255,0.04)]'
                                        >
                                            {/* Service Name & Subdomain below */}
                                            <td className='py-2.5 px-3.5 align-middle'>
                                                <div className='font-bold text-white text-xs font-sans tracking-tight'>
                                                    <Link to={`/servers/${srv.id}`} className='hover:text-neutral-200 transition-colors'>
                                                        {srv.name}
                                                    </Link>
                                                </div>
                                                <div className='text-[10px] text-[#666666] font-mono tracking-tight mt-0.5'>
                                                    {srv.hostname}
                                                </div>
                                            </td>

                                            {/* Location */}
                                            <td className='py-2.5 px-3.5 align-middle'>
                                                <div className='flex items-center gap-2'>
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
                                                    <span className='text-neutral-300 font-medium text-xs font-sans'>{srv.location}</span>
                                                </div>
                                            </td>

                                            {/* IP Address Column */}
                                            <td className='py-2.5 px-3.5 align-middle min-w-[150px] font-mono'>
                                                {isRevealed ? (
                                                    <div className='inline-flex items-center gap-2 text-xs text-neutral-200 font-mono'>
                                                        <span>{srv.ip}</span>
                                                        <button
                                                            onClick={(e) => handleCopyIp(srv.ip, e)}
                                                            title='Copy IP address'
                                                            className='text-neutral-400 hover:text-white transition-colors cursor-pointer p-0.5'
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
                                                            className='text-neutral-400 hover:text-white transition-colors cursor-pointer p-0.5'
                                                        >
                                                            <EyeOff className='w-3 h-3' />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span
                                                        onClick={(e) => toggleRevealIp(srv.ip, e)}
                                                        className='font-mono text-xs text-neutral-400 blur-[3px] hover:blur-none select-none cursor-pointer tracking-wider inline-block transition-all duration-150 hover:text-white'
                                                    >
                                                        {srv.ip}
                                                    </span>
                                                )}
                                            </td>

                                            {/* CPU Percentage in Monospace (No Progress Bar) */}
                                            <td className='py-2.5 px-3.5 align-middle font-mono text-xs text-neutral-300'>
                                                {srv.cpu_usage}%
                                            </td>

                                            {/* Price Column: Slightly brighter white for BOLTs */}
                                            <td className='py-2.5 px-3.5 align-middle font-mono text-xs'>
                                                <div className='inline-flex items-baseline'>
                                                    <span className='text-white font-semibold font-mono'>{Math.round(srv.price ?? 30)} BOLTs</span>
                                                    <span className='text-[10px] text-neutral-400 font-sans ml-1'>/ 30d</span>
                                                </div>
                                            </td>

                                            {/* Due Date in Monospace */}
                                            <td className='py-2.5 px-3.5 align-middle font-mono text-xs text-neutral-400'>
                                                {srv.due_date}
                                            </td>

                                            {/* Status: Pulsing 4px dot + "Active" in small-caps, no background */}
                                            <td className='py-2.5 px-3.5 align-middle'>
                                                <div className='inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#22c55e]'>
                                                    <span
                                                        className={`w-1 h-1 rounded-full shrink-0 ${
                                                            srv.status === 'Active'
                                                                ? 'bg-[#22c55e] animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]'
                                                                : 'bg-rose-500'
                                                        }`}
                                                    />
                                                    <span>{srv.status === 'Active' ? 'Active' : srv.status.toUpperCase()}</span>
                                                </div>
                                            </td>

                                            {/* Action Button: Presence border, hover fill glass background */}
                                            <td className='py-2.5 px-3.5 text-right align-middle'>
                                                <button
                                                    onClick={() => onRenew(srv)}
                                                    disabled={renewingId === srv.internal_id}
                                                    className='px-3 py-1 rounded-[4px] border border-[rgba(255,255,255,0.15)] bg-transparent text-neutral-200 text-xs font-medium hover:border-white hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-all duration-150 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5'
                                                >
                                                    {renewingId === srv.internal_id && (
                                                        <RotateCw className='w-3 h-3 animate-spin text-neutral-400' />
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
