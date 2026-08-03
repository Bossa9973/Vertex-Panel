import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStoreState, useStoreActions } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import http from '@/api/http'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import DiscordBoostIcon from '@/components/elements/DiscordBoostIcon'
import BorderTrail from '@/components/ui/border-trail'
import { Sparkles as SparklesComp } from '@/components/ui/sparkles'
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal'
import ConnectDiscordModal from '@/components/dashboard/ConnectDiscordModal'
import { GlassWalletCard } from '@/components/dashboard/GlassWalletCard'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'
import {
    UserGroupIcon,
    ChatBubbleLeftRightIcon,
    CheckCircleIcon,
    ArrowRightIcon,
    ShieldCheckIcon,
    LinkIcon,
    ExclamationTriangleIcon,
    GiftIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline'

interface EarnTask {
    key: string
    title: string
    category: 'invites' | 'boosts' | 'messages'
    requirement_text: string
    target_count: number
    reward_bolts: number
    is_claimed: boolean
    claimed_at: string | null
    discord_id: string | null
    current_count?: number
    is_eligible?: boolean
}

export const EarnBoltsContainer: React.FC = () => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)

    const [tasks, setTasks] = useState<EarnTask[]>([])
    const [loading, setLoading] = useState(true)
    const [discordId, setDiscordId] = useState<string | null>((user as any)?.discord_id || null)
    const [discordUsername, setDiscordUsername] = useState<string | null>((user as any)?.discord_username || null)
    const [claimingKey, setClaimingKey] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'all' | 'invites' | 'boosts' | 'messages'>('all')
    const [connectModalOpen, setConnectModalOpen] = useState(false)

    const userCredits = user?.credits ?? 0

    const fetchStatus = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/client/earn/status')
            if (res.data?.data) {
                const data = res.data.data
                if (data.tasks) setTasks(data.tasks)
                if (data.discord_id) {
                    setDiscordId(data.discord_id)
                    setConnectModalOpen(false)
                }
                if (data.discord_username) setDiscordUsername(data.discord_username)
            }
        } catch (err) {
            console.error('Failed to load earn tasks:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()
    }, [])

    const handleClaim = async (task: EarnTask) => {
        if (task.is_claimed || claimingKey) return

        if (!discordId) {
            setConnectModalOpen(true)
            return
        }

        setClaimingKey(task.key)
        try {
            const res = await http.post('/api/client/earn/claim', {
                task_key: task.key,
                discord_id: discordId,
            })

            if (res.data?.success) {
                alert(res.data.message || `Successfully claimed ${task.reward_bolts} BOLTs!`)
                if (res.data.data?.new_balance !== undefined) {
                    updateCredits(res.data.data.new_balance)
                }
                fetchStatus()
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Failed to claim reward. Please verify your requirement eligibility.'
            alert(msg)
        } finally {
            setClaimingKey(null)
        }
    }

    const filteredTasks = tasks.filter(t => activeTab === 'all' || t.category === activeTab)
    const totalAvailableBolts = tasks.filter(t => !t.is_claimed).reduce((sum, t) => sum + t.reward_bolts, 0)
    const claimedCount = tasks.filter(t => t.is_claimed).length

    return (
        <PageMaintenanceGuard pageKey='earn'>
        <PageContentBlock title='Earn Free BOLTs'>
            {/* ── Outer Section ── */}
            <div className='relative w-full rounded-3xl p-6 md:p-8 overflow-hidden'>

                {/* Sparkles Star Particle Layer */}
                <div className='absolute top-0 left-0 right-0 h-96 w-full overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] pointer-events-none z-0'>
                    <SparklesComp
                        id='earn-page-sparkles-onboard'
                        density={1400}
                        direction='bottom'
                        speed={0.8}
                        color='#FFFFFF'
                        className='absolute inset-x-0 top-0 h-full w-full opacity-60'
                    />
                </div>

                {/* ── Page Content Layer (z-20) ── */}
                <div className='relative z-20'>

                    {/* Breadcrumb Navigation */}
                    <div className='flex items-center space-x-2 text-xs font-semibold text-gray-400 font-sans mb-6'>
                        <Link to='/' className='hover:text-white transition-colors'>
                            Dashboard
                        </Link>
                        <span>&gt;</span>
                        <span className='text-white font-bold'>
                            Earn BOLTs
                        </span>
                    </div>

                    {/* ── Big Hero Panel — Liquid Glass Card with BorderTrail ── */}
                    <div className='relative overflow-hidden rounded-2xl p-6 md:p-8 mb-8 border border-blue-500/50 bg-gradient-to-br from-neutral-900/90 via-blue-950/40 to-neutral-950/90 backdrop-blur-md shadow-lg shadow-blue-950/50 ring-1 ring-blue-500/40 transition-all'>
                        <BorderTrail
                            className='bg-gradient-to-r from-blue-500 via-indigo-400 to-cyan-400'
                            size={100}
                            style={{
                                boxShadow: '0px 0px 35px 18px rgba(59, 130, 246, 0.6)',
                            }}
                        />

                        <div className='relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center'>
                            <div className='lg:col-span-2'>
                                <div className='flex flex-wrap items-center gap-2.5 mb-3'>
                                    <span className='px-3.5 py-1 rounded-full text-xs font-medium bg-[#5865F2]/15 text-[#5865F2] border border-[#5865F2]/30 flex items-center gap-1.5 backdrop-blur-md shadow-sm'>
                                        <GiftIcon className='w-3.5 h-3.5' /> Community Rewards
                                    </span>
                                    <span className='px-3.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5 backdrop-blur-md shadow-sm'>
                                        <BoltSvgIcon className='w-3.5 h-3.5' /> {totalAvailableBolts.toLocaleString()} Available
                                    </span>
                                </div>

                                <h2 className='text-2xl md:text-3xl font-medium text-white tracking-tight font-sans mb-2'>
                                    <VerticalCutReveal
                                        splitBy='words'
                                        staggerDuration={0.08}
                                        staggerFrom='first'
                                        reverse={true}
                                        containerClassName='gap-1.5'
                                        transition={{
                                            type: 'spring',
                                            stiffness: 250,
                                            damping: 40,
                                            delay: 0,
                                        }}
                                    >
                                        Earn Free BOLTs for Community Activity
                                    </VerticalCutReveal>
                                </h2>
                                <p className='text-xs md:text-sm text-gray-300 font-normal leading-relaxed max-w-2xl font-sans mt-1'>
                                    Complete Discord community challenges, invite new members, boost our server, and chat to earn free BOLTs added directly to your account balance.
                                </p>
                            </div>

                            {/* Glass Wallet Balance Card */}
                            <div className='flex justify-center lg:justify-end'>
                                <GlassWalletCard
                                    balance={userCredits.toFixed(2)}
                                    currency='BOLTs'
                                    cardHolder={(user as any) ? `${(user as any).firstname || ''} ${(user as any).lastname || ''}`.trim() || (user as any).username || user?.email : 'Account Client'}
                                    cardNumber={`ACCT •••• •••• ${String((user as any)?.id || 1001).padStart(4, '0')}`}
                                    expiry={`Tasks: ${claimedCount}/${tasks.length}`}
                                    address={user?.email ? user.email.split('@')[0] : 'Active'}
                                    trend='Active'
                                    className='max-w-none w-full'
                                />
                            </div>
                        </div>
                    </div>

                    {/* Discord Connection Panel — Liquid Glass */}
                    <div className='relative overflow-hidden rounded-2xl p-5 mb-8 border border-blue-500/50 bg-gradient-to-br from-neutral-900/90 via-blue-950/40 to-neutral-950/90 backdrop-blur-md shadow-lg shadow-blue-950/50 ring-1 ring-blue-500/40 transition-all'>
                        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                            <div className='flex items-center gap-3.5'>
                                <div className='w-11 h-11 rounded-2xl bg-[#5865F2]/15 border border-[#5865F2]/30 flex items-center justify-center text-[#5865F2] shrink-0 shadow-lg shadow-[#5865F2]/10 backdrop-blur-md'>
                                    <UserGroupIcon className='w-5 h-5' />
                                </div>
                                <div>
                                    <div className='flex items-center gap-2'>
                                        <h4 className='text-sm font-bold text-white tracking-tight'>
                                            Discord Account Connection
                                        </h4>
                                        {discordId ? (
                                            <span className='px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 backdrop-blur-md'>
                                                <CheckCircleIcon className='w-3.5 h-3.5' /> Connected
                                            </span>
                                        ) : (
                                            <span className='px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1 backdrop-blur-md'>
                                                <ExclamationTriangleIcon className='w-3.5 h-3.5' /> Link Required
                                            </span>
                                        )}
                                    </div>
                                    <p className='text-xs text-gray-400 font-sans mt-0.5'>
                                        {discordId
                                            ? `Linked Discord: ${discordUsername || discordId} (${discordId})`
                                            : 'Link your Discord account to enable invite, boost, and chat reward verification.'}
                                    </p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <button
                                    onClick={() => setConnectModalOpen(true)}
                                    className='px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#5865F2] to-[#4752C4] hover:from-[#4752C4] hover:to-[#3c45a5] text-white font-bold text-xs shadow-lg shadow-[#5865F2]/30 border border-[#7983f5]/40 transition-all cursor-pointer flex items-center gap-2 active:scale-95'
                                >
                                    <LinkIcon className='w-4 h-4' />
                                    {discordId ? 'Manage Discord Link' : 'Connect Discord Account'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Filter Tabs — Liquid Glass Pill Bar */}
                    <div className='flex flex-wrap items-center justify-between gap-4 mb-6 font-sans'>
                        <div className='flex items-center space-x-1.5 bg-neutral-900/60 p-1.5 rounded-full border border-blue-500/30 backdrop-blur-md shadow-md ring-1 ring-blue-500/20'>
                            {[
                                { id: 'all', label: 'All Tasks' },
                                { id: 'invites', label: 'Invites Rewards' },
                                { id: 'boosts', label: 'Server Boosts' },
                                { id: 'messages', label: 'Chat Activity' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`px-4 py-1.5 rounded-full text-xs transition-all cursor-pointer ${
                                        activeTab === tab.id
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border border-blue-400/40 text-white font-bold shadow-lg shadow-blue-600/30'
                                            : 'text-gray-400 hover:text-white font-medium bg-transparent'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <a
                            href='https://discord.gg'
                            target='_blank'
                            rel='noreferrer'
                            className='flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-[#5865F2] to-[#4752C4] hover:from-[#4752C4] hover:to-[#3c45a5] text-white font-bold text-xs shadow-lg shadow-[#5865F2]/25 border border-[#7983f5]/40 transition-all cursor-pointer active:scale-95'
                        >
                            Join Official Discord <ArrowRightIcon className='w-3.5 h-3.5' />
                        </a>
                    </div>

                    {/* Tasks Section */}
                    <div className='relative rounded-3xl overflow-hidden'>
                        {!discordId && (
                            <div className='absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-950/90 via-neutral-950/80 to-blue-950/90 backdrop-blur-xl rounded-3xl border border-blue-500/20 text-center font-sans'>
                                <div className='w-14 h-14 rounded-2xl bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center text-[#5865F2] mb-3 shadow-[0_0_30px_rgba(88,101,242,0.4)]'>
                                    <UserGroupIcon className='w-7 h-7' />
                                </div>
                                <h3 className='text-xl font-bold text-white tracking-tight mb-1'>
                                    Discord Connection Required
                                </h3>
                                <p className='text-xs text-gray-300 max-w-md leading-relaxed mb-5 font-sans'>
                                    You must link your Discord account to verify server invites, boost status, and chat activity rewards!
                                </p>
                                <button
                                    onClick={() => setConnectModalOpen(true)}
                                    className='px-6 py-3 rounded-xl bg-gradient-to-r from-[#5865F2] to-[#4752C4] hover:from-[#4752C4] hover:to-[#3c45a5] text-white font-bold text-xs shadow-xl shadow-[#5865F2]/30 border border-[#7983f5]/40 transition cursor-pointer flex items-center gap-2 active:scale-95'
                                >
                                    <LinkIcon className='w-4 h-4' /> Connect Discord Account Now
                                </button>
                            </div>
                        )}

                        <div className={!discordId ? 'filter blur-[4px] select-none pointer-events-none opacity-50 transition-all duration-500' : ''}>
                            {loading ? (
                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                                    {[1, 2, 3, 4, 5, 6].map(i => (
                                        <div key={i} className='h-52 rounded-2xl bg-neutral-900/40 border border-blue-500/20 backdrop-blur-xl animate-pulse' />
                                    ))}
                                </div>
                            ) : (
                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans mb-8'>
                                    {filteredTasks.map(task => {
                                        const isClaimed = task.is_claimed
                                        const isClaiming = claimingKey === task.key

                                        let icon = <UserGroupIcon className='w-5 h-5 text-blue-400' />
                                        if (task.category === 'boosts') {
                                            icon = <DiscordBoostIcon className='w-5 h-5' />
                                        } else if (task.category === 'messages') {
                                            icon = <ChatBubbleLeftRightIcon className='w-5 h-5 text-emerald-400' />
                                        }

                                        return (
                                            /* ── Liquid Glass Card with BorderTrail ── */
                                            <div
                                                key={task.key}
                                                className={`relative overflow-hidden rounded-xl border p-6 backdrop-blur-md transition-all duration-300 flex flex-col justify-between group hover:scale-[1.01] ${
                                                    isClaimed
                                                        ? 'bg-emerald-950/20 border-emerald-500/30 opacity-90 shadow-lg'
                                                        : 'border-blue-500/50 bg-gradient-to-br from-neutral-900/90 via-blue-950/40 to-neutral-950/90 shadow-lg shadow-blue-950/50 ring-1 ring-blue-500/40 hover:border-blue-400/60 hover:ring-blue-400/50'
                                                }`}
                                            >
                                                <BorderTrail
                                                    className={isClaimed ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 via-indigo-400 to-cyan-400'}
                                                    size={80}
                                                    style={{
                                                        boxShadow: isClaimed
                                                            ? '0px 0px 25px 12px rgba(16, 185, 129, 0.5)'
                                                            : '0px 0px 30px 15px rgba(59, 130, 246, 0.6)',
                                                    }}
                                                />

                                                <div>
                                                    {/* Task Header */}
                                                    <div className='flex items-center justify-between gap-3 mb-4'>
                                                        <div className='w-11 h-11 rounded-xl bg-black/40 border border-blue-500/30 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner'>
                                                            {icon}
                                                        </div>
                                                        <span className='px-3.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-sans backdrop-blur-md flex items-center gap-1.5 shadow-sm'>
                                                            <BoltSvgIcon className='w-3.5 h-3.5 text-amber-400' /> +{task.reward_bolts.toLocaleString()} BOLTs
                                                        </span>
                                                    </div>

                                                    {/* Title & Requirements */}
                                                    <h3 className='text-base font-bold text-white tracking-tight mb-1'>
                                                        {task.title}
                                                    </h3>
                                                    <p className='text-xs text-gray-300 font-normal leading-relaxed mb-5'>
                                                        {task.requirement_text}
                                                    </p>

                                                    {/* Inset Box */}
                                                    {(() => {
                                                        const current = isClaimed ? task.target_count : (task.current_count ?? 0)
                                                        const target = task.target_count
                                                        const pct = Math.min(100, Math.round((current / target) * 100))

                                                        return (
                                                            <div className='space-y-1.5 mb-6 p-3 rounded-lg border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-md shadow-inner'>
                                                                <div className='flex justify-between text-xs font-medium text-gray-300'>
                                                                    <span>Progress</span>
                                                                    <span className='text-white font-semibold font-sans'>
                                                                        {current.toLocaleString()} / {target.toLocaleString()} ({pct}%)
                                                                    </span>
                                                                </div>
                                                                <div className='w-full h-2 rounded-full bg-black/80 border border-white/10 overflow-hidden p-0.5'>
                                                                    <div
                                                                        style={{ width: `${pct}%` }}
                                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                                            isClaimed
                                                                                ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                                                                : pct >= 100
                                                                                ? 'bg-gradient-to-r from-blue-500 to-emerald-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]'
                                                                                : 'bg-gradient-to-r from-amber-500 to-amber-400'
                                                                        }`}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}
                                                </div>

                                                {/* Action Button */}
                                                <div>
                                                    {isClaimed ? (
                                                        <button
                                                            disabled
                                                            className='w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-950/80 to-teal-950/80 text-emerald-400 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.25)] backdrop-blur-md cursor-default font-sans'
                                                        >
                                                            <CheckCircleIcon className='w-4 h-4 text-emerald-400' /> Reward Claimed ({task.reward_bolts.toLocaleString()} BOLTs)
                                                        </button>
                                                    ) : task.is_eligible ? (
                                                        <button
                                                            onClick={() => handleClaim(task)}
                                                            disabled={isClaiming}
                                                            className='w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_25px_rgba(59,130,246,0.5)] border border-blue-400/50 transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 font-sans'
                                                        >
                                                            <SparklesIcon className='w-4 h-4 text-cyan-300 animate-pulse' />
                                                            {isClaiming ? 'Verifying Requirement...' : `Verify & Claim +${task.reward_bolts.toLocaleString()} BOLTs`}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleClaim(task)}
                                                            disabled={isClaiming}
                                                            className='w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-neutral-900/90 via-blue-950/60 to-neutral-950/90 hover:from-blue-950/80 hover:to-indigo-950/80 text-blue-300 border border-blue-500/30 hover:border-blue-400/50 shadow-md backdrop-blur-md transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 font-sans'
                                                        >
                                                            <ArrowRightIcon className='w-3.5 h-3.5 text-blue-400' />
                                                            {isClaiming ? 'Checking Eligibility...' : `In Progress (${(task.current_count ?? 0).toLocaleString()} / ${task.target_count})`}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Connect Discord Mantine Modal */}
            <ConnectDiscordModal
                opened={connectModalOpen}
                onClose={() => setConnectModalOpen(false)}
                currentDiscordId={discordId}
                onSuccess={(newId, newUsername) => {
                    setDiscordId(newId)
                    setDiscordUsername(newUsername)
                    setConnectModalOpen(false)
                    fetchStatus()
                }}
            />
        </PageContentBlock>
        </PageMaintenanceGuard>
    )
}

export default EarnBoltsContainer
