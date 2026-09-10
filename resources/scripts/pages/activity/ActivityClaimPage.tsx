import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import PageContentBlock from '@/components/elements/PageContentBlock'
import {
    verifyActivityCallback,
    claimActivityCode,
    ActivityVerificationResult,
} from '@/api/server/activity'
import {
    ShieldCheck,
    ShieldAlert,
    RotateCw,
    CheckCircle2,
    Copy,
    Check,
    ArrowLeft,
    Sparkles,
    KeyRound,
    Lock,
    ExternalLink,
} from 'lucide-react'

export const ActivityClaimPage: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    const session = searchParams.get('session') || ''
    const sig = searchParams.get('sig') || ''

    const [verifying, setVerifying] = useState(false)
    const [autoClaiming, setAutoClaiming] = useState(false)
    const [result, setResult] = useState<ActivityVerificationResult | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [autoClaimSuccess, setAutoClaimSuccess] = useState<string | null>(null)

    // Trajectory buffer for physical human input validation
    const trajectoryRef = useRef<Array<[number, number, number]>>([])

    useEffect(() => {
        const handleMove = (e: MouseEvent | TouchEvent) => {
            const now = Date.now()
            let x = 0
            let y = 0
            if ('clientX' in e) {
                x = Math.round(e.clientX)
                y = Math.round(e.clientY)
            } else if (e.touches && e.touches[0]) {
                x = Math.round(e.touches[0].clientX)
                y = Math.round(e.touches[0].clientY)
            }
            trajectoryRef.current.push([x, y, now])
            if (trajectoryRef.current.length > 50) {
                trajectoryRef.current.shift()
            }
        }

        window.addEventListener('mousemove', handleMove, { passive: true })
        window.addEventListener('touchmove', handleMove, { passive: true })

        return () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('touchmove', handleMove)
        }
    }, [])

    // Request client_nonce from original dashboard tab via BroadcastChannel
    const requestClientNonce = async (targetSession: string): Promise<string | null> => {
        // Check sessionStorage first in case user was redirected in same tab
        const localNonce = sessionStorage.getItem('vertex_activity_client_nonce')
        if (localNonce) return localNonce

        if (typeof BroadcastChannel === 'undefined') return null

        return new Promise((resolve) => {
            let channel: BroadcastChannel | null = null
            let timer: any = null

            try {
                channel = new BroadcastChannel('vertex_activity_handshake')

                timer = setTimeout(() => {
                    channel?.close()
                    resolve(null)
                }, 1200)

                channel.onmessage = (evt) => {
                    if (evt.data?.type === 'CHALLENGE_RESPONSE' && evt.data?.clientNonce) {
                        clearTimeout(timer)
                        channel?.close()
                        resolve(evt.data.clientNonce)
                    }
                }

                channel.postMessage({
                    type: 'CHALLENGE_REQUEST',
                    session: targetSession,
                })
            } catch {
                if (timer) clearTimeout(timer)
                channel?.close()
                resolve(null)
            }
        })
    }

    const generateClientIntegrity = (): string => {
        try {
            const payload = {
                bot: !!(navigator as any).webdriver,
                w: window.screen?.width || 0,
                h: window.screen?.height || 0,
                cd: window.screen?.colorDepth || 0,
                tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
                t: Date.now(),
            }
            return btoa(JSON.stringify(payload))
        } catch {
            return ''
        }
    }

    const handleUnlockClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
        // Enforce physical hardware event (isTrusted === true)
        if (!e.isTrusted) {
            setErrorMsg('Verification Failed: Hardware interaction validation failed. Synthetic clicks and automated userscripts are strictly prohibited.')
            return
        }

        if (!session || !sig) {
            setErrorMsg('Missing verification parameters in the URL. Please launch the link from your dashboard.')
            return
        }

        setVerifying(true)
        setErrorMsg(null)

        try {
            // Check if device is touch-enabled
            const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

            // Query original tab for handshake nonce
            const clientNonce = await requestClientNonce(session)

            // Gather human trajectory samples
            const gesture = {
                is_trusted: e.isTrusted,
                points: [...trajectoryRef.current],
                is_touch: isTouch,
            }

            const integrity = generateClientIntegrity()

            const data = await verifyActivityCallback(
                session,
                sig,
                clientNonce || undefined,
                gesture,
                integrity
            )

            setResult(data)

            // Auto-broadcast code back to dashboard modal if open
            if (typeof BroadcastChannel !== 'undefined' && data.claim_code) {
                try {
                    const syncChannel = new BroadcastChannel('vertex_activity_handshake')
                    syncChannel.postMessage({
                        type: 'CODE_CLAIMED_AUTO_APPLY',
                        code: data.claim_code,
                    })
                    syncChannel.close()
                } catch {
                    // Ignore broadcast sync failure
                }
            }
        } catch (err: any) {
            const msg =
                err.response?.data?.message ||
                'Verification Failed: Security integrity validation failed. Please complete the link naturally in your browser.'
            setErrorMsg(msg)
        } finally {
            setVerifying(false)
        }
    }

    const handleCopy = () => {
        if (!result?.claim_code) return
        navigator.clipboard.writeText(result.claim_code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleAutoClaim = async () => {
        if (!result?.server_id || !result?.claim_code) return
        setAutoClaiming(true)
        try {
            const res = await claimActivityCode(result.server_id, result.claim_code)
            setAutoClaimSuccess(res.message)
            setTimeout(() => {
                navigate('/')
            }, 2000)
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to auto-claim code. You can paste it into the dashboard renewal modal.')
        } finally {
            setAutoClaiming(false)
        }
    }

    return (
        <PageContentBlock title='Activity Claim' showFlashKey='activity-claim'>
            <div className='min-h-[75vh] flex flex-col items-center justify-center py-12 px-4 font-sans'>
                <div className='w-full max-w-lg bg-neutral-900/85 border border-neutral-800 rounded-3xl p-8 shadow-[0px_0px_120px_-20px_#0900ff] text-center relative overflow-hidden backdrop-blur-xl'>
                    {/* Top Accent Line */}
                    <div className='absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent' />

                    {!result && !errorMsg && (
                        <div className='py-6 space-y-6'>
                            <div className='w-16 h-16 rounded-3xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto shadow-lg shadow-blue-950/60'>
                                <Lock className='w-8 h-8' />
                            </div>

                            <div>
                                <div className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-semibold tracking-wide uppercase mb-2'>
                                    <Sparkles className='w-3.5 h-3.5' /> Sponsor Completed
                                </div>
                                <h3 className='text-2xl font-bold text-white tracking-tight'>
                                    Unlock Your Claim Code
                                </h3>
                                <p className='text-xs text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed'>
                                    Verify your active browser session to release your single-use activation code.
                                </p>
                            </div>

                            <div className='pt-2'>
                                <button
                                    type='button'
                                    onClick={handleUnlockClick}
                                    disabled={verifying}
                                    className='w-full py-3.5 px-6 rounded-2xl bg-gradient-to-t from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm shadow-xl shadow-blue-900/50 border border-blue-400 flex items-center justify-center gap-2.5 cursor-pointer transition active:scale-95 disabled:opacity-50'
                                >
                                    {verifying ? (
                                        <>
                                            <RotateCw className='w-5 h-5 animate-spin' /> Validating Session...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className='w-5 h-5' /> Verify &amp; Unlock Code
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className='flex items-center justify-center gap-2 text-[11px] text-gray-500'>
                                <ShieldCheck className='w-3.5 h-3.5 text-blue-400 shrink-0' />
                                <span>Single-use code • Protected by Active Anti-Bypass Handshake</span>
                            </div>
                        </div>
                    )}

                    {errorMsg && (
                        <div className='py-6 space-y-5'>
                            <div className='w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/60'>
                                <ShieldAlert className='w-8 h-8' />
                            </div>
                            <h3 className='text-xl font-bold text-white'>Verification Rejected</h3>
                            <div className='p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300 leading-relaxed text-left'>
                                {errorMsg}
                            </div>
                            <p className='text-xs text-gray-500 max-w-sm mx-auto'>
                                Automated bypass tools, remote scraper bots, or synthetic scripts are strictly prohibited to protect our free hosting service.
                            </p>
                            <button
                                onClick={() => navigate('/')}
                                className='mt-2 py-2.5 px-6 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold border border-neutral-700 cursor-pointer inline-flex items-center gap-2 transition active:scale-95'
                            >
                                <ArrowLeft className='w-4 h-4' /> Return to Dashboard
                            </button>
                        </div>
                    )}

                    {result && (
                        <div className='py-4 space-y-5'>
                            <div className='w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/60'>
                                <ShieldCheck className='w-8 h-8' />
                            </div>

                            <div>
                                <span className='text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'>
                                    Verified &amp; Unlocked
                                </span>
                                <h3 className='text-2xl font-bold text-white mt-2'>
                                    Claim Code Ready!
                                </h3>
                                <p className='text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed'>
                                    {result.session_type === 'reactivation_step'
                                        ? `This single-use code advances your recovery progress (Step ${result.step_number} of 3).`
                                        : 'This single-use code grants an additional 72 hours (3 days) of server activity.'}
                                </p>
                            </div>

                            {/* Code Box */}
                            <div className='p-4 rounded-2xl bg-neutral-950/90 border border-neutral-800 flex items-center justify-between gap-3 shadow-inner'>
                                <span className='text-xl sm:text-2xl font-mono font-black tracking-wider text-amber-400 select-all'>
                                    {result.claim_code}
                                </span>
                                <button
                                    type='button'
                                    onClick={handleCopy}
                                    className='py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 active:scale-95'
                                >
                                    {copied ? (
                                        <>
                                            <Check className='w-4 h-4 text-emerald-400' /> Copied
                                        </>
                                    ) : (
                                        <>
                                            <Copy className='w-4 h-4' /> Copy
                                        </>
                                    )}
                                </button>
                            </div>

                            {autoClaimSuccess ? (
                                <div className='p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-semibold flex items-center justify-center gap-2'>
                                    <CheckCircle2 className='w-4 h-4' /> {autoClaimSuccess}
                                </div>
                            ) : (
                                <div className='space-y-3 pt-2'>
                                    <button
                                        type='button'
                                        onClick={handleAutoClaim}
                                        disabled={autoClaiming}
                                        className='w-full py-3 px-5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/50 border border-blue-400 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50'
                                    >
                                        {autoClaiming ? (
                                            <>
                                                <RotateCw className='w-4 h-4 animate-spin' /> Applying Claim Code...
                                            </>
                                        ) : (
                                            <>
                                                <KeyRound className='w-4 h-4' /> Auto-Apply Code &amp; Return to Dashboard
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type='button'
                                        onClick={() => navigate('/')}
                                        className='w-full py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-gray-400 hover:text-gray-200 text-xs font-semibold cursor-pointer transition'
                                    >
                                        I'll enter it manually on the Dashboard
                                    </button>
                                </div>
                            )}

                            <p className='text-[10px] text-gray-500'>
                                Note: This code is strictly 1-time use. Once claimed, it cannot be reused.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </PageContentBlock>
    )
}

export default ActivityClaimPage
