import React, { useEffect, useState } from 'react'
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
    Clock,
} from 'lucide-react'

export const ActivityClaimPage: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    const session = searchParams.get('session') || ''
    const sig = searchParams.get('sig') || ''

    const [loading, setLoading] = useState(true)
    const [verifyingCode, setVerifyingCode] = useState(false)
    const [result, setResult] = useState<ActivityVerificationResult | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [autoClaimSuccess, setAutoClaimSuccess] = useState<string | null>(null)

    useEffect(() => {
        if (!session || !sig) {
            setErrorMsg('Missing verification parameters in the URL. Please launch the link from your dashboard.')
            setLoading(false)
            return
        }

        const verify = async () => {
            setLoading(true)
            setErrorMsg(null)
            try {
                const data = await verifyActivityCallback(session, sig)
                setResult(data)
            } catch (err: any) {
                const msg =
                    err.response?.data?.message ||
                    'Verification failed. If you used an automated bypass tool or completed the link too quickly, your claim was rejected.'
                setErrorMsg(msg)
            } finally {
                setLoading(false)
            }
        }

        verify()
    }, [session, sig])

    const handleCopy = () => {
        if (!result?.claim_code) return
        navigator.clipboard.writeText(result.claim_code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleAutoClaim = async () => {
        if (!result?.server_id || !result?.claim_code) return
        setVerifyingCode(true)
        try {
            const res = await claimActivityCode(result.server_id, result.claim_code)
            setAutoClaimSuccess(res.message)
            setTimeout(() => {
                navigate('/')
            }, 2000)
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to auto-claim code. You can paste it into the dashboard renewal modal.')
        } finally {
            setVerifyingCode(false)
        }
    }

    return (
        <PageContentBlock title='Activity Claim' showFlashKey='activity-claim'>
            <div className='min-h-[70vh] flex flex-col items-center justify-center py-12 px-4 font-sans'>
                <div className='w-full max-w-lg bg-neutral-900/80 border border-neutral-800 rounded-3xl p-8 shadow-[0px_0px_120px_-20px_#0900ff] text-center relative overflow-hidden backdrop-blur-xl'>
                    {/* Top Glow Accent */}
                    <div className='absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent' />

                    {loading ? (
                        <div className='py-12 flex flex-col items-center justify-center gap-4'>
                            <RotateCw className='w-10 h-10 animate-spin text-blue-400' />
                            <div>
                                <h3 className='text-lg font-bold text-white'>Verifying Sponsored Completion...</h3>
                                <p className='text-xs text-gray-400 mt-1'>
                                    Checking Anti-Bypass security criteria and generating your single-use code.
                                </p>
                            </div>
                        </div>
                    ) : errorMsg ? (
                        <div className='py-6 space-y-4'>
                            <div className='w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/60'>
                                <ShieldAlert className='w-8 h-8' />
                            </div>
                            <h3 className='text-xl font-bold text-white'>Verification Rejected</h3>
                            <div className='p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300 leading-relaxed text-left'>
                                {errorMsg}
                            </div>
                            <p className='text-xs text-gray-500 max-w-sm mx-auto'>
                                Automated bypassers, Linkvertise skips, or completing the page in under 20 seconds are strictly forbidden to protect our free hosting.
                            </p>
                            <button
                                onClick={() => navigate('/')}
                                className='mt-2 py-2.5 px-6 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold border border-neutral-700 cursor-pointer inline-flex items-center gap-2 transition active:scale-95'
                            >
                                <ArrowLeft className='w-4 h-4' /> Return to Dashboard
                            </button>
                        </div>
                    ) : result ? (
                        <div className='py-4 space-y-5'>
                            <div className='w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/60'>
                                <ShieldCheck className='w-8 h-8' />
                            </div>

                            <div>
                                <span className='text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'>
                                    Anti-Bypass Verified
                                </span>
                                <h3 className='text-2xl font-bold text-white mt-2'>
                                    Claim Code Ready!
                                </h3>
                                <p className='text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed'>
                                    {result.session_type === 'reactivation_step'
                                        ? `This single-use code advances your recovery progress (Step ${result.step_number} of 3).`
                                        : 'This code grants an additional 72 hours (3 days) of server activity.'}
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
                                        disabled={verifyingCode}
                                        className='w-full py-3 px-5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/50 border border-blue-400 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50'
                                    >
                                        {verifyingCode ? (
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
                        </div>
                    ) : null}
                </div>
            </div>
        </PageContentBlock>
    )
}

export default ActivityClaimPage
