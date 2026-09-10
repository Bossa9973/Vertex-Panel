import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import PageContentBlock from '@/components/elements/PageContentBlock'
import { verifyActivityCallback, ActivityVerificationResult } from '@/api/server/activity'
import {
    ShieldCheck,
    ShieldAlert,
    RotateCw,
    CheckCircle2,
    ArrowLeft,
    Sparkles,
    Lock,
    Home,
} from 'lucide-react'

/**
 * ActivityClaimPage — the destination page users land on after completing Shrinkme.
 *
 * Security model (as of auto-grant rewrite):
 *   - NO claim code is ever displayed here.
 *   - Clicking "Complete Verification" sends a POST to /api/client/activity/verify.
 *   - The server checks all 6 pillars: client_nonce handshake, isTrusted gesture,
 *     bypass source blacklist, datacenter ASN, browser integrity, AND Referer from shrinkme.io.
 *   - If all pass, the server DIRECTLY grants the renewal — no code is returned.
 *   - The dashboard (Tab 1) polls for completion and updates automatically.
 *
 * bypass.city attack: bypass.city resolves this URL without going through Shrinkme.
 * When the user opens it directly, the HTTP Referer header is NOT shrinkme.io → server rejects.
 */
export const ActivityClaimPage: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    const session = searchParams.get('session') || ''
    const sig = searchParams.get('sig') || ''

    const [verifying, setVerifying] = useState(false)
    const [result, setResult] = useState<ActivityVerificationResult | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Trajectory buffer for physical human input validation (Pillar 2)
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

    // Request client_nonce from the original dashboard tab via BroadcastChannel (Pillar 1)
    const requestClientNonce = async (targetSession: string): Promise<string | null> => {
        const localNonce = sessionStorage.getItem('vertex_activity_client_nonce')
        if (localNonce) return localNonce

        if (typeof BroadcastChannel === 'undefined') return null

        return new Promise((resolve) => {
            let channel: BroadcastChannel | null = null
            let timer: ReturnType<typeof setTimeout> | null = null

            try {
                channel = new BroadcastChannel('vertex_activity_handshake')

                timer = setTimeout(() => {
                    channel?.close()
                    resolve(null)
                }, 1200)

                channel.onmessage = (evt) => {
                    if (evt.data?.type === 'CHALLENGE_RESPONSE' && evt.data?.clientNonce) {
                        if (timer) clearTimeout(timer)
                        channel?.close()
                        resolve(evt.data.clientNonce)
                    }
                }

                channel.postMessage({ type: 'CHALLENGE_REQUEST', session: targetSession })
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
        // Pillar 2: enforce physical hardware event (isTrusted === true)
        if (!e.isTrusted) {
            setErrorMsg(
                'Verification Failed: Hardware interaction validation failed. Synthetic clicks are strictly prohibited.'
            )
            return
        }

        if (!session || !sig) {
            setErrorMsg(
                'Missing verification parameters. Please launch the link from your dashboard.'
            )
            return
        }

        setVerifying(true)
        setErrorMsg(null)

        try {
            const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
            const clientNonce = await requestClientNonce(session)
            const gesture = {
                is_trusted: e.isTrusted,
                points: [...trajectoryRef.current],
                is_touch: isTouch,
            }
            const integrity = generateClientIntegrity()

            const data = await verifyActivityCallback(session, sig, clientNonce || undefined, gesture, integrity)
            setResult(data)

            // Notify dashboard tab that the grant is complete (so it can stop polling early)
            if (typeof BroadcastChannel !== 'undefined') {
                try {
                    const notifyChannel = new BroadcastChannel('vertex_activity_handshake')
                    notifyChannel.postMessage({
                        type: 'GRANT_COMPLETE',
                        session_type: data.session_type,
                        step_number: data.step_number,
                        message: data.message,
                    })
                    notifyChannel.close()
                } catch {
                    // Non-fatal
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

    return (
        <PageContentBlock title='Activity Verification' showFlashKey='activity-claim'>
            <div className='min-h-[75vh] flex flex-col items-center justify-center py-12 px-4 font-sans'>
                <div className='w-full max-w-lg bg-neutral-900/85 border border-neutral-800 rounded-3xl p-8 shadow-[0px_0px_120px_-20px_#0900ff] text-center relative overflow-hidden backdrop-blur-xl'>
                    {/* Top Accent Line */}
                    <div className='absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent' />

                    {/* State: Idle (ready to verify) */}
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
                                    Complete Your Verification
                                </h3>
                                <p className='text-xs text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed'>
                                    Click the button below to confirm your session. Your server will
                                    be renewed automatically — no code needed.
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
                                            <RotateCw className='w-5 h-5 animate-spin' /> Validating
                                            &amp; Renewing...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className='w-5 h-5' /> Complete Verification
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className='flex items-center justify-center gap-2 text-[11px] text-gray-500'>
                                <ShieldCheck className='w-3.5 h-3.5 text-blue-400 shrink-0' />
                                <span>Single-use session • Protected by 6-Pillar Anti-Bypass Guard</span>
                            </div>
                        </div>
                    )}

                    {/* State: Error */}
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
                                Automated bypass tools and direct link access are not permitted. Please
                                open the link from your dashboard and complete the sponsor steps naturally.
                            </p>
                            <button
                                onClick={() => navigate('/')}
                                className='mt-2 py-2.5 px-6 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold border border-neutral-700 cursor-pointer inline-flex items-center gap-2 transition active:scale-95'
                            >
                                <ArrowLeft className='w-4 h-4' /> Return to Dashboard
                            </button>
                        </div>
                    )}

                    {/* State: Success — renewal was auto-granted */}
                    {result && (
                        <div className='py-6 space-y-5'>
                            <div className='w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/60'>
                                <CheckCircle2 className='w-8 h-8' />
                            </div>

                            <div>
                                <span className='text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'>
                                    Verification Complete
                                </span>
                                <h3 className='text-2xl font-bold text-white mt-3'>
                                    {result.session_type === 'reactivation_step'
                                        ? `Step ${result.step_number}/3 Verified!`
                                        : 'Server Renewed!'}
                                </h3>
                                <p className='text-sm text-gray-300 mt-2 max-w-sm mx-auto leading-relaxed'>
                                    {result.message ||
                                        (result.session_type === 'reactivation_step'
                                            ? `Recovery step ${result.step_number} of 3 has been verified. Your progress has been updated automatically.`
                                            : 'Your server has been granted an additional 72 hours of active time.')}
                                </p>
                            </div>

                            <div className='p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-300 text-left leading-relaxed space-y-1'>
                                <div className='flex items-center gap-2 font-semibold'>
                                    <CheckCircle2 className='w-3.5 h-3.5 shrink-0' />
                                    Renewal applied automatically — no code to enter
                                </div>
                                <div className='text-gray-400 pl-5'>
                                    Your dashboard will reflect the updated timer. You can safely close this tab.
                                </div>
                            </div>

                            <button
                                type='button'
                                onClick={() => navigate('/')}
                                className='w-full py-3 px-5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/50 border border-blue-400 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95'
                            >
                                <Home className='w-4 h-4' /> Return to Dashboard
                            </button>

                            <p className='text-[10px] text-gray-500'>
                                This session is single-use and has now been consumed.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </PageContentBlock>
    )
}

export default ActivityClaimPage
