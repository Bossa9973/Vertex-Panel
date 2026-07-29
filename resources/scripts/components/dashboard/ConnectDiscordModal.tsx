import React, { useState } from 'react'
import { Modal } from '@mantine/core'
import { BorderBeam } from '@/components/ui/BorderBeam'
import http from '@/api/http'
import {
    SparklesIcon,
    XMarkIcon,
    ArrowRightIcon,
    ShieldExclamationIcon,
} from '@heroicons/react/24/outline'

interface Props {
    opened: boolean
    onClose: () => void
    onSuccess: (discordId: string, discordUsername: string) => void
    currentDiscordId?: string | null
    isBlocked?: boolean
}

export const ConnectDiscordModal: React.FC<Props> = ({
    opened,
    onClose,
    onSuccess,
    currentDiscordId,
    isBlocked = false,
}) => {
    const [discordInput, setDiscordInput] = useState(currentDiscordId || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!discordInput.trim()) {
            setError('Please enter a valid Discord User ID or Username.')
            return
        }

        setLoading(true)
        setError(null)
        try {
            const res = await http.post('/api/client/earn/connect-discord', {
                discord_id: discordInput.trim(),
                discord_username: discordInput.trim(),
            })

            if (res.data?.success) {
                onSuccess(res.data.data.discord_id, res.data.data.discord_username)
                onClose()
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to connect Discord account. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleOAuthClick = () => {
        window.location.href = '/auth/login/discord'
    }

    return (
        <Modal
            opened={opened}
            onClose={() => {
                if (!isBlocked) onClose()
            }}
            withCloseButton={false}
            closeOnClickOutside={!isBlocked}
            closeOnEscape={!isBlocked}
            centered
            size='lg'
            overlayProps={{
                opacity: 0.85,
                blur: 16,
            }}
            styles={{
                content: {
                    background: 'transparent',
                    boxShadow: 'none',
                },
                body: {
                    padding: 0,
                },
            }}
        >
            <div className='relative overflow-hidden rounded-3xl bg-neutral-900/95 border border-white/20 backdrop-blur-3xl p-6 md:p-8 text-white shadow-[0_0_80px_rgba(88,101,242,0.4)] font-sans'>
                <BorderBeam size={300} duration={10} delay={0} colorFrom='#5865F2' colorTo='#3b82f6' borderWidth={2} />

                {/* Close Button only if not blocked */}
                {!isBlocked && (
                    <button
                        onClick={onClose}
                        className='absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer z-20'
                    >
                        <XMarkIcon className='w-4 h-4' />
                    </button>
                )}

                <div className='relative z-10'>
                    {/* Header Icon & Title */}
                    <div className='flex items-center gap-3.5 mb-4'>
                        <div className='w-12 h-12 rounded-2xl bg-[#5865F2]/25 border border-[#5865F2]/50 flex items-center justify-center text-[#5865F2] shadow-[0_0_30px_rgba(88,101,242,0.5)] shrink-0 animate-pulse'>
                            {isBlocked ? <ShieldExclamationIcon className='w-6 h-6' /> : <SparklesIcon className='w-6 h-6' />}
                        </div>
                        <div>
                            <span className='px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#5865F2]/20 text-[#5865F2] border border-[#5865F2]/40 uppercase tracking-wider'>
                                {isBlocked ? 'Access Restricted' : 'Discord Required'}
                            </span>
                            <h3 className='text-xl font-extrabold text-white tracking-tight mt-0.5'>
                                Link Your Discord Account
                            </h3>
                        </div>
                    </div>

                    <p className='text-xs text-slate-300 leading-relaxed mb-6 font-sans'>
                        {isBlocked
                            ? 'To access the Earn BOLTs section and claim rewards, you must first connect your Discord account to Convoy Cloud.'
                            : 'Connect your Discord account to enable automated verification for server invites, boosts, and chat activity rewards!'}
                    </p>

                    {error && (
                        <div className='mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-semibold'>
                            {error}
                        </div>
                    )}

                    {/* OAuth Quick Connect Button */}
                    <div className='mb-6 p-4 rounded-2xl bg-[#5865F2]/15 border border-[#5865F2]/30 backdrop-blur-md shadow-lg'>
                        <div className='flex items-center justify-between gap-4'>
                            <div>
                                <h4 className='text-xs font-bold text-white'>1-Click OAuth Authorization</h4>
                                <p className='text-[11px] text-slate-300 mt-0.5'>
                                    Connect automatically via Discord OAuth2.
                                </p>
                            </div>
                            <button
                                type='button'
                                onClick={handleOAuthClick}
                                className='px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-lg shadow-[#5865F2]/40 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95'
                            >
                                Connect <ArrowRightIcon className='w-3.5 h-3.5' />
                            </button>
                        </div>
                    </div>

                    <div className='relative flex py-1 items-center mb-6'>
                        <div className='flex-grow border-t border-white/10'></div>
                        <span className='flex-shrink mx-3 text-[11px] text-slate-400 font-semibold uppercase tracking-wider'>
                            or connect manually
                        </span>
                        <div className='flex-grow border-t border-white/10'></div>
                    </div>

                    {/* Manual ID Input Form */}
                    <form onSubmit={handleSave} className='space-y-4'>
                        <div>
                            <label className='block text-xs font-semibold text-slate-300 mb-1.5'>
                                Discord User ID or Username:
                            </label>
                            <input
                                type='text'
                                value={discordInput}
                                onChange={e => setDiscordInput(e.target.value)}
                                placeholder='e.g. 102938475610293847 or @username'
                                className='w-full px-4 py-2.5 rounded-xl text-xs font-mono bg-black/70 border border-white/20 text-white placeholder:text-stone-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all'
                                required
                            />
                            <p className='text-[11px] text-slate-400 mt-1 font-sans'>
                                Find your User ID in Discord by turning on Developer Mode and right-clicking your profile.
                            </p>
                        </div>

                        <div className='flex items-center justify-end gap-3 pt-2'>
                            {!isBlocked && (
                                <button
                                    type='button'
                                    onClick={onClose}
                                    className='px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer'
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type='submit'
                                disabled={loading}
                                className='w-full py-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50'
                            >
                                {loading ? 'Linking Account...' : 'Link Discord & Unlock Earn BOLTs'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Modal>
    )
}

export default ConnectDiscordModal
