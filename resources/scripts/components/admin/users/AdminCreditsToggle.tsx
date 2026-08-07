import React, { useEffect, useState } from 'react'
import { CurrencyDollarIcon, LockClosedIcon, CheckCircleIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import http from '@/api/http'

export const AdminCreditsToggle: React.FC = () => {
    const [topupEnabled, setTopupEnabled] = useState<boolean>(true)
    const [referralEnabled, setReferralEnabled] = useState<boolean>(true)
    const [loading, setLoading] = useState<boolean>(true)
    const [saving, setSaving] = useState<boolean>(false)

    const fetchSettings = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/admin/settings/credits')
            if (res.data?.data) {
                setTopupEnabled(res.data.data.topup_enabled ?? true)
                setReferralEnabled(res.data.data.referral_enabled ?? true)
            }
        } catch (err) {
            console.error('Failed to fetch credits settings:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    const handleToggle = async (type: 'topup' | 'referral', newValue: boolean) => {
        if (saving) return
        const newTopup = type === 'topup' ? newValue : topupEnabled
        const newReferral = type === 'referral' ? newValue : referralEnabled

        setSaving(true)
        try {
            const res = await http.post('/api/admin/settings/credits', {
                topup_enabled: newTopup,
                referral_enabled: newReferral,
            })
            if (res.data?.data) {
                setTopupEnabled(res.data.data.topup_enabled)
                setReferralEnabled(res.data.data.referral_enabled)
            }
        } catch (err) {
            alert('Failed to update credits settings.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className='bg-neutral-900/70 border border-white/10 rounded-2xl p-6 shadow-xl backdrop-blur-xl hover:border-white/20 transition-all font-sans mb-6 text-left'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-4'>
                <div className='flex items-start gap-4'>
                    <div className='w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner'>
                        <CurrencyDollarIcon className='w-6 h-6' />
                    </div>
                    <div>
                        <h3 className='text-lg font-bold text-white tracking-tight'>
                            /credits Page Controls &amp; Settings
                        </h3>
                        <p className='text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed'>
                            Enable or disable client Top-Up deposits and Referral code generation displayed on the client billing page (<code className='text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded'>/credits</code>).
                        </p>
                    </div>
                </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {/* Top Up Toggle Card */}
                <div className='p-4 bg-neutral-950/70 border border-white/10 rounded-xl flex items-center justify-between gap-4'>
                    <div className='flex items-center gap-3'>
                        <div className='w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0'>
                            <CurrencyDollarIcon className='w-5 h-5' />
                        </div>
                        <div>
                            <div className='flex items-center gap-2'>
                                <span className='font-bold text-sm text-white'>Top Up BOLTs Balance</span>
                                {topupEnabled ? (
                                    <span className='px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1'>
                                        <CheckCircleIcon className='w-3 h-3' /> Enabled
                                    </span>
                                ) : (
                                    <span className='px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1'>
                                        <LockClosedIcon className='w-3 h-3' /> Disabled
                                    </span>
                                )}
                            </div>
                            <p className='text-[11px] text-gray-400 mt-0.5'>
                                Allow client users to deposit and top up BOLTs on /credits.
                            </p>
                        </div>
                    </div>

                    <button
                        type='button'
                        disabled={loading || saving}
                        onClick={() => handleToggle('topup', !topupEnabled)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                            topupEnabled
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                    >
                        {topupEnabled ? 'Disable Top-Up' : 'Enable Top-Up'}
                    </button>
                </div>

                {/* Referral Toggle Card */}
                <div className='p-4 bg-neutral-950/70 border border-white/10 rounded-xl flex items-center justify-between gap-4'>
                    <div className='flex items-center gap-3'>
                        <div className='w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0'>
                            <UserPlusIcon className='w-5 h-5' />
                        </div>
                        <div>
                            <div className='flex items-center gap-2'>
                                <span className='font-bold text-sm text-white'>Client Referral Code</span>
                                {referralEnabled ? (
                                    <span className='px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1'>
                                        <CheckCircleIcon className='w-3 h-3' /> Enabled
                                    </span>
                                ) : (
                                    <span className='px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1'>
                                        <LockClosedIcon className='w-3 h-3' /> Disabled
                                    </span>
                                )}
                            </div>
                            <p className='text-[11px] text-gray-400 mt-0.5'>
                                Show client referral codes and link generation box on /credits.
                            </p>
                        </div>
                    </div>

                    <button
                        type='button'
                        disabled={loading || saving}
                        onClick={() => handleToggle('referral', !referralEnabled)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                            referralEnabled
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                    >
                        {referralEnabled ? 'Disable Referrals' : 'Enable Referrals'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AdminCreditsToggle
