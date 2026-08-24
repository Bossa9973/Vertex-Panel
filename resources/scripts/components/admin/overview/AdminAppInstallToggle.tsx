import React, { useEffect, useState } from 'react'
import { CubeTransparentIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import http from '@/api/http'

export const AdminAppInstallToggle: React.FC = () => {
    const [enabled, setEnabled] = useState<boolean>(true)
    const [loading, setLoading] = useState<boolean>(true)
    const [updating, setUpdating] = useState<boolean>(false)

    const fetchSetting = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/admin/settings/app-install')
            if (res.data?.data?.enabled !== undefined) {
                setEnabled(res.data.data.enabled)
            }
        } catch (err) {
            console.error('Failed to fetch app install setting:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSetting()
    }, [])

    const handleToggle = async () => {
        const nextState = !enabled
        setUpdating(true)
        try {
            const res = await http.post('/api/admin/settings/app-install', {
                enabled: nextState,
            })
            if (res.data?.success && res.data?.data?.enabled !== undefined) {
                setEnabled(res.data.data.enabled)
            }
        } catch (err) {
            alert('Failed to update app installation setting.')
        } finally {
            setUpdating(false)
        }
    }

    return (
        <div className='col-span-12 bg-neutral-900/70 border border-white/10 rounded-2xl p-6 shadow-xl shadow-blue-950/20 backdrop-blur-xl hover:border-white/20 transition-all font-sans mb-2'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
                <div className='flex items-start gap-4'>
                    <div className='w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0 shadow-inner'>
                        <CubeTransparentIcon className='w-6 h-6' />
                    </div>
                    <div>
                        <div className='flex items-center gap-3'>
                            <h3 className='text-lg font-bold text-white tracking-tight'>
                                1-Click App Auto-Installation
                            </h3>
                            {!loading && (
                                enabled ? (
                                    <span className='px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 backdrop-blur-md'>
                                        <CheckCircleIcon className='w-4 h-4' /> Enabled & Available
                                    </span>
                                ) : (
                                    <span className='px-3 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 backdrop-blur-md'>
                                        <XCircleIcon className='w-4 h-4' /> Disabled & Hidden
                                    </span>
                                )
                            )}
                        </div>
                        <p className='text-xs text-gray-400 mt-1 max-w-xl leading-relaxed'>
                            Control whether users can select 1-Click App Installers (such as Pterodactyl Panel + Wings) during VPS deployment in the dashboard and on the dedicated installer page.
                        </p>
                    </div>
                </div>

                <div className='flex items-center gap-3 shrink-0'>
                    <button
                        onClick={handleToggle}
                        disabled={loading || updating}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50 ${
                            enabled
                                ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/40 shadow-rose-950/20'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 shadow-emerald-600/30'
                        }`}
                    >
                        {updating
                            ? 'Updating...'
                            : enabled
                            ? 'Disable App Installation'
                            : 'Enable App Installation'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AdminAppInstallToggle
