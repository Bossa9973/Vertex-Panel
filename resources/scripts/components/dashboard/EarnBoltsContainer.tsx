import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStoreState, useStoreActions } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import http from '@/api/http'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import { BorderBeam } from '@/components/ui/BorderBeam'
import ConnectDiscordModal from '@/components/dashboard/ConnectDiscordModal'
import {
    UserGroupIcon,
    SparklesIcon,
    ChatBubbleLeftRightIcon,
    CheckCircleIcon,
    ArrowRightIcon,
    ShieldCheckIcon,
    LinkIcon,
    LockClosedIcon,
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
}

export const EarnBoltsContainer: React.FC = () => {
    const user = useStoreState(state => state.user.data)
    const isDark = useStoreState(state => state.settings.data?.theme !== 'light')
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)

    const [tasks, setTasks] = useState<EarnTask[]>([])
    const [loading, setLoading] = useState(true)
    const [discordId, setDiscordId] = useState<string | null>(user?.discord_id || null)
    const [discordUsername, setDiscordUsername] = useState<string | null>(user?.discord_username || null)
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
                } else {
                    // Automatically open liquid glass modal if discord is not linked
                    setConnectModalOpen(true)
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
    const isUnconnected = !discordId

    return (
        <PageContentBlock title='Earn Free BOLTs'>
            <div className={`relative transition-all duration-500 ${isUnconnected ? 'filter blur-[5px] select-none pointer-events-none opacity-40' : ''}`}>
                {/* Breadcrumb Navigation */}
                <div className='flex items-center space-x-2 text-xs font-semibold text-stone-400 font-sans mb-6'>
                    <Link to='/' className='hover:text-stone-200 transition-colors'>
                        Dashboard
                    </Link>
                    <span>&gt;</span>
                    <span className={isDark ? 'text-stone-100 font-bold' : 'text-slate-900 font-bold'}>
                        Earn BOLTs
                    </span>
                </div>

                {/* Top Hero Banner */}
                <div className={`relative overflow-hidden rounded-2xl p-6 md:p-8 mb-8 border backdrop-blur-xl transition-all shadow-2xl ${isDark ? 'bg-neutral-900/80 border-white/10 shadow-blue-950/20' : 'bg-white/80 border-slate-200/80 shadow-slate-200/50'}`}>
                    <BorderBeam size={280} duration={14} delay={0} colorFrom='#5865F2' colorTo='#f59e0b' borderWidth={1.5} />

                    <div className='relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center'>
                        <div className='lg:col-span-2'>
                            <div className='flex flex-wrap items-center gap-2.5 mb-3'>
                                <span className='px-3 py-1 rounded-full text-xs font-bold bg-[#5865F2]/15 text-[#5865F2] border border-[#5865F2]/30 flex items-center gap-1.5'>
                                    <SparklesIcon className='w-4 h-4' /> Discord Community Rewards
                                </span>
                                <span className='px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 font-mono'>
                                    <BoltSvgIcon className='w-3.5 h-3.5' /> {totalAvailableBolts.toLocaleString()} BOLTs Available
                                </span>
                            </div>

                            <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight font-sans mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Earn Free BOLTs for Community Activity
                            </h2>
                            <p className={`text-xs md:text-sm leading-relaxed max-w-2xl font-sans ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                Complete Discord community challenges, invite new members, boost our server, and chat to earn free BOLTs added directly to your account balance!
                            </p>
                        </div>

                        {/* Right Stats Box */}
                        <div className={`rounded-xl p-4 border flex flex-col justify-between ${isDark ? 'bg-neutral-950/70 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                            <div className='flex items-center justify-between mb-2'>
                                <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
                                    Account Balance
                                </span>
                                <span className='text-xs font-bold text-emerald-400 flex items-center gap-1'>
                                    <ShieldCheckIcon className='w-3.5 h-3.5' /> Active
                                </span>
                            </div>
                            <div className='flex items-baseline gap-2 mb-3'>
                                <span className={`text-3xl font-mono font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {userCredits.toFixed(2)}
                                </span>
                                <span className='text-sm font-bold text-amber-400'>BOLTs</span>
                            </div>
                            <div className='flex items-center justify-between pt-3 border-t border-slate-200/40 dark:border-white/10 text-xs text-slate-400 font-sans'>
                                <span>Completed Tasks:</span>
                                <span className='font-bold text-white bg-blue-600/30 px-2 py-0.5 rounded-full border border-blue-500/40'>
                                    {claimedCount} / {tasks.length}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Discord Account Verifier Status Banner */}
                <div className={`rounded-2xl p-5 mb-8 border backdrop-blur-xl shadow-lg transition-all ${isDark ? 'bg-neutral-900/70 border-white/10' : 'bg-white/80 border-slate-200/80'}`}>
                    <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                        <div className='flex items-center gap-3.5'>
                            <div className='w-11 h-11 rounded-2xl bg-[#5865F2]/15 border border-[#5865F2]/30 flex items-center justify-center text-[#5865F2] shrink-0 shadow-[0_0_15px_rgba(88,101,242,0.2)]'>
                                <UserGroupIcon className='w-5 h-5' />
                            </div>
                            <div>
                                <div className='flex items-center gap-2'>
                                    <h4 className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        Discord Account Connection
                                    </h4>
                                    {discordId ? (
                                        <span className='px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1'>
                                            <CheckCircleIcon className='w-3.5 h-3.5' /> Connected
                                        </span>
                                    ) : (
                                        <span className='px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1'>
                                            <LockClosedIcon className='w-3.5 h-3.5' /> Locked
                                        </span>
                                    )}
                                </div>
                                <p className='text-xs text-slate-400 font-sans mt-0.5'>
                                    {discordId
                                        ? `Linked Discord: ${discordUsername || discordId} (${discordId})`
                                        : 'Link your Discord account to unlock Earn BOLTs challenges.'}
                                </p>
                            </div>
                        </div>

                        <div className='flex items-center gap-3'>
                            <button
                                onClick={() => setConnectModalOpen(true)}
                                className='px-5 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs shadow-lg shadow-[#5865F2]/25 transition-all cursor-pointer flex items-center gap-2 active:scale-95'
                            >
                                <LinkIcon className='w-4 h-4' />
                                {discordId ? 'Manage Discord Link' : 'Connect Discord Account'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className='flex flex-wrap items-center justify-between gap-4 mb-6'>
                    <div className='flex items-center space-x-2 bg-neutral-900/60 dark:bg-neutral-900/60 p-1.5 rounded-xl border border-white/10 backdrop-blur-md'>
                        {[
                            { id: 'all', label: 'All Tasks' },
                            { id: 'invites', label: 'Invites Rewards' },
                            { id: 'boosts', label: 'Server Boosts' },
                            { id: 'messages', label: 'Chat Activity' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    activeTab === tab.id
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-stone-400 hover:text-stone-200 bg-transparent'
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
                        className='flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs shadow-md transition-all cursor-pointer'
                    >
                        Join Official Discord <ArrowRightIcon className='w-3.5 h-3.5' />
                    </a>
                </div>

                {/* Tasks Grid */}
                {loading ? (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className='h-48 rounded-2xl bg-neutral-900/50 border border-white/10 animate-pulse' />
                        ))}
                    </div>
                ) : (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans mb-8'>
                        {filteredTasks.map(task => {
                            const isClaimed = task.is_claimed
                            const isClaiming = claimingKey === task.key

                            let icon = <UserGroupIcon className='w-5 h-5 text-blue-400' />
                            if (task.category === 'boosts') {
                                icon = <SparklesIcon className='w-5 h-5 text-purple-400' />
                            } else if (task.category === 'messages') {
                                icon = <ChatBubbleLeftRightIcon className='w-5 h-5 text-emerald-400' />
                            }

                            return (
                                <div
                                    key={task.key}
                                    className={`relative overflow-hidden rounded-2xl p-6 border backdrop-blur-xl transition-all flex flex-col justify-between group hover:scale-[1.01] ${
                                        isClaimed
                                            ? isDark
                                                ? 'bg-neutral-950/50 border-emerald-500/20 opacity-85'
                                                : 'bg-emerald-50/40 border-emerald-200'
                                            : isDark
                                            ? 'bg-neutral-900/70 border-white/10 hover:border-blue-500/40 shadow-xl'
                                            : 'bg-white/80 border-slate-200/80 hover:border-blue-400 shadow-xl'
                                    }`}
                                >
                                    <div>
                                        {/* Task Header */}
                                        <div className='flex items-center justify-between gap-3 mb-4'>
                                            <div className='w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0'>
                                                {icon}
                                            </div>
                                            <span className='flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-xs'>
                                                <BoltSvgIcon className='w-3.5 h-3.5' /> +{task.reward_bolts.toLocaleString()} BOLTs
                                            </span>
                                        </div>

                                        {/* Title & Requirements */}
                                        <h3 className={`text-lg font-bold tracking-tight mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {task.title}
                                        </h3>
                                        <p className={`text-xs leading-relaxed mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {task.requirement_text}
                                        </p>

                                        {/* Progress Indicator */}
                                        <div className='space-y-1.5 mb-6'>
                                            <div className='flex justify-between text-[11px] font-semibold text-slate-400'>
                                                <span>Requirement Target:</span>
                                                <span className='font-mono text-stone-200 font-bold'>
                                                    {isClaimed ? task.target_count : 0} / {task.target_count}
                                                </span>
                                            </div>
                                            <div className='w-full h-2 rounded-full bg-black/40 border border-white/5 overflow-hidden'>
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        isClaimed ? 'bg-emerald-500 w-full' : 'bg-blue-600 w-1/4'
                                                    }`}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <div>
                                        {isClaimed ? (
                                            <button
                                                disabled
                                                className='w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default'
                                            >
                                                <CheckCircleIcon className='w-4 h-4' /> Reward Claimed ({task.reward_bolts.toLocaleString()} BOLTs)
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleClaim(task)}
                                                disabled={isClaiming}
                                                className='w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 transition-all cursor-pointer active:scale-95 disabled:opacity-50'
                                            >
                                                {isClaiming ? 'Verifying...' : `Verify & Claim +${task.reward_bolts.toLocaleString()} BOLTs`}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Connect Discord Liquid Glass Pop-Up Modal */}
            <ConnectDiscordModal
                opened={connectModalOpen}
                isBlocked={isUnconnected}
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
    )
}

export default EarnBoltsContainer
