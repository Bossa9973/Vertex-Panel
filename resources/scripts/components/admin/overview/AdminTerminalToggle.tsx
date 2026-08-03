import React, { useEffect, useState } from 'react'
import { CommandLineIcon, CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/outline'
import http from '@/api/http'

export type TerminalMode = 'both' | 'sshx'

export const AdminTerminalToggle: React.FC = () => {
    const [mode, setMode] = useState<TerminalMode>('both')
    const [loading, setLoading] = useState<boolean>(true)
    const [updating, setUpdating] = useState<boolean>(false)

    const fetchSetting = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/admin/settings/terminal')
            if (res.data?.data?.mode) {
                setMode(res.data.data.mode)
            }
        } catch (err) {
            console.error('Failed to fetch terminal mode setting:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSetting()
    }, [])

    const handleSelectMode = async (newMode: TerminalMode) => {
        if (newMode === mode || updating) return
        setUpdating(true)
        try {
            const res = await http.post('/api/admin/settings/terminal', {
                mode: newMode,
            })
            if (res.data?.success && res.data?.data?.mode) {
                setMode(res.data.data.mode)
            }
        } catch (err) {
            alert('Failed to update terminal console mode.')
        } finally {
            setUpdating(false)
        }
    }

    return (
        <div className='col-span-12 bg-neutral-900/70 border border-white/10 rounded-2xl p-6 shadow-xl shadow-blue-950/20 backdrop-blur-xl hover:border-white/20 transition-all font-sans mb-2'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
                <div className='flex items-start gap-4'>
                    <div className='w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner'>
                        <CommandLineIcon className='w-6 h-6' />
                    </div>
                    <div>
                        <div className='flex items-center gap-3'>
                            <h3 className='text-lg font-bold text-white tracking-tight'>
                                VPS Terminal Management Mode
                            </h3>
                            {!loading && (
                                mode === 'sshx' ? (
                                    <span className='px-3 py-0.5 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5 backdrop-blur-md'>
                                        <SparklesIcon className='w-4 h-4 text-indigo-400' /> Only tmate Active
                                    </span>
                                ) : (
                                    <span className='px-3 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1.5 backdrop-blur-md'>
                                        <CheckCircleIcon className='w-4 h-4 text-blue-400' /> Both (noVNC & xTerm.js)
                                    </span>
                                )
                            )}
                        </div>
                        <p className='text-xs text-gray-400 mt-1 max-w-xl leading-relaxed'>
                            Configure which terminal console options are presented to clients on the VPS management page (<code className='text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded'>/servers/:id</code>). Switch to "Only tmate" to replace noVNC & xTerm.js with an instant tmate terminal session.
                        </p>
                    </div>
                </div>

                <div className='flex items-center gap-2 shrink-0 bg-neutral-950/80 p-1.5 rounded-xl border border-white/10'>
                    <button
                        onClick={() => handleSelectMode('both')}
                        disabled={loading || updating}
                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                            mode === 'both'
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 border border-blue-400/40'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        Both (noVNC & xTerm)
                    </button>
                    <button
                        onClick={() => handleSelectMode('sshx')}
                        disabled={loading || updating}
                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                            mode === 'sshx'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/40'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        Only tmate
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AdminTerminalToggle
