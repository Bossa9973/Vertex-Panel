import React, { useEffect, useState } from 'react'
import DiscordSvgIcon from '@/components/elements/DiscordSvgIcon'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStoreState, useStoreActions } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'
import http from '@/api/http'
import { getInitials } from '@/util/helpers'
import { Avatar } from '@mantine/core'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import { BorderBeam } from '@/components/ui/BorderBeam'
import {
    UserIcon,
    EnvelopeIcon,
    ShieldCheckIcon,
    LockClosedIcon,
    TrashIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    LinkIcon,
    GiftIcon,
    TicketIcon,
} from '@heroicons/react/24/outline'

import { AwardBadge } from '@/components/ui/award-badge'

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
    const location = useLocation()
    const navigate = useNavigate()

    const [account, setAccount] = useState<AccountDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [unlinking, setUnlinking] = useState<string | null>(null)
    const [flashSuccess, setFlashSuccess] = useState<string | null>(null)
    const [flashError, setFlashError] = useState<string | null>(null)

    // Promo code redemption
    const [promoCode, setPromoCode] = useState('')
    const [promoRedeeming, setPromoRedeeming] = useState(false)
    const [promoResult, setPromoResult] = useState<{ ok: boolean; message: string; amount?: number; balance?: number } | null>(null)

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

    // Read success/error flash messages injected by PHP OAuth callbacks
    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const success = params.get('success')
        const error = params.get('error')
        if (success) {
            setFlashSuccess(success)
            // Refresh account data so the newly linked provider shows immediately
            fetchAccountData()
        }
        if (error) {
            setFlashError(error)
        }
        if (success || error) {
            // Remove query params from URL without adding a new history entry
            navigate('/account', { replace: true })
        }
    }, [location.search])

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

    const handleRedeemPromo = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!promoCode.trim() || promoRedeeming) return
        setPromoRedeeming(true)
        setPromoResult(null)
        try {
            const res = await http.post('/api/client/account/redeem', { code: promoCode.trim().toUpperCase() })
            if (res.data?.success) {
                setPromoResult({ ok: true, message: res.data.message, amount: res.data.amount, balance: res.data.new_balance })
                setPromoCode('')
                fetchAccountData() // refresh credit balance
            } else {
                setPromoResult({ ok: false, message: res.data?.message || 'Redemption failed.' })
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Redemption failed. Please try again.'
            setPromoResult({ ok: false, message: msg })
        } finally {
            setPromoRedeeming(false)
        }
    }

    return (
        <PageMaintenanceGuard pageKey='account'>
        <PageContentBlock title='Account Management'>
            {/* OAuth callback flash banners */}
            {flashSuccess && (
                <div
                    className='flex items-start gap-3 mb-5 rounded-xl px-5 py-4 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-medium font-sans shadow'
                    role='alert'
                >
                    <CheckCircleIcon className='w-5 h-5 flex-shrink-0 mt-0.5' />
                    <span className='flex-1'>{flashSuccess}</span>
                    <button onClick={() => setFlashSuccess(null)} className='ml-auto text-emerald-400 hover:text-emerald-200 text-xs opacity-70 hover:opacity-100'>✕</button>
                </div>
            )}
            {flashError && (
                <div
                    className='flex items-start gap-3 mb-5 rounded-xl px-5 py-4 bg-red-500/15 border border-red-500/40 text-red-300 text-sm font-medium font-sans shadow'
                    role='alert'
                >
                    <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 flex-shrink-0 mt-0.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12' y2='16'/></svg>
                    <span className='flex-1'>{flashError}</span>
                    <button onClick={() => setFlashError(null)} className='ml-auto text-red-400 hover:text-red-200 text-xs opacity-70 hover:opacity-100'>✕</button>
                </div>
            )}
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
                <div className='space-y-6 font-sans'>
                    <div className='h-44 rounded-2xl bg-neutral-900/50 border border-white/10 animate-pulse' />
                    <div className='h-64 rounded-2xl bg-neutral-900/50 border border-white/10 animate-pulse' />
                </div>
            ) : (
                <div className='space-y-8 font-sans'>
                    {/* Header Profile Overview Banner */}
                    <div className={`relative overflow-hidden rounded-2xl p-6 md:p-8 border backdrop-blur-xl transition-all shadow-xl ${isDark ? 'bg-neutral-900/70 border-white/10' : 'bg-white/80 border-slate-200 shadow-slate-200/50'}`}>
                        <BorderBeam size={260} duration={14} delay={0} colorFrom='#3b82f6' colorTo='#f59e0b' borderWidth={1.5} />

                        <div className='relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6'>
                            <div className='flex flex-col md:flex-row items-center gap-5 text-center md:text-left'>
                                <Avatar color='blue' size='xl' radius='xl' className='font-bold shadow-lg ring-2 ring-blue-500/40 text-xl'>
                                    {getInitials(account.name, ' ', 2)}
                                </Avatar>
                                <div>
                                    <div className='flex flex-wrap items-center justify-center md:justify-start gap-2.5 mb-1.5'>
                                        <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {account.name}
                                        </h2>
                                        <span className='px-3 py-1 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/25 flex items-center gap-1.5 uppercase tracking-wider'>
                                            <ShieldCheckIcon className='w-3.5 h-3.5' /> Registered via {primaryProvider}
                                        </span>
                                    </div>
                                    <p className={`text-xs md:text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                        {account.email}
                                    </p>
                                    <p className='text-xs text-slate-400 mt-1 font-mono'>
                                        Member since {account.created_at ? new Date(account.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recently Joined'}
                                    </p>
                                </div>
                            </div>

                            {/* Middle Award Badge for Admin Accounts */}
                            {(account.rootAdmin || user?.rootAdmin) && (
                                <div className='flex items-center justify-center my-2 lg:my-0 shrink-0'>
                                    <AwardBadge titleText='Certified Vertex Staff Member' subTitleText='VERTEX CLOUD' />
                                </div>
                            )}

                            {/* Credit Readout Badge */}
                            <div className={`rounded-xl p-4 border flex flex-col items-center md:items-end justify-center shrink-0 ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <span className='text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1'>
                                    <BoltSvgIcon className='w-3.5 h-3.5 text-amber-400' /> Account Balance
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

                    {/* Profile Information Settings */}
                    <div className={`rounded-2xl p-6 md:p-8 border backdrop-blur-xl shadow-lg transition-all ${isDark ? 'bg-neutral-900/70 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                        <div className='flex items-center gap-3 mb-6 pb-4 border-b border-slate-200/50 dark:border-white/10'>
                            <div className='w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 shrink-0'>
                                <UserIcon className='w-5 h-5' />
                            </div>
                            <div>
                                <h3 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Personal Details
                                </h3>
                                <p className='text-xs text-slate-400'>Update your display name and contact email address</p>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateProfile} className='space-y-5 max-w-xl'>
                            <div>
                                <label className='block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2'>
                                    Display Name
                                </label>
                                <input
                                    type='text'
                                    value={nameInput}
                                    onChange={e => setNameInput(e.target.value)}
                                    className={`w-full px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all outline-none ${isDark ? 'bg-neutral-950/80 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'}`}
                                    placeholder='Your full name'
                                    required
                                />
                            </div>

                            <div>
                                <label className='block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2'>
                                    Email Address
                                </label>
                                <input
                                    type='email'
                                    value={emailInput}
                                    onChange={e => setEmailInput(e.target.value)}
                                    className={`w-full px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all outline-none ${isDark ? 'bg-neutral-950/80 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'}`}
                                    placeholder='your.email@domain.com'
                                    required
                                />
                            </div>

                            <button
                                type='submit'
                                disabled={savingProfile}
                                className='px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50'
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${savingProfile ? 'animate-spin' : ''}`} />
                                {savingProfile ? 'Saving...' : 'Save Profile Details'}
                            </button>
                        </form>
                    </div>

                    {/* Linked Authentication Methods Section */}
                    <div className={`rounded-2xl p-6 md:p-8 border backdrop-blur-xl shadow-lg transition-all ${isDark ? 'bg-neutral-900/70 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                        <div className='flex items-center gap-3 mb-6 pb-4 border-b border-slate-200/50 dark:border-white/10'>
                            <div className='w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0'>
                                <LockClosedIcon className='w-5 h-5' />
                            </div>
                            <div>
                                <h3 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Authentication Methods & Connections
                                </h3>
                                <p className='text-xs text-slate-400'>
                                    Manage linked sign-in methods. Your primary registration provider cannot be removed.
                                </p>
                            </div>
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                            {/* Email & Password Authentication */}
                            <div className={`rounded-xl p-5 border transition-all flex flex-col justify-between ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div>
                                    <div className='flex items-center justify-between gap-2 mb-3'>
                                        <div className='flex items-center gap-2'>
                                            <EnvelopeIcon className='w-5 h-5 text-blue-400' />
                                            <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
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
                                        Login credentials: <span className='font-semibold text-stone-200'>{account.email}</span>
                                    </p>
                                </div>

                                <div>
                                    {primaryProvider === 'email' ? (
                                        <button disabled className='w-full py-2 rounded-xl font-bold text-xs bg-neutral-900 text-slate-400 border border-white/5 cursor-not-allowed flex items-center justify-center gap-1.5'>
                                            <LockClosedIcon className='w-3.5 h-3.5' /> Primary Method (Locked)
                                        </button>
                                    ) : (
                                        <span className='w-full py-2 rounded-xl font-bold text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center gap-1.5'>
                                            <CheckCircleIcon className='w-3.5 h-3.5' /> Active Credentials
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Google OAuth Account */}
                            <div className={`rounded-xl p-5 border transition-all flex flex-col justify-between ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div>
                                    <div className='flex items-center justify-between gap-2 mb-3'>
                                        <div className='flex items-center gap-2'>
                                            <svg className='w-5 h-5' viewBox='0 0 24 24'>
                                                <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' />
                                                <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' />
                                                <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z' />
                                                <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z' />
                                            </svg>
                                            <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
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
                                        <button disabled className='w-full py-2 rounded-xl font-bold text-xs bg-neutral-900 text-slate-400 border border-white/5 cursor-not-allowed flex items-center justify-center gap-1.5'>
                                            <LockClosedIcon className='w-3.5 h-3.5' /> Primary Method (Locked)
                                        </button>
                                    ) : account.google_id ? (
                                        <button
                                            onClick={() => handleUnlink('google')}
                                            disabled={unlinking === 'google'}
                                            className='w-full py-2 rounded-xl font-bold text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <TrashIcon className='w-3.5 h-3.5' />
                                            {unlinking === 'google' ? 'Unlinking...' : 'Unlink Google Account'}
                                        </button>
                                    ) : (
                                        <a
                                            href='/auth/social/google/redirect'
                                            className='w-full py-2 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <LinkIcon className='w-3.5 h-3.5' /> Link Google Account
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Discord OAuth Account */}
                            <div className={`rounded-xl p-5 border transition-all flex flex-col justify-between ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div>
                                    <div className='flex items-center justify-between gap-2 mb-3'>
                                        <div className='flex items-center gap-2'>
                                            <DiscordSvgIcon className='w-5 h-5 fill-[#5865F2]' />
                                            <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
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
                                            ? `Linked Discord: @${account.discord_username || account.discord_id}`
                                            : 'Not linked to a Discord account'}
                                    </p>
                                </div>

                                <div>
                                    {primaryProvider === 'discord' ? (
                                        <button disabled className='w-full py-2 rounded-xl font-bold text-xs bg-neutral-900 text-slate-400 border border-white/5 cursor-not-allowed flex items-center justify-center gap-1.5'>
                                            <LockClosedIcon className='w-3.5 h-3.5' /> Primary Method (Locked)
                                        </button>
                                    ) : account.discord_id ? (
                                        <button
                                            onClick={() => handleUnlink('discord')}
                                            disabled={unlinking === 'discord'}
                                            className='w-full py-2 rounded-xl font-bold text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <TrashIcon className='w-3.5 h-3.5' />
                                            {unlinking === 'discord' ? 'Unlinking...' : 'Unlink Discord Account'}
                                        </button>
                                    ) : (
                                        <a
                                            href='/auth/social/discord/redirect'
                                            className='w-full py-2 rounded-xl font-bold text-xs bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95'
                                        >
                                            <LinkIcon className='w-3.5 h-3.5' /> Link Discord Account
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Promo Code Redemption ───────────────────────────────────── */}
            {!loading && account && (
                <div className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl ${isDark ? 'bg-neutral-900/70 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                    <div className='p-6 md:p-8'>
                        <div className='flex items-center gap-3 mb-6'>
                            <div className='p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25'>
                                <GiftIcon className='w-5 h-5 text-amber-400' />
                            </div>
                            <div>
                                <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Redeem Promo Code</h3>
                                <p className='text-xs text-slate-400 mt-0.5'>Enter a code issued by an admin via Discord to add credits</p>
                            </div>
                        </div>

                        {!account.discord_id ? (
                            /* ── No Discord linked ── */
                            <div className={`rounded-xl p-5 border flex flex-col sm:flex-row items-start sm:items-center gap-4 ${isDark ? 'bg-neutral-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div className='flex items-center gap-3 flex-1'>
                                    <div className='w-10 h-10 rounded-full bg-[#5865F2]/15 border border-[#5865F2]/30 flex items-center justify-center flex-shrink-0'>
                                        <DiscordSvgIcon className='w-5 h-5 fill-[#5865F2]' />
                                    </div>
                                    <div>
                                        <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Discord Required</p>
                                        <p className='text-xs text-slate-400 mt-0.5'>Promo codes are tied to your Discord account. Link Discord to unlock redemption.</p>
                                    </div>
                                </div>
                                <a
                                    href='/auth/social/discord/redirect'
                                    className='flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-[#5865F2] hover:bg-[#4752C4] text-white transition active:scale-95'
                                >
                                    <LinkIcon className='w-3.5 h-3.5' /> Link Discord
                                </a>
                            </div>
                        ) : (
                            /* ── Discord linked — show redeem form ── */
                            <div className='space-y-4'>
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${isDark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                    <CheckCircleIcon className='w-4 h-4 flex-shrink-0' />
                                    <span>Linked as <strong>@{account.discord_username || account.discord_id}</strong> — eligible for code redemption</span>
                                </div>

                                <form onSubmit={handleRedeemPromo} className='flex gap-3'>
                                    <div className='flex-1 relative'>
                                        <TicketIcon className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-stone-500' : 'text-slate-400'}`} />
                                        <input
                                            type='text'
                                            value={promoCode}
                                            onChange={e => setPromoCode(e.target.value.toUpperCase())}
                                            placeholder='LMN-XXXX-XXXX'
                                            maxLength={16}
                                            className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm font-mono font-bold tracking-widest transition outline-none focus:ring-2 focus:ring-amber-500/40 ${isDark ? 'bg-neutral-950/60 border-white/10 text-white placeholder-stone-600' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}`}
                                        />
                                    </div>
                                    <button
                                        type='submit'
                                        disabled={promoRedeeming || !promoCode.trim()}
                                        className='flex-shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black transition active:scale-95 flex items-center gap-2'
                                    >
                                        {promoRedeeming ? (
                                            <ArrowPathIcon className='w-4 h-4 animate-spin' />
                                        ) : (
                                            <GiftIcon className='w-4 h-4' />
                                        )}
                                        {promoRedeeming ? 'Redeeming...' : 'Redeem'}
                                    </button>
                                </form>

                                {promoResult && (
                                    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium border ${
                                        promoResult.ok
                                            ? isDark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                            : isDark ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-800'
                                    }`}>
                                        {promoResult.ok ? (
                                            <CheckCircleIcon className='w-4 h-4 flex-shrink-0 mt-0.5' />
                                        ) : (
                                            <svg xmlns='http://www.w3.org/2000/svg' className='w-4 h-4 flex-shrink-0 mt-0.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12' y2='16.01'/></svg>
                                        )}
                                        <span className='flex-1'>
                                            {promoResult.message}
                                            {promoResult.ok && promoResult.amount && (
                                                <> &mdash; <strong>+{promoResult.amount} credits</strong> · Balance: <strong>{promoResult.balance} credits</strong></>
                                            )}
                                        </span>
                                        <button onClick={() => setPromoResult(null)} className='opacity-60 hover:opacity-100 text-xs ml-1'>✕</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

        </PageContentBlock>
        </PageMaintenanceGuard>
    )
}

export default AccountContainer
