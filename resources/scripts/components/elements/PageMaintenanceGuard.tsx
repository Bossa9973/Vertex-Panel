import React, { useEffect, useState } from 'react'
import { WrenchScrewdriverIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { Button } from '@mantine/core'
import { useStoreState } from 'easy-peasy'
import http from '@/api/http'
import Card from '@/components/elements/Card'

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
            <div className='min-h-[70vh] flex items-center justify-center p-4 font-sans'>
                <Card className='max-w-xl w-full text-center p-8 bg-neutral-900/90 border border-amber-500/30 rounded-3xl shadow-2xl backdrop-blur-2xl space-y-6'>
                    <div className='w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-inner shadow-amber-500/10'>
                        <WrenchScrewdriverIcon className='w-10 h-10 animate-bounce' />
                    </div>

                    <div className='space-y-2'>
                        <span className='px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-block'>
                            Under Maintenance
                        </span>
                        <h2 className='text-2xl font-bold text-white tracking-tight'>
                            Page Currently Unavailable
                        </h2>
                    </div>

                    <p className='text-sm text-gray-300 leading-relaxed bg-neutral-950/80 p-4 rounded-2xl border border-white/10 text-left'>
                        {status.message || 'This section is currently undergoing scheduled maintenance. Please check back shortly.'}
                    </p>

                    <div className='flex items-center justify-center gap-3 pt-2'>
                        <Button
                            variant='outline'
                            className='border-white/20 text-gray-200 hover:bg-white/5 cursor-pointer'
                            loading={loading}
                            onClick={checkStatus}
                        >
                            <ArrowPathIcon className='w-4 h-4 mr-2' /> Refresh Page Status
                        </Button>
                        <Button
                            component='a'
                            href='/'
                            className='bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                        >
                            Return to Dashboard
                        </Button>
                    </div>
                </Card>
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
