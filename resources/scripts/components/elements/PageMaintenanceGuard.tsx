import React, { useEffect, useState } from 'react'
import { WrenchScrewdriverIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useStoreState } from 'easy-peasy'
import http from '@/api/http'

export type MaintenancePageKey = 'dashboard' | 'servers' | 'earn' | 'billing' | 'account' | 'store' | 'tickets'

interface MaintenanceStatus {
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
    downtimes?: Record<string, string>
}

interface Props {
    pageKey: MaintenancePageKey
    children: React.ReactNode
}

const STORAGE_KEY = 'vertex_page_maintenance_status_cache'

const getInitialCache = (): MaintenanceStatus | null => {
    try {
        const cached = localStorage.getItem(STORAGE_KEY)
        return cached ? JSON.parse(cached) : null
    } catch {
        return null
    }
}

export const PageMaintenanceGuard: React.FC<Props> = ({ pageKey, children }) => {
    const isRootAdmin = useStoreState((state: any) => state.user.data?.rootAdmin)
    const [status, setStatus] = useState<MaintenanceStatus | null>(getInitialCache)
    const [loading, setLoading] = useState<boolean>(!status)

    const checkStatus = async () => {
        try {
            const res = await http.get('/api/maintenance-status')
            if (res.data?.data) {
                const newStatus = res.data.data
                setStatus(newStatus)
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(newStatus))
                } catch {}
            }
        } catch (err) {
            console.error('Failed to fetch maintenance status:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        checkStatus()
    }, [pageKey])

    // Admins bypass maintenance mode to inspect and test pages
    if (isRootAdmin) {
        return <>{children}</>
    }

    const isGlobalMaintenance = status && status.global === true
    const isPageMaintenance = status && !status.global && status[pageKey] === true

    // 1. SITE-WIDE GLOBAL MAINTENANCE (Environmental 2-column layout)
    if (isGlobalMaintenance) {
        return (
            <div className='min-h-[calc(100vh-140px)] w-full flex items-center justify-center px-6 md:px-12 lg:px-20 font-sans relative z-10'>
                <div className='flex flex-col md:flex-row items-center justify-between w-full max-w-6xl mx-auto gap-8 py-12'>
                    {/* LEFT SIDE (60% width) */}
                    <div className='w-full md:w-[60%] flex flex-col justify-center text-left'>
                        <span className='text-xs font-mono text-blue-400 uppercase tracking-widest mb-3'>
                            503 — Service Unavailable
                        </span>
                        <h1 className='text-4xl font-semibold text-white leading-tight'>
                            We're performing scheduled maintenance.
                        </h1>
                        <p className='text-sm text-gray-400 mt-3 max-w-sm leading-relaxed'>
                            {status.message || "Vertex infrastructure is being updated. We'll be back shortly — no data will be affected."}
                        </p>

                        <div className='border-t border-white/[0.06] my-6 max-w-xs' />

                        <div className='flex items-center gap-3'>
                            <button
                                onClick={checkStatus}
                                disabled={loading}
                                className='bg-neutral-900 border border-neutral-800 text-gray-300 hover:text-white rounded-xl font-bold text-xs py-2.5 px-5 cursor-pointer transition inline-flex items-center justify-center gap-2 disabled:opacity-50'
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                <span>Refresh Page Status</span>
                            </button>
                            <a
                                href='/'
                                className='bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 shadow-lg shadow-blue-800 text-white font-bold text-xs rounded-xl py-2.5 px-5 cursor-pointer transition inline-flex items-center justify-center'
                            >
                                Return to Dashboard
                            </a>
                        </div>

                        <span className='text-xs text-gray-500 mt-3 font-mono'>
                            Expected downtime: {status.estimated_downtime || '~15 min'}
                        </span>
                    </div>

                    {/* RIGHT SIDE (40% width) */}
                    <div className='w-full md:w-[40%] flex items-center justify-center relative mt-10 md:mt-0 select-none pointer-events-none'>
                        <div className='w-64 h-64 rounded-full bg-blue-600/10 blur-3xl absolute -z-10' />
                        <WrenchScrewdriverIcon className='w-32 h-32 text-blue-500/20' />
                    </div>
                </div>
            </div>
        )
    }

    // 2. PER-PAGE MAINTENANCE (Scaled-back simple inline view)
    if (isPageMaintenance) {
        const estimatedDowntime = status.downtimes?.[pageKey] || status.estimated_downtime

        return (
            <div className='min-h-[60vh] w-full flex items-center justify-center p-6 font-sans relative z-10'>
                <div className='max-w-sm w-full mx-auto text-center'>
                    <WrenchScrewdriverIcon className='w-8 h-8 text-blue-400/60 mb-4 mx-auto' />
                    <h2 className='text-xl font-semibold text-white'>
                        This page is under maintenance
                    </h2>
                    <p className='text-sm text-gray-400 mt-1 leading-relaxed'>
                        Check back soon — we're making improvements.
                    </p>

                    {estimatedDowntime ? (
                        <p className='text-xs text-gray-500 mt-2 font-mono'>
                            Estimated back online: {estimatedDowntime}
                        </p>
                    ) : null}

                    <div className='mt-6 flex items-center justify-center gap-3'>
                        <button
                            onClick={checkStatus}
                            disabled={loading}
                            className='bg-neutral-900 border border-neutral-800 text-gray-300 hover:text-white rounded-xl font-bold text-xs py-2.5 px-5 cursor-pointer transition inline-flex items-center justify-center gap-2 disabled:opacity-50'
                        >
                            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            <span>Refresh Page Status</span>
                        </button>
                        <a
                            href='/'
                            className='bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 shadow-lg shadow-blue-800 text-white font-bold text-xs rounded-xl py-2.5 px-5 cursor-pointer transition inline-flex items-center justify-center'
                        >
                            Return to Dashboard
                        </a>
                    </div>
                </div>
            </div>
        )
    }

    // While initial status is being fetched for the very first time without cache, prevent page content flash
    if (loading && !status) {
        return (
            <div className='min-h-[60vh] flex items-center justify-center p-4 font-sans'>
                <div className='flex flex-col items-center gap-3'>
                    <div className='w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin' />
                    <span className='text-xs text-gray-400 font-medium'>Checking page availability...</span>
                </div>
            </div>
        )
    }

    return <>{children}</>
}

export default PageMaintenanceGuard
