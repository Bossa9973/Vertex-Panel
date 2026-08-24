import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    ArrowPathIcon,
    ClipboardDocumentIcon,
    ClipboardDocumentCheckIcon,
    ServerStackIcon,
    GlobeAltIcon,
    KeyIcon,
    ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { getPterodactylDeployStatus, type PterodactylDeployStatus } from '@/api/pterodactylDeploy'

// ── Status steps ─────────────────────────────────────────────────────────────
const STEPS = [
    { id: 'pending',      label: 'Order Received',           desc: 'Your order has been queued.' },
    { id: 'provisioning', label: 'Provisioning VM',          desc: 'Cloning base VM in Proxmox…' },
    { id: 'installing',   label: 'Installing Pterodactyl',   desc: 'Running cloud-init install script (~10 min)…' },
    { id: 'complete',     label: 'Live & Ready',             desc: 'Your panel is up and running!' },
] as const

type DeployStatus = PterodactylDeployStatus['status']

const stepIndex = (s?: DeployStatus) => STEPS.findIndex(x => x.id === s)

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ value }: { value: string }) {
    const [done, setDone] = useState(false)
    const copy = () => {
        navigator.clipboard.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 2000)
    }
    return (
        <button
            type='button'
            onClick={copy}
            title='Copy'
            className='ml-2 text-slate-400 hover:text-blue-400 transition-colors flex-shrink-0'
        >
            {done
                ? <ClipboardDocumentCheckIcon className='w-4 h-4 text-green-400' />
                : <ClipboardDocumentIcon className='w-4 h-4' />}
        </button>
    )
}

// ── Credential row ─────────────────────────────────────────────────────────────
function CredRow({ label, value, icon: Icon, link }: {
    label: string
    value: string
    icon: React.ComponentType<{ className?: string }>
    link?: boolean
}) {
    return (
        <div className='flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10'>
            <Icon className='w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5' />
            <div className='flex-1 min-w-0'>
                <p className='text-xs text-slate-400 mb-0.5'>{label}</p>
                <div className='flex items-center gap-1'>
                    <span className='font-mono text-sm text-white break-all'>{value}</span>
                    <CopyBtn value={value} />
                    {link && (
                        <a
                            href={value.startsWith('http') ? value : `https://${value}`}
                            target='_blank'
                            rel='noreferrer'
                            className='ml-1 text-slate-400 hover:text-blue-400 transition-colors'
                        >
                            <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PterodactylStatusPage() {
    const { deployId } = useParams<{ deployId: string }>()
    const navigate = useNavigate()
    const [status, setStatus] = useState<PterodactylDeployStatus | null>(null)
    const [error, setError]   = useState<string | null>(null)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const poll = async () => {
        if (!deployId) return
        try {
            const data = await getPterodactylDeployStatus(Number(deployId))
            setStatus(data)
            if (data.status === 'complete' || data.status === 'failed') {
                if (intervalRef.current) clearInterval(intervalRef.current)
            }
        } catch (e: any) {
            const msg = e?.response?.data?.message || 'Failed to fetch deploy status.'
            setError(msg)
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }

    useEffect(() => {
        poll()
        intervalRef.current = setInterval(poll, 10_000)
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [deployId])

    const current = status?.status
    const curIdx  = stepIndex(current)
    const failed  = current === 'failed'
    const done    = current === 'complete'

    return (
        <div className='min-h-screen flex items-start justify-center px-4 py-12'>
            {/* Background glow */}
            <div className='pointer-events-none fixed inset-0 overflow-hidden'>
                <div
                    className='absolute left-1/2 top-0 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-20'
                    style={{ background: 'radial-gradient(circle, #3b30f5 0%, transparent 70%)' }}
                />
            </div>

            <div className='relative z-10 w-full max-w-2xl'>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className='text-center mb-10'
                >
                    <div className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-4'>
                        <ServerStackIcon className='w-4 h-4' />
                        Pterodactyl Auto-Deploy
                    </div>
                    <h1 className='text-3xl font-bold text-white mb-2'>
                        {done ? 'Your Panel is Ready!' : failed ? 'Installation Failed' : 'Installing Pterodactyl…'}
                    </h1>
                    <p className='text-slate-400 text-sm'>
                        Deploy ID: <span className='font-mono text-slate-300'>#{deployId}</span>
                    </p>
                </motion.div>

                {/* Fetch error */}
                {error && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className='mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm'
                    >
                        {error}
                    </motion.div>
                )}

                {/* Step tracker */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className='bg-white/5 border border-white/10 rounded-2xl p-6 mb-6'
                >
                    <div className='space-y-5'>
                        {STEPS.map((step, i) => {
                            const isComplete = !failed && i < curIdx
                            const isCurrent  = !failed && i === curIdx
                            const isFailed   = failed && i === curIdx

                            return (
                                <div key={step.id} className='flex items-start gap-4'>
                                    <div className='flex-shrink-0 mt-0.5'>
                                        {isComplete ? (
                                            <CheckCircleIcon className='w-6 h-6 text-green-400' />
                                        ) : isFailed ? (
                                            <XCircleIcon className='w-6 h-6 text-red-400' />
                                        ) : isCurrent ? (
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                                            >
                                                <ArrowPathIcon className='w-6 h-6 text-blue-400' />
                                            </motion.div>
                                        ) : (
                                            <ClockIcon className='w-6 h-6 text-slate-600' />
                                        )}
                                    </div>
                                    <div className='flex-1'>
                                        <p className={`text-sm font-semibold ${
                                            isComplete ? 'text-green-400'
                                            : isFailed  ? 'text-red-400'
                                            : isCurrent ? 'text-white'
                                            : 'text-slate-500'
                                        }`}>
                                            {step.label}
                                        </p>
                                        {(isCurrent || isFailed) && (
                                            <p className='text-xs text-slate-400 mt-0.5'>
                                                {isFailed
                                                    ? (status?.error || 'An unexpected error occurred.')
                                                    : step.desc}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {!done && !failed && !error && (
                        <p className='text-xs text-slate-500 mt-5 text-center'>
                            Auto-refreshing every 10 seconds — installation takes ~10–15 minutes.
                        </p>
                    )}
                </motion.div>

                {/* Credentials — shown only when complete */}
                <AnimatePresence>
                    {done && status?.credentials && (
                        <motion.div
                            key='creds'
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.2 }}
                            className='bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6 mb-6'
                        >
                            <h2 className='text-lg font-bold text-white mb-4 flex items-center gap-2'>
                                <KeyIcon className='w-5 h-5 text-blue-400' />
                                Your Credentials
                            </h2>
                            <div className='space-y-3'>
                                <CredRow
                                    label='Panel URL'
                                    value={status.credentials.panel_url || `https://${status.panel_fqdn}`}
                                    icon={GlobeAltIcon}
                                    link
                                />
                                <CredRow
                                    label='Admin Email'
                                    value={status.credentials.admin_email}
                                    icon={ServerStackIcon}
                                />
                                <CredRow
                                    label='Admin Password'
                                    value={status.credentials.admin_password}
                                    icon={KeyIcon}
                                />
                                {status.wings_fqdn && (
                                    <CredRow
                                        label='Wings FQDN'
                                        value={status.wings_fqdn}
                                        icon={GlobeAltIcon}
                                        link
                                    />
                                )}
                            </div>
                            <div className='mt-5 p-4 rounded-xl bg-white/5 border border-white/10'>
                                <p className='text-xs font-semibold text-slate-300 mb-2'>Next Steps</p>
                                <ol className='text-xs text-slate-400 space-y-1 list-decimal list-inside'>
                                    <li>Log in to your panel with the credentials above.</li>
                                    <li>In <strong className='text-slate-200'>Cloudflare Zero Trust → Tunnels</strong>, add public hostnames for <code className='text-blue-300'>{status.panel_fqdn}</code> (port 80) and <code className='text-blue-300'>{status.wings_fqdn}</code> (port 8080).</li>
                                    <li>Your Wings node will connect automatically within 2 minutes.</li>
                                </ol>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Actions */}
                <div className='flex gap-3 justify-center flex-wrap'>
                    <button
                        type='button'
                        onClick={() => navigate('/')}
                        className='px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all'
                    >
                        ← Back to Dashboard
                    </button>

                    {done && status?.credentials && (
                        <a
                            href={status.credentials.panel_url || `https://${status.panel_fqdn}`}
                            target='_blank'
                            rel='noreferrer'
                            className='px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-2'
                        >
                            Open Panel
                            <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                        </a>
                    )}

                    {failed && (
                        <button
                            type='button'
                            onClick={poll}
                            className='px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-2'
                        >
                            <ArrowPathIcon className='w-4 h-4' />
                            Retry Check
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
