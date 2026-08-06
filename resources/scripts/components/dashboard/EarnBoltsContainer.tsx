import React, { useEffect, useState } from 'react'
import { useStoreState, useStoreActions } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import http from '@/api/http'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import DiscordBoostIcon from '@/components/elements/DiscordBoostIcon'
import ConnectDiscordModal from '@/components/dashboard/ConnectDiscordModal'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'
import { motion } from 'framer-motion'
import {
    UserGroupIcon,
    ChatBubbleLeftRightIcon,
    CheckCircleIcon,
    ArrowRightIcon,
    LinkIcon,
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

    const formattedDiscordUser = discordUsername
        ? `@${discordUsername.replace(/^@/, '')}`
        : discordId
        ? `@${discordId}`
        : null

    return (
        <PageMaintenanceGuard pageKey='earn'>
            <PageContentBlock title='Earn Free BOLTs' showFlashKey='earn'>
                <div className='font-sans text-left pb-12'>

                    {/* HERO SECTION — Floating directly on page background */}
                    <div className='mt-8 mb-6 font-sans text-left'>
                        <div className='flex flex-wrap items-center gap-2.5 mb-3'>
                            <span className='bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-xs uppercase px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5'>
                                <GiftIcon className='w-3.5 h-3.5' /> COMMUNITY REWARDS
                            </span>
                            <span className='bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-xs uppercase px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5'>
                                <BoltSvgIcon className='w-3.5 h-3.5' /> {totalAvailableBolts.toLocaleString()} AVAILABLE
                            </span>
                        </div>

                        <h1 className='text-4xl font-semibold text-white tracking-tight max-w-xl font-sans'>
                            Earn Free BOLTs for Community Activity
                        </h1>
                        <p className='text-sm text-gray-400 max-w-md mt-2 font-normal leading-relaxed font-sans'>
                            Complete Discord community challenges, invite new members, boost our server, and chat to earn free BOLTs added directly to your account balance.
                        </p>
                    </div>

                    {/* DISCORD CONNECTION — Inline Slim Status Bar */}
                    <div className='flex flex-wrap items-center justify-between gap-3 py-3 px-0 border-b border-white/[0.06] mb-6 font-sans text-left'>
                        <div className='flex items-center gap-3'>
                            <UserGroupIcon className='w-5 h-5 text-gray-400 shrink-0' />
                            <span className='text-sm text-gray-300 font-sans'>
                                {formattedDiscordUser ? `Connected as ${formattedDiscordUser}` : 'Discord connection required to verify rewards'}
                            </span>
                            {discordId ? (
                                <span className='bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono shrink-0'>
                                    CONNECTED
                                </span>
                            ) : (
                                <span className='bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono shrink-0'>
                                    LINK REQUIRED
                                </span>
                            )}
                        </div>

                        <button
                            type='button'
                            onClick={() => setConnectModalOpen(true)}
                            className='text-blue-400 hover:text-blue-300 text-xs font-semibold cursor-pointer transition-colors'
                        >
                            {discordId ? 'Manage' : 'Connect Account'}
                        </button>
                    </div>

                    {/* FILTER TABS & JOIN DISCORD CTA */}
                    <div className='flex flex-wrap items-center justify-between gap-4 mt-4 mb-6 font-sans'>
                        {/* StepPillSwitch Filter Tabs */}
                        <div className='relative z-10 flex w-fit rounded-full bg-neutral-900/90 border border-gray-700/80 p-1 backdrop-blur-md'>
                            {[
                                { id: 'all', label: 'All Tasks' },
                                { id: 'invites', label: 'Invites' },
                                { id: 'boosts', label: 'Server Boosts' },
                                { id: 'messages', label: 'Chat Activity' },
                            ].map(tab => {
                                const isActive = activeTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        type='button'
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`relative z-10 w-fit h-8 rounded-full px-4 py-1 text-xs font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                            isActive ? 'text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                    >
                                        {isActive && (
                                            <motion.span
                                                layoutId='earnFilterSwitch'
                                                className='absolute top-0 left-0 h-8 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-500 bg-gradient-to-t from-blue-600 to-blue-500'
                                                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                                            />
                                        )}
                                        <span className='relative flex items-center gap-1.5'>
                                            {tab.label}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Join Official Discord Button */}
                        <a
                            href='https://discord.gg'
                            target='_blank'
                            rel='noreferrer'
                            className='bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 rounded-xl shadow-lg shadow-blue-800 text-white font-bold text-xs px-4 py-2 inline-flex items-center gap-2 transition cursor-pointer active:scale-95'
                        >
                            <span>Join Official Discord</span>
                            <ArrowRightIcon className='w-3.5 h-3.5' />
                        </a>
                    </div>

                    {/* TASK CARDS GRID */}
                    <div className='relative'>
                        {!discordId && (
                            <div className='absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md rounded-2xl border border-white/[0.06] text-center font-sans'>
                                <div className='w-12 h-12 rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center text-[#5865F2] mb-3 shadow-lg'>
                                    <UserGroupIcon className='w-6 h-6' />
                                </div>
                                <h3 className='text-lg font-bold text-white tracking-tight mb-1'>
                                    Discord Connection Required
                                </h3>
                                <p className='text-xs text-gray-400 max-w-md leading-relaxed mb-4 font-sans'>
                                    Link your Discord account to verify server invites, boost status, and chat activity rewards!
                                </p>
                                <button
                                    onClick={() => setConnectModalOpen(true)}
                                    className='bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 rounded-xl shadow-lg shadow-blue-800 text-white font-bold text-xs px-5 py-2.5 inline-flex items-center gap-2 transition cursor-pointer active:scale-95'
                                >
                                    <LinkIcon className='w-4 h-4' /> Connect Discord Account Now
                                </button>
                            </div>
                        )}

                        <div className={!discordId ? 'filter blur-[4px] select-none pointer-events-none opacity-40 transition-all duration-300' : ''}>
                            {loading ? (
                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'>
                                    {[1, 2, 3, 4, 5, 6].map(i => (
                                        <div key={i} className='h-52 rounded-2xl bg-white/[0.02] border border-white/[0.05] animate-pulse' />
                                    ))}
                                </div>
                            ) : (
                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 font-sans mb-8'>
                                    {filteredTasks.map(task => {
                                        const isClaimed = task.is_claimed
                                        const isClaiming = claimingKey === task.key
                                        const current = isClaimed ? task.target_count : (task.current_count ?? 0)
                                        const target = task.target_count
                                        const pct = Math.min(100, Math.round((current / target) * 100))

                                        let icon = <UserGroupIcon className='w-8 h-8 text-gray-500 mb-3' />
                                        if (task.category === 'boosts') {
                                            icon = <DiscordBoostIcon className='w-8 h-8 text-gray-500 mb-3' />
                                        } else if (task.category === 'messages') {
                                            icon = <ChatBubbleLeftRightIcon className='w-8 h-8 text-gray-500 mb-3' />
                                        }

                                        return (
                                            <div
                                                key={task.key}
                                                className='bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-200 flex flex-col justify-between text-left relative group'
                                            >
                                                <div>
                                                    {/* Header row with Icon & Top-Right Badge */}
                                                    <div className='flex items-start justify-between gap-3'>
                                                        <div>{icon}</div>
                                                        <span className='bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[10px] px-2.5 py-1 font-semibold font-mono shrink-0 inline-flex items-center gap-1'>
                                                            <BoltSvgIcon className='w-3 h-3 text-amber-400' /> {task.reward_bolts.toLocaleString()}
                                                        </span>
                                                    </div>

                                                    {/* Title & Description */}
                                                    <h3 className='text-base font-semibold text-white tracking-tight'>
                                                        {task.title}
                                                    </h3>
                                                    <p className='text-xs text-gray-500 mt-0.5 mb-4 font-normal leading-relaxed'>
                                                        {task.requirement_text}
                                                    </p>

                                                    {/* Progress Label & Bar */}
                                                    <div className='space-y-1 mb-5'>
                                                        <div className='flex justify-between text-[10px] text-gray-500 font-sans'>
                                                            <span>Progress</span>
                                                            <span className='text-gray-400 font-mono'>
                                                                {current.toLocaleString()} / {target.toLocaleString()} ({pct}%)
                                                            </span>
                                                        </div>
                                                        <div className='w-full h-1 rounded-full bg-white/[0.06] overflow-hidden'>
                                                            <div
                                                                style={{ width: `${pct}%` }}
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    isClaimed || pct >= 100
                                                                        ? 'bg-emerald-400'
                                                                        : pct > 0
                                                                        ? 'bg-amber-400'
                                                                        : ''
                                                                }`}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Action Element at Bottom — NO heavy button background */}
                                                <div>
                                                    {isClaimed ? (
                                                        <div className='text-emerald-400 text-xs flex items-center gap-1.5 font-semibold py-1'>
                                                            <CheckCircleIcon className='w-4 h-4 text-emerald-400' />
                                                            <span>✓ Reward claimed · {task.reward_bolts.toLocaleString()} BOLTs</span>
                                                        </div>
                                                    ) : task.is_eligible ? (
                                                        <button
                                                            type='button'
                                                            onClick={() => handleClaim(task)}
                                                            disabled={isClaiming}
                                                            className='text-blue-400 hover:text-blue-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer py-1 transition-colors'
                                                        >
                                                            <SparklesIcon className='w-4 h-4 text-amber-300 animate-pulse' />
                                                            <span>{isClaiming ? 'Verifying requirement...' : `Verify & Claim +${task.reward_bolts.toLocaleString()} BOLTs`}</span>
                                                        </button>
                                                    ) : (
                                                        <div className='text-gray-500 text-xs flex items-center gap-1.5 py-1'>
                                                            <span>→ In progress · {current.toLocaleString()}/{target.toLocaleString()}</span>
                                                        </div>
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

                {/* Connect Discord Modal */}
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
