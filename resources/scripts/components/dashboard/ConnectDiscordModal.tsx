import React, { useState } from 'react'
import { Modal } from '@mantine/core'
import http from '@/api/http'
import { Sparkles } from '@/components/ui/sparkles'
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal'
import {
    SparklesIcon,
    XMarkIcon,
    ArrowRightIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline'

interface Props {
    opened: boolean
    onClose: () => void
    onSuccess: (discordId: string, discordUsername: string) => void
    currentDiscordId?: string | null
}

export const ConnectDiscordModal: React.FC<Props> = ({
    opened,
    onClose,
    onSuccess,
    currentDiscordId,
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
            onClose={onClose}
            title={null}
            size='lg'
            centered
            withCloseButton={false}
            padding={0}
            radius={24}
            styles={{
                content: {
                    backgroundColor: '#000000',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0px 0px 80px 0px rgba(88, 101, 242, 0.3)',
                    overflow: 'hidden',
                },
                inner: {
                    padding: 0,
                },
                body: {
                    padding: 0,
                },
                overlay: {
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(16px)',
                },
            }}
        >
            <div className='relative bg-black min-h-[480px] text-white rounded-[24px] overflow-hidden p-6 md:p-8 font-sans'>
                {/* 1. Sparkles Top Layer */}
                <div className='absolute top-0 left-0 right-0 h-64 w-full overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] pointer-events-none z-0'>
                    <Sparkles
                        id='discord-modal-sparkles'
                        density={1200}
                        direction='bottom'
                        speed={1}
                        color='#5865F2'
                        className='absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]'
                    />
                </div>

                {/* 2. Glow Layer */}
                <div className='absolute left-1/2 top-[-100px] -translate-x-1/2 w-96 h-96 bg-[#5865F2]/20 rounded-full blur-[100px] pointer-events-none z-0' />

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className='absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer z-20'
                >
                    <XMarkIcon className='w-4 h-4' />
                </button>

                <div className='relative z-10 flex flex-col justify-between h-full'>
                    {/* Header */}
                    <div className='text-center max-w-md mx-auto mb-6'>
                        <div className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#5865F2]/15 text-[#5865F2] border border-[#5865F2]/30 mb-3 shadow-[0_0_15px_rgba(88,101,242,0.2)]'>
                            <SparklesIcon className='w-3.5 h-3.5' /> Community Rewards
                        </div>
                        <h2 className='text-2xl font-extrabold text-white tracking-tight mb-2'>
                            <VerticalCutReveal
                                splitBy='words'
                                staggerDuration={0.08}
                                staggerFrom='first'
                                containerClassName='justify-center gap-1.5'
                                transition={{
                                    type: 'spring',
                                    stiffness: 250,
                                    damping: 40,
                                    delay: 0,
                                }}
                            >
                                Link Discord Account
                            </VerticalCutReveal>
                        </h2>
                        <p className='text-xs text-gray-300 leading-relaxed font-sans'>
                            Link your Discord account to verify your community invite count, server boost status, and chat messages to claim free BOLTs!
                        </p>
                    </div>

                    {error && (
                        <div className='mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold text-center'>
                            {error}
                        </div>
                    )}

                    {/* OAuth 1-Click Button */}
                    <div className='mb-6 p-4 rounded-2xl bg-neutral-900/80 border border-white/10 backdrop-blur-md shadow-lg'>
                        <div className='flex items-center justify-between gap-4'>
                            <div>
                                <h4 className='text-xs font-bold text-white flex items-center gap-1.5'>
                                    <ShieldCheckIcon className='w-4 h-4 text-[#5865F2]' /> 1-Click Discord OAuth
                                </h4>
                                <p className='text-[11px] text-gray-400 mt-0.5'>
                                    Official authorization via Discord login.
                                </p>
                            </div>
                            <button
                                type='button'
                                onClick={handleOAuthClick}
                                className='px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-lg shadow-[#5865F2]/30 transition cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95'
                            >
                                Authorize <ArrowRightIcon className='w-3.5 h-3.5' />
                            </button>
                        </div>
                    </div>

                    <div className='relative flex py-1 items-center mb-6'>
                        <div className='flex-grow border-t border-neutral-800'></div>
                        <span className='flex-shrink mx-3 text-[10px] text-gray-500 font-bold uppercase tracking-wider'>
                            or enter manually
                        </span>
                        <div className='flex-grow border-t border-neutral-800'></div>
                    </div>

                    {/* Manual ID Input Form */}
                    <form onSubmit={handleSave} className='space-y-4'>
                        <div>
                            <label className='block text-xs font-semibold text-gray-300 mb-1.5'>
                                Discord User ID or Username:
                            </label>
                            <input
                                type='text'
                                value={discordInput}
                                onChange={e => setDiscordInput(e.target.value)}
                                placeholder='e.g. 102938475610293847 or @username'
                                className='w-full px-4 py-2.5 rounded-xl text-xs font-mono bg-neutral-950 border border-neutral-800 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none transition'
                                required
                            />
                        </div>

                        <div className='flex items-center justify-end gap-3 pt-2'>
                            <button
                                type='button'
                                onClick={onClose}
                                className='px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer'
                            >
                                Cancel
                            </button>
                            <button
                                type='submit'
                                disabled={loading}
                                className='px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 text-white shadow-lg shadow-blue-800/40 transition cursor-pointer active:scale-95 disabled:opacity-50'
                            >
                                {loading ? 'Saving...' : 'Link Discord Account'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Modal>
    )
}

export default ConnectDiscordModal
