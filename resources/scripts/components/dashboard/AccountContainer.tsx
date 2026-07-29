import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStoreState, useStoreActions } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import http from '@/api/http'
import { getInitials } from '@/util/helpers'
import { Avatar } from '@mantine/core'
import { BorderBeam } from '@/components/ui/BorderBeam'
import ConnectDiscordModal from '@/components/dashboard/ConnectDiscordModal'
import {
    UserIcon,
    EnvelopeIcon,
    ShieldCheckIcon,
    LockClosedIcon,
    SparklesIcon,
    TrashIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    LinkIcon,
} from '@heroicons/react/24/outline'

interface AccountDetails {
    name: string
    email: string
    credits: number
    created_at: string | null
    primary_auth_provider: 'email' | 'google' | 'discord'
    discord_id: string | null
    discord_username: string | null
    google_id: string | null
    google_email: string | null
    has_password: boolean
}

export const AccountContainer: React.FC = () => {
    const user = useStoreState(state => state.user.data)
    const isDark = useStoreState(state => state.settings.data?.theme !== 'light')
    const updateUserData = useStoreActions(actions => actions.user.setUserData)

    const [account, setAccount] = useState<AccountDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [unlinking, setUnlinking] = useState<string | null>(null)
    const [discordModalOpen, setDiscordModalOpen] = useState(false)

    // Form fields for updating name/email
    const [nameInput, setNameInput] = useState('')
    const [emailInput, setEmailInput] = useState('')
    const [savingProfile, setSavingProfile] = useState(false)

    const fetchAccountData = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/client/account')
            if (res.data?.data) {
                const data: AccountDetails = res.data.data
                setAccount(data)
                setNameInput(data.name)
                setEmailInput(data.email)
            }
        } catch (err) {
            console.error('Failed to load account details:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAccountData()
    }, [])

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nameInput.trim() || !emailInput.trim() || savingProfile) return

        setSavingProfile(true)
        try {
            const res = await http.post('/api/client/account/profile', {
                name: nameInput.trim(),
                email: emailInput.trim(),
            })

            if (res.data?.success) {
                alert('Profile updated successfully!')
                fetchAccountData()
                if (user) {
                    updateUserData({
                        ...user,
                        name: nameInput.trim(),
                        email: emailInput.trim(),
                    })
                }
            }
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to update profile.')
        } finally {
            setSavingProfile(false)
        }
    }

    const handleUnlink = async (provider: 'discord' | 'google') => {
        if (account?.primary_auth_provider === provider) {
            alert(`You cannot unlink your primary registration method (${provider}).`)
            return
        }

        if (!confirm(`Are you sure you want to unlink your ${provider.toUpperCase()} account?`)) {
            return
        }

        setUnlinking(provider)
        try {
            const res = await http.post('/api/client/account/unlink', { provider })
            if (res.data?.success) {
                alert(res.data.message || `${provider.toUpperCase()} account unlinked.`)
                fetchAccountData()
            }
        } catch (err: any) {
            alert(err.response?.data?.message || `Failed to unlink ${provider}.`)
        } finally {
            setUnlinking(null)
        }
    }

    const primaryProvider = account?.primary_auth_provider || 'email'

    return (
        <PageContentBlock title='Account Management'>
            {/* Breadcrumb Navigation */}
            <div className='flex items-center space-x-2 text-xs font-semibold text-stone-400 font-sans mb-6'>
                <Link to='/' className='hover:text-stone-200 transition-colors'>
                    Dashboard
                </Link>
                <span>&gt;</span>
                <span className={isDark ? 'text-stone-100 font-bold' : 'text-slate-900 font-bold'}>
                    Account Management
                </span>
            </div>

            {loading || !account ? (
                <div className='space-y-6'>
                    <div className='h-48 rounded-2xl bg-neutral-900/50 border border-white/10 animate-pulse' />
                    <div className='h-64 rounded-2xl bg-neutral-900/50 border border-white/10 animate-pulse' />
                </div>
            ) : (
                <div className='space-y-8 font-sans'>
                    {/* Hero Profile Overview Card */}
                    <div className={`relative overflow-hidden rounded-3xl p-6 md:p-8 border backdrop-blur-xl transition-all shadow-2xl ${isDark ? 'bg-neutral-900/80 border-white/10 shadow-blue-950/20' : 'bg-white/80 border-slate-200 shadow-slate-200/50'}`}>
                        <BorderBeam size={280} duration={14} delay={0} colorFrom='#3b82f6' colorTo='#10b981' borderWidth={1.5} />

                        <div className='relative z-10 flex flex-col md:flex-row items-center md:items-start justify-between gap-6'>
                            <div className='flex flex-col md:flex-row items-center gap-5 text-center md:text-left'>
                                <Avatar color='blue' size='xl' radius='xl' className='font-bold shadow-xl ring-4 ring-blue-500/40 text-xl'>
                                    {getInitials(account.name, ' ', 2)}
                                </Avatar>
                                <div>
                                    <div className='flex flex-wrap items-center justify-center md:justify-start gap-2.5 mb-1'>
                                        <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {account.name}
                                        </h2>
                                        <span className='px-3 py-0.5 rounded-full text-xs font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1 uppercase tracking-wider'>
                                            <ShieldCheckIcon className='w-3.5 h-3.5' /> Primary: {primaryProvider}
                                        </span>
                                    </div>
                                    <p className={`text-xs md:text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                        {account.email}
                                    </p>
                                    <p className='text-[11px] text-slate-400 mt-1 font-mono'>
                                        Member since: {account.created_at ? new Date(account.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recently Joined'}
                                    </p>
                                </div>
                            </div>

                            {/* Credit Badge */}
                            <div className={`rounded-2xl p-4 border flex flex-col items-center md:items-end justify-center ${isDark ? 'bg-neutral-950/70 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <span className='text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1'>
                                    Account Balance
                                </span>
                                <div className='flex items-baseline gap-1.5'>
                                    <span className={`text-3xl font-mono font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {account.credits.toFixed(2)}
                                    </span>
                                    <span className='text-xs font-bold text-amber-400'>BOLTs</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Profile Details Form */}
                    <div className={`rounded-3xl p-6 md:p-8 border backdrop-blur-xl shadow-xl transition-all ${isDark ? 'bg-neutral-900/70 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                        <div className='flex items-center gap-3 mb-6 pb-4 border-b border-white/10'>
                            <div className='w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0'>
                                <UserIcon className='w-5 h-5' />
                            </div>
                            <div>
                                <h3 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Personal Details
                                </h3>
                                <p className='text-xs text-slate-400'>Update your display name and email address</p>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateProfile} className='space-y-5 max-w-2xl'>
                            <div>
                                <label className='block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2'>
                                    Display Name
                                </label>
                                <div className='relative'>
                                    <input
                                        type='text'
                                        value={nameInput}
                                        onChange={e => setNameInput(e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition-all outline-none ${isDark ? 'bg-neutral-950/80 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'}`}
                                        placeholder='Your full name'
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className='block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2'>
                                    Email Address
                                </label>
                                <div className='relative'>
                                    <input
                                        type='email'
                                        value={emailInput}
                                        onChange={e => setEmailInput(e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition-all outline-none ${isDark ? 'bg-neutral-950/80 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'}`}
                                        placeholder='your.email@domain.com'
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type='submit'
                                disabled={savingProfile}
                                className='px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50'
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${savingProfile ? 'animate-spin' : ''}`} />
                                {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
                            </button>
                        </form>
                    </div>

                    {/* Linked Authentication Methods Section */}
                    <div className={`rounded-3xl p-6 md:p-8 border backdrop-blur-xl shadow-xl transition-all ${isDark ? 'bg-neutral-900/70 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                        <div className='flex items-center gap-3 mb-6 pb-4 border-b border-white/10'>
                            <div className='w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0'>
                                <LockClosedIcon className='w-5 h-5' />
                            </div>
                            <div>
                                <h3 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Authentication & Linked Accounts
                                </h3>
                                <p className='text-xs text-slate-400'>
                                    Manage your login credentials and connected social accounts. Your original registration method cannot be unlinked.
                                </p>
                            </div>
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                            {/* Email & Password Authentication */}
                            <div className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div>
                                    <div className='flex items-center justify-between gap-2 mb-3'>
                                        <div className='flex items-center gap-2'>
                                            <EnvelopeIcon className='w-5 h-5 text-blue-400' />
                                            <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                Email & Password
                                            </span>
                                        </div>
                                        {primaryProvider === 'email' && (
                                            <span className='px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30'>
                                                Original
                                            </span>
                                        )}
                                    </div>
                                    <p className='text-xs text-slate-400 leading-relaxed mb-4'>
                                        Standard email credentials: <span className='font-semibold text-stone-200'>{account.email}</span>
                                    </p>
                                </div>

                                <div>
                                    {primaryProvider === 'email' ? (
                                        <button disabled className='w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed flex items-center justify-center gap-1.5'>
                                            <LockClosedIcon className='w-3.5 h-3.5' /> Primary Method (Locked)
                                        </button>
                                    ) : (
                                        <span className='w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1.5'>
                                            <CheckCircleIcon className='w-3.5 h-3.5' /> Active Credentials
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Google OAuth Linked Account */}
                            <div className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div>
                                    <div className='flex items-center justify-between gap-2 mb-3'>
                                        <div className='flex items-center gap-2'>
                                            <svg className='w-5 h-5' viewBox='0 0 24 24'>
                                                <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' />
                                                <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' />
                                                <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z' />
                                                <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z' />
                                            </svg>
                                            <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                Google Account
                                            </span>
                                        </div>
                                        {primaryProvider === 'google' && (
                                            <span className='px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30'>
                                                Original
                                            </span>
                                        )}
                                    </div>

                                    <p className='text-xs text-slate-400 leading-relaxed mb-4'>
                                        {account.google_id
                                            ? `Linked Google: ${account.google_email || account.google_id}`
                                            : 'Not linked to a Google account'}
                                    </p>
                                </div>

                                <div>
                                    {primaryProvider === 'google' ? (
                                        <button disabled className='w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed flex items-center justify-center gap-1.5'>
                                            <LockClosedIcon className='w-3.5 h-3.5' /> Primary Method (Locked)
                                        </button>
                                    ) : account.google_id ? (
                                        <button
                                            onClick={() => handleUnlink('google')}
                                            disabled={unlinking === 'google'}
                                            className='w-full py-2.5 rounded-xl font-bold text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <TrashIcon className='w-3.5 h-3.5' />
                                            {unlinking === 'google' ? 'Unlinking...' : 'Unlink Google Account'}
                                        </button>
                                    ) : (
                                        <a
                                            href='/auth/login/google'
                                            className='w-full py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <LinkIcon className='w-3.5 h-3.5' /> Link Google Account
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Discord OAuth Linked Account */}
                            <div className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div>
                                    <div className='flex items-center justify-between gap-2 mb-3'>
                                        <div className='flex items-center gap-2'>
                                            <div className='w-5 h-5 rounded-md bg-[#5865F2]/20 flex items-center justify-center text-[#5865F2] font-bold text-xs'>
                                                D
                                            </div>
                                            <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                Discord Account
                                            </span>
                                        </div>
                                        {primaryProvider === 'discord' && (
                                            <span className='px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30'>
                                                Original
                                            </span>
                                        )}
                                    </div>

                                    <p className='text-xs text-slate-400 leading-relaxed mb-4'>
                                        {account.discord_id
                                            ? `Linked: @${account.discord_username || account.discord_id} (${account.discord_id})`
                                            : 'Not linked to a Discord account'}
                                    </p>
                                </div>

                                <div>
                                    {primaryProvider === 'discord' ? (
                                        <button disabled className='w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed flex items-center justify-center gap-1.5'>
                                            <LockClosedIcon className='w-3.5 h-3.5' /> Primary Method (Locked)
                                        </button>
                                    ) : account.discord_id ? (
                                        <button
                                            onClick={() => handleUnlink('discord')}
                                            disabled={unlinking === 'discord'}
                                            className='w-full py-2.5 rounded-xl font-bold text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <TrashIcon className='w-3.5 h-3.5' />
                                            {unlinking === 'discord' ? 'Unlinking...' : 'Unlink Discord Account'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setDiscordModalOpen(true)}
                                            className='w-full py-2.5 rounded-xl font-bold text-xs bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <LinkIcon className='w-3.5 h-3.5' /> Link Discord Account
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Connect Discord Modal for linking from Account Page */}
            <ConnectDiscordModal
                opened={discordModalOpen}
                onClose={() => setDiscordModalOpen(false)}
                currentDiscordId={account?.discord_id || null}
                onSuccess={(newId, newUsername) => {
                    setDiscordModalOpen(false)
                    fetchAccountData()
                }}
            />
        </PageContentBlock>
    )
}

export default AccountContainer
