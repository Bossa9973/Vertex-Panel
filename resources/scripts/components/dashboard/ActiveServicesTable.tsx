import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Copy, Check, Layers, Eye, EyeOff, RotateCw, Server, ArrowRight } from 'lucide-react'
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
    os_distro?: string
}

interface Props {
    servers: ServerItem[]
    loading: boolean
    onDeploy: () => void
    onRenew: (srv: ServerItem) => void
    renewingId: number | null
}

const OsBrandIcon = ({ name = '' }: { name: string }) => {
    const str = name.toLowerCase()
    if (str.includes('ubuntu')) {
        return (
            <svg className='w-4 h-4 text-orange-500 shrink-0' viewBox='0 0 24 24' fill='currentColor'>
                <circle cx='12' cy='4.5' r='1.5' />
                <circle cx='5.5' cy='15.75' r='1.5' />
                <circle cx='18.5' cy='15.75' r='1.5' />
                <path d='M12 2a10 10 0 100 20 10 10 0 000-20zm0 3.5a6.5 6.5 0 015.63 3.25 2.75 2.75 0 00-2.06 1.03 6.5 6.5 0 01-7.14 0 2.75 2.75 0 00-2.06-1.03A6.5 6.5 0 0112 5.5z' />
            </svg>
        )
    }
    if (str.includes('debian')) {
        return (
            <svg className='w-4 h-4 text-rose-500 shrink-0' viewBox='0 0 24 24' fill='currentColor'>
                <path d='M12.001 2c-5.522 0-9.999 4.477-9.999 10s4.477 10 9.999 10c5.524 0 10-4.477 10-10s-4.476-10-10-10zm-.008 1.637c.725 0 1.408.106 2.057.291-.689.544-1.282 1.258-1.722 2.115-.445.865-.688 1.871-.703 2.977.014.542.083 1.05.203 1.517.118.468.29.873.513 1.205.223.332.488.583.791.748.303.167.643.251 1.018.251.528 0 1.002-.143 1.411-.426.411-.284.739-.684.978-1.189.24-.506.368-1.109.38-1.799h1.547c-.015.932-.204 1.761-.564 2.472-.36.711-.856 1.282-1.479 1.7-.624.417-1.353.626-2.174.626-.641 0-1.229-.142-1.751-.424a3.83 3.83 0 01-1.289-1.171 4.542 4.542 0 01-.734-1.748 7.375 7.375 0 01-.225-2.146c0-1.455.334-2.738 1.002-3.834.667-1.096 1.579-1.921 2.738-2.465z' />
            </svg>
        )
    }
    if (str.includes('docker') || str.includes('container')) {
        return (
            <svg className='w-4 h-4 text-sky-400 shrink-0' viewBox='0 0 24 24' fill='currentColor'>
                <path d='M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.186v1.887c0 .102.083.185.185.185zm-2.954-5.43h2.118a.185.185 0 00.186-.186V3.575a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zm0 2.716h2.118a.186.186 0 00.186-.186V6.291a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zm-2.955 0h2.119a.186.186 0 00.186-.186V6.291a.186.186 0 00-.186-.185H8.074a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zm-2.954 0h2.118a.186.186 0 00.186-.186V6.291a.186.186 0 00-.186-.185H5.12a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186z' />
            </svg>
        )
    }
    return <Server className='w-4 h-4 text-blue-400 shrink-0' />
}

const SparklineMeter = ({ usage }: { usage: number }) => {
    let strokeColor = '#22C55E'
    let badgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'

    if (usage > 85) {
        strokeColor = '#EF4444'
        badgeBg = 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    } else if (usage > 65) {
        strokeColor = '#F59E0B'
        badgeBg = 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    } else if (usage > 40) {
        strokeColor = '#06B6D4'
        badgeBg = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    }

    const p1 = Math.max(5, Math.min(85, usage * 0.7 + 5))
    const p2 = Math.max(5, Math.min(85, usage * 1.1 + 10))
    const p3 = Math.max(5, Math.min(85, usage * 0.85 + 2))
    const p4 = Math.max(5, Math.min(85, usage))

    const points = `0,${24 - (p1 * 0.2)} 10,${24 - (p2 * 0.2)} 20,${24 - (p3 * 0.2)} 30,${24 - (p4 * 0.2)}`

    return (
        <div className='flex items-center gap-2.5'>
            <svg className='w-9 h-4 overflow-visible shrink-0' viewBox='0 0 30 24'>
                <polyline
                    fill='none'
                    stroke={strokeColor}
                    strokeWidth='2'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    points={points}
                />
            </svg>
            <span className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border ${badgeBg}`}>
                {usage}%
            </span>
        </div>
    )
}

const StatusDotIndicator = ({ status }: { status: 'Active' | 'Expired' | 'Stopped' }) => {
    if (status === 'Active') {
        return (
            <div className='inline-flex items-center gap-2 text-xs font-medium text-emerald-400 font-sans tracking-tight'>
                <span className='relative flex h-2 w-2'>
                    <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75' />
                    <span className='relative inline-flex rounded-full h-2 w-2 bg-emerald-500' />
                </span>
                <span>Active</span>
            </div>
        )
    }
    if (status === 'Stopped') {
        return (
            <div className='inline-flex items-center gap-2 text-xs font-medium text-slate-400 font-sans tracking-tight'>
                <span className='h-2 w-2 rounded-full bg-slate-500' />
                <span>Stopped</span>
            </div>
        )
    }
    return (
        <div className='inline-flex items-center gap-2 text-xs font-medium text-rose-400 font-sans tracking-tight'>
            <span className='h-2 w-2 rounded-full bg-rose-500' />
            <span>Expired</span>
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
        <div className='relative overflow-hidden bg-[#12141A] border border-white/[0.08] rounded-2xl p-6 shadow-2xl backdrop-blur-xl font-sans mb-8 transition-all hover:border-white/[0.12]'>
            {/* Subtle Border Beam Accent */}
            <BorderBeam size={240} duration={16} delay={0} colorFrom='#3b82f6' colorTo='#6366f1' borderWidth={1} />

            {/* Section Header */}
            <div className='relative z-10 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.06]'>
                <div className='flex items-center gap-3.5'>
                    <div className='w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-sm'>
                        <Server className='w-4.5 h-4.5 text-blue-400' />
                    </div>
                    <div>
                        <div className='flex items-center gap-2.5'>
                            <h2 className='text-base font-bold text-white tracking-tight font-sans'>Infrastructure Services</h2>
                            <span className='px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-slate-300 text-xs font-mono font-semibold'>
                                {servers.length}
                            </span>
                        </div>
                        <p className='text-xs text-slate-400 mt-0.5 font-sans'>
                            Active virtual instances provisioned on your account. Renew before 30-day term expiration.
                        </p>
                    </div>
                </div>

                <button
                    onClick={onDeploy}
                    className='px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs inline-flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer active:scale-95'
                >
                    <Plus className='w-4 h-4' />
                    <span>Deploy Instance</span>
                </button>
            </div>

            {/* Table Content */}
            <div className='relative z-10'>
                {loading ? (
                    <div className='text-center py-16 text-slate-400 text-xs font-medium flex flex-col items-center justify-center gap-3 font-sans'>
                        <RotateCw className='w-5 h-5 animate-spin text-blue-400' />
                        <span>Querying instance telemetry...</span>
                    </div>
                ) : servers.length === 0 ? (
                    <div className='text-center py-14 px-4 border border-dashed border-white/[0.08] rounded-2xl bg-white/[0.01] backdrop-blur-xs font-sans'>
                        <div className='w-12 h-12 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400 mb-3 shadow-md'>
                            <Layers className='w-6 h-6' />
                        </div>
                        <h3 className='text-sm font-semibold text-slate-200'>No Active Virtual Services</h3>
                        <p className='text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed'>
                            You have no virtual servers provisioned. Use your account BOLTs to deploy an infrastructure node.
                        </p>
                        <button
                            onClick={onDeploy}
                            className='mt-4 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs inline-flex items-center gap-2 shadow-lg shadow-blue-600/20 transition cursor-pointer active:scale-95'
                        >
                            <Plus className='w-4 h-4' /> Deploy VPS Instance Now
                        </button>
                    </div>
                ) : (
                    <div className='overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'>
                        <table className='w-full text-left border-collapse font-sans'>
                            <thead>
                                <tr className='border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-wider text-slate-400 pb-3'>
                                    <th className='py-3 px-3.5'>Instance & OS</th>
                                    <th className='py-3 px-3.5'>Location</th>
                                    <th className='py-3 px-3.5'>IP Address</th>
                                    <th className='py-3 px-3.5'>CPU Telemetry</th>
                                    <th className='py-3 px-3.5'>Rate</th>
                                    <th className='py-3 px-3.5'>Term Due</th>
                                    <th className='py-3 px-3.5'>Status</th>
                                    <th className='py-3 px-3.5 text-right'>Action</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-white/[0.04] text-xs font-medium text-slate-200'>
                                {servers.map((srv) => {
                                    const isRevealed = !!revealedIps[srv.ip]

                                    return (
                                        <tr key={srv.id} className='hover:bg-white/[0.02] transition-colors duration-150 group'>
                                            {/* Instance Name & OS Brand Icon */}
                                            <td className='py-3.5 px-3.5 align-middle'>
                                                <div className='font-semibold text-white flex items-center gap-2.5 text-xs font-sans tracking-tight'>
                                                    <OsBrandIcon name={srv.name || srv.hostname} />
                                                    <Link to={`/servers/${srv.id}`} className='hover:text-blue-400 transition-colors'>
                                                        {srv.name}
                                                    </Link>
                                                </div>
                                                <div className='text-[11px] text-slate-500 font-mono tracking-tight mt-0.5 pl-6.5'>
                                                    {srv.hostname}
                                                </div>
                                            </td>

                                            {/* Location (Flag SVG + Text) */}
                                            <td className='py-3.5 px-3.5 align-middle'>
                                                <div className='flex items-center gap-2.5'>
                                                    {srv.flag && (srv.flag.startsWith('http://') || srv.flag.startsWith('https://') || srv.flag.startsWith('/')) ? (
                                                        <img
                                                            src={srv.flag}
                                                            alt={srv.location}
                                                            className='w-4.5 h-4.5 rounded-full object-cover shadow-xs border border-white/10 shrink-0'
                                                        />
                                                    ) : (
                                                        <span className='text-xs leading-none shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-white/10 border border-white/15 font-sans'>
                                                            {srv.flag || '🌐'}
                                                        </span>
                                                    )}
                                                    <span className='text-slate-300 font-medium text-xs font-sans tracking-tight'>{srv.location}</span>
                                                </div>
                                            </td>

                                            {/* IP Address Column (JetBrains Mono) */}
                                            <td className='py-3.5 px-3.5 align-middle min-w-[160px]'>
                                                {isRevealed ? (
                                                    <div className='inline-flex items-center gap-2 font-mono text-xs text-slate-200 bg-[#090A0D] border border-white/10 px-2.5 py-1 rounded-lg shadow-sm'>
                                                        <span>{srv.ip}</span>
                                                        <div className='flex items-center gap-1 border-l border-white/10 pl-1.5 ml-0.5'>
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
                                                        <span
                                                            onClick={(e) => toggleRevealIp(srv.ip, e)}
                                                            className='font-mono text-xs text-slate-400 blur-[4px] hover:blur-[2px] select-none cursor-pointer tracking-wider inline-block py-1 px-1.5 rounded transition-all duration-200 hover:text-white'
                                                        >
                                                            {srv.ip}
                                                        </span>
                                                        <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover/ip:opacity-100 transition-all duration-200 z-30 transform group-hover/ip:-translate-y-1'>
                                                            <div className='bg-[#0A0B0E] text-white text-[10px] font-sans font-medium px-2.5 py-1 rounded-md border border-white/10 shadow-xl whitespace-nowrap flex items-center gap-1.5'>
                                                                <Eye className='w-3 h-3 text-blue-400' />
                                                                <span>Click to reveal IP</span>
                                                            </div>
                                                            <div className='w-2 h-2 bg-[#0A0B0E] border-r border-b border-white/10 rotate-45 mx-auto -mt-1' />
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* CPU Telemetry (Mini Sparkline SVG Graph) */}
                                            <td className='py-3.5 px-3.5 align-middle'>
                                                <SparklineMeter usage={srv.cpu_usage} />
                                            </td>

                                            {/* Price Column (Clean typography without container pill box) */}
                                            <td className='py-3.5 px-3.5 align-middle font-sans text-xs font-medium tracking-tight'>
                                                <span className='font-semibold text-slate-200'>{(srv.price ?? 30.00).toFixed(2)} BOLTs</span>
                                                <span className='text-slate-500 text-[11px] ml-1'>/ mo</span>
                                            </td>

                                            {/* Due Date Column */}
                                            <td className='py-3.5 px-3.5 align-middle text-xs text-slate-400 font-medium font-sans tracking-tight'>
                                                {srv.due_date}
                                            </td>

                                            {/* Status Dot Indicator Column */}
                                            <td className='py-3.5 px-3.5 align-middle'>
                                                <StatusDotIndicator status={srv.status} />
                                            </td>

                                            {/* Action Column (Subtle Text Link Action) */}
                                            <td className='py-3.5 px-3.5 text-right align-middle'>
                                                <button
                                                    onClick={() => onRenew(srv)}
                                                    disabled={renewingId === srv.internal_id}
                                                    className='text-blue-400 hover:text-blue-300 font-sans font-medium text-xs inline-flex items-center gap-1 transition-all duration-200 cursor-pointer disabled:opacity-50 group/act'
                                                >
                                                    {renewingId === srv.internal_id ? (
                                                        <RotateCw className='w-3.5 h-3.5 animate-spin' />
                                                    ) : (
                                                        <>
                                                            <span>Renew</span>
                                                            <ArrowRight className='w-3.5 h-3.5 transition-transform duration-200 group-hover/act:translate-x-0.5' />
                                                        </>
                                                    )}
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
