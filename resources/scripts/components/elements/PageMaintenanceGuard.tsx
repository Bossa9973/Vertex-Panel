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

    const isUnderMaintenance = status && (status.global || status[pageKey] === true)

    if (isUnderMaintenance) {
        return (
            <div className='relative z-10 min-h-[calc(100vh-180px)] flex items-center justify-center p-4 font-sans'>
                <div className='relative z-10 max-w-lg w-full text-center p-8 bg-black/40 backdrop-blur-sm border border-white/[0.04] rounded-2xl shadow-[0px_0px_80px_-10px_rgba(9,0,255,0.4)] border-t border-t-blue-500/20 space-y-6 my-auto'>
                    <div className='w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400'>
                        <WrenchScrewdriverIcon className='w-6 h-6' />
                    </div>

                    <div className='space-y-2'>
                        <span className='bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-[10px] px-2.5 py-0.5 font-semibold uppercase tracking-wide inline-block'>
                            Under Maintenance
                        </span>
                        <h2 className='text-2xl font-bold text-white tracking-tight'>
                            Page Currently Unavailable
                        </h2>
                    </div>

                    <p className='text-sm text-gray-400 text-center max-w-xs mx-auto leading-relaxed'>
                        {status.message || 'This section is currently undergoing scheduled maintenance. Please check back shortly.'}
                    </p>

                    <div className='flex items-center justify-center gap-3 pt-2'>
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
