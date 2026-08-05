import React, { useEffect, useState } from 'react'
import { WrenchScrewdriverIcon, CheckCircleIcon, ExclamationTriangleIcon, ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Button, Switch, Textarea, TextInput } from '@mantine/core'
import http from '@/api/http'
import PageContentBlock from '@/components/elements/PageContentBlock'

export interface MaintenanceSettings {
    global: boolean
    dashboard: boolean
    servers: boolean
    earn: boolean
    billing: boolean
    account: boolean
    store: boolean
    tickets: boolean
    message: string
    estimated_downtime?: string | null
}

const DEFAULT_SETTINGS: MaintenanceSettings = {
    global: false,
    dashboard: false,
    servers: false,
    earn: false,
    billing: false,
    account: false,
    store: false,
    tickets: false,
    message: 'This section is currently undergoing scheduled maintenance. Please check back shortly.',
    estimated_downtime: null,
}

export const AdminMaintenanceContainer: React.FC = () => {
    const [settings, setSettings] = useState<MaintenanceSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState<boolean>(true)
    const [saving, setSaving] = useState<boolean>(false)
    const [savedNotice, setSavedNotice] = useState<boolean>(false)

    const fetchSettings = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/admin/settings/maintenance')
            if (res.data?.data) {
                setSettings({ ...DEFAULT_SETTINGS, ...res.data.data })
            }
        } catch (err) {
            console.error('Failed to fetch maintenance settings:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    const handleToggle = (key: keyof MaintenanceSettings, value: boolean) => {
        setSettings(prev => ({ ...prev, [key]: value }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await http.post('/api/admin/settings/maintenance', settings)
            if (res.data?.success && res.data?.data) {
                setSettings({ ...DEFAULT_SETTINGS, ...res.data.data })
                setSavedNotice(true)
                setTimeout(() => setSavedNotice(false), 3000)
            }
        } catch (err) {
            alert('Failed to save maintenance settings.')
        } finally {
            setSaving(false)
        }
    }

    const pagesList: { key: keyof MaintenanceSettings; label: string; desc: string; icon: string }[] = [
        { key: 'dashboard', label: 'Dashboard Overview', desc: 'Main user dashboard metrics, quick services, and server widgets', icon: '📊' },
        { key: 'servers', label: 'VPS Management & Servers', desc: 'Server list, VNC console, terminal, power controls, and detail pages', icon: '🖥️' },
        { key: 'earn', label: 'Earn Bolts / Referrals', desc: 'Earn bolts page, daily check-ins, and referral link generation', icon: '⚡' },
        { key: 'billing', label: 'Billing & Account Credits', desc: 'Deposit credits, balance management, and invoice history', icon: '💳' },
        { key: 'account', label: 'Account Profile & Security', desc: 'Password change, 2FA setup, and user account preferences', icon: '👤' },
        { key: 'store', label: 'VPS Store & Deployments', desc: 'New VPS instance creation and plan checkout pages', icon: '🛍️' },
        { key: 'tickets', label: 'Support & Help Desk', desc: 'Support ticket submission and customer service chats', icon: '🎫' },
    ]

    return (
        <PageContentBlock title='Page Maintenance Control'>
            <div className='max-w-6xl mx-auto space-y-6 font-sans pb-12'>
                {/* Header Banner */}
                <div className='bg-gradient-to-r from-amber-950/40 via-neutral-900 to-blue-950/40 border border-amber-500/20 rounded-2xl p-6 shadow-2xl backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-start gap-4'>
                        <div className='w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner'>
                            <WrenchScrewdriverIcon className='w-6 h-6 animate-pulse' />
                        </div>
                        <div>
                            <div className='flex items-center gap-3'>
                                <h2 className='text-xl font-bold text-white tracking-tight'>
                                    Page Maintenance Control Center
                                </h2>
                                {settings.global ? (
                                    <span className='px-3 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1.5 animate-pulse'>
                                        <ExclamationTriangleIcon className='w-4 h-4' /> Global Platform Maintenance ACTIVE
                                    </span>
                                ) : (
                                    <span className='px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5'>
                                        <ShieldCheckIcon className='w-4 h-4' /> Platform Online
                                    </span>
                                )}
                            </div>
                            <p className='text-xs text-gray-400 mt-1 leading-relaxed max-w-2xl'>
                                Toggle maintenance mode for individual pages or enable global site maintenance. Non-admin users visiting a locked page will see a sleek dark maintenance screen. Admins retain full access.
                            </p>
                        </div>
                    </div>

                    <div className='flex items-center gap-3 shrink-0'>
                        {savedNotice && (
                            <span className='text-emerald-400 text-xs font-bold flex items-center gap-1 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30'>
                                <CheckCircleIcon className='w-4 h-4' /> Saved Changes!
                            </span>
                        )}
                        <Button
                            className='bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 px-6 font-bold cursor-pointer'
                            loading={saving}
                            onClick={handleSave}
                        >
                            Save Maintenance Settings
                        </Button>
                    </div>
                </div>

                {/* Master Global Switch */}
                <div className={`p-6 rounded-2xl border transition-all ${settings.global ? 'bg-rose-950/30 border-rose-500/40' : 'bg-neutral-900/80 border-white/10'}`}>
                    <div className='flex items-center justify-between gap-4'>
                        <div className='flex items-center gap-3.5'>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${settings.global ? 'bg-rose-500/20 text-rose-400' : 'bg-neutral-800 text-gray-400'}`}>
                                🚨
                            </div>
                            <div>
                                <h4 className='text-base font-bold text-white flex items-center gap-2'>
                                    Global Site Maintenance
                                    <span className='text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30'>Master Switch</span>
                                </h4>
                                <p className='text-xs text-gray-400 mt-0.5'>
                                    Immediately locks all user pages across the platform under maintenance mode.
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.global}
                            onChange={e => handleToggle('global', e.currentTarget.checked)}
                            color='red'
                            size='md'
                            disabled={loading}
                        />
                    </div>
                </div>

                {/* Individual Page Maintenance Toggles */}
                <div className='grid md:grid-cols-2 gap-4'>
                    {pagesList.map(item => {
                        const isUnderMaintenance = settings.global || settings[item.key] === true
                        return (
                            <div
                                key={item.key}
                                className={`p-5 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                                    isUnderMaintenance
                                        ? 'bg-amber-950/25 border-amber-500/30 shadow-lg shadow-amber-950/20'
                                        : 'bg-neutral-900/60 border-white/10 hover:border-white/20'
                                }`}
                            >
                                <div className='flex items-start gap-3.5'>
                                    <span className='text-2xl shrink-0 p-1'>{item.icon}</span>
                                    <div>
                                        <div className='flex items-center gap-2'>
                                            <h5 className='text-sm font-bold text-white'>{item.label}</h5>
                                            {isUnderMaintenance && (
                                                <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30'>
                                                    {settings.global ? 'Global Locked' : 'Maintenance Active'}
                                                </span>
                                            )}
                                        </div>
                                        <p className='text-xs text-gray-400 mt-1 leading-relaxed'>{item.desc}</p>
                                    </div>
                                </div>

                                <Switch
                                    checked={settings[item.key] as boolean}
                                    onChange={e => handleToggle(item.key, e.currentTarget.checked)}
                                    disabled={loading || settings.global}
                                    color='yellow'
                                    size='md'
                                />
                            </div>
                        )
                    })}
                </div>

                {/* Maintenance Notice Message & Downtime */}
                <div className='bg-neutral-900/80 border border-white/10 rounded-2xl p-6 space-y-4'>
                    <div className='flex items-center gap-2 text-sm font-bold text-white'>
                        <SparklesIcon className='w-4 h-4 text-blue-400' />
                        <span>Custom Maintenance Message & Downtime</span>
                    </div>
                    <p className='text-xs text-gray-400'>
                        Customize the notice message and estimated downtime string shown to users when pages are under maintenance.
                    </p>
                    <div className='space-y-4'>
                        <div>
                            <label className='text-xs font-semibold text-gray-300 block mb-1'>Maintenance Notice Message</label>
                            <Textarea
                                value={settings.message || ''}
                                onChange={e => handleToggle('message', e.currentTarget.value as any)}
                                rows={3}
                                placeholder='Enter custom maintenance notice...'
                                className='font-sans text-xs'
                                styles={{
                                    input: {
                                        backgroundColor: '#0a0c10',
                                        borderColor: 'rgba(255, 255, 255, 0.15)',
                                        color: '#e5e7eb',
                                        borderRadius: '12px',
                                    },
                                }}
                            />
                        </div>

                        <div>
                            <label className='text-xs font-semibold text-gray-300 block mb-1'>Estimated Downtime (Optional)</label>
                            <TextInput
                                value={settings.estimated_downtime || ''}
                                onChange={e => handleToggle('estimated_downtime', e.currentTarget.value ? e.currentTarget.value : null as any)}
                                placeholder='e.g. ~15 minutes, Today at 18:00 UTC, or leave blank to hide'
                                className='font-sans text-xs'
                                styles={{
                                    input: {
                                        backgroundColor: '#0a0c10',
                                        borderColor: 'rgba(255, 255, 255, 0.15)',
                                        color: '#e5e7eb',
                                        borderRadius: '12px',
                                    },
                                }}
                            />
                            <p className='text-[11px] text-gray-500 mt-1'>
                                Displayed as "Estimated back online: &#123;value&#125;" on per-page maintenance mode. Leave blank to hide.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageContentBlock>
    )
}

export default AdminMaintenanceContainer
