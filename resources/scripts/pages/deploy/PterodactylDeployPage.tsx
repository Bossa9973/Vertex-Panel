import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ServerStackIcon,
    GlobeAltIcon,
    KeyIcon,
    EyeIcon,
    EyeSlashIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ClipboardDocumentIcon,
    ClipboardDocumentCheckIcon,
    RocketLaunchIcon,
    ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import {
    submitPterodactylDeploy,
    getPterodactylDeployStatus,
    type PterodactylDeployStatus,
} from '@/api/pterodactylDeploy'

// ── Password generator (alphanum only — matching PasswordHelper::generate) ──
const genPass = (len = 20) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const arr = new Uint8Array(len)
    crypto.getRandomValues(arr)
    return Array.from(arr, b => chars[b % chars.length]).join('')
}

// ── Status step labels ────────────────────────────────────────────────────────
const STEPS: { id: PterodactylDeployStatus['status']; label: string }[] = [
    { id: 'pending', label: 'Order received' },
    { id: 'provisioning', label: 'Provisioning VM' },
    { id: 'installing', label: 'Installing Pterodactyl' },
    { id: 'complete', label: 'Live!' },
]

const stepIndex = (s: PterodactylDeployStatus['status'] | undefined) =>
    STEPS.findIndex(x => x.id === s)

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }
    return (
        <button
            type='button'
            onClick={copy}
            className='ml-2 text-slate-400 hover:text-blue-400 transition-colors'
        >
            {copied ? (
                <ClipboardDocumentCheckIcon className='w-4 h-4 text-green-400' />
            ) : (
                <ClipboardDocumentIcon className='w-4 h-4' />
            )}
        </button>
    )
}

function Field({
    label,
    id,
    value,
    onChange,
    type = 'text',
    required = false,
    placeholder = '',
    hint = '',
    disabled = false,
}: {
    label: string
    id: string
    value: string
    onChange: (v: string) => void
    type?: string
    required?: boolean
    placeholder?: string
    hint?: string
    disabled?: boolean
}) {
    const [show, setShow] = useState(false)
    const isPassword = type === 'password'

    return (
        <div className='flex flex-col gap-1'>
            <label htmlFor={id} className='text-xs font-medium text-slate-400 uppercase tracking-widest'>
                {label} {required && <span className='text-red-400'>*</span>}
            </label>
            <div className='relative'>
                <input
                    id={id}
                    type={isPassword && show ? 'text' : type}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={cn(
                        'w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm px-4 py-2.5',
                        'placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:bg-white/10',
                        'transition-colors',
                        disabled && 'opacity-50 cursor-not-allowed',
                        isPassword && 'pr-10',
                    )}
                />
                {isPassword && (
                    <button
                        type='button'
                        onClick={() => setShow(s => !s)}
                        className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white'
                    >
                        {show ? <EyeSlashIcon className='w-4 h-4' /> : <EyeIcon className='w-4 h-4' />}
                    </button>
                )}
            </div>
            {hint && <p className='text-[11px] text-slate-500'>{hint}</p>}
        </div>
    )
}

function CredentialRow({ label, value }: { label: string; value: string }) {
    return (
        <div className='flex items-start gap-2 py-2 border-b border-white/5 last:border-0'>
            <span className='text-xs text-slate-400 w-36 shrink-0 pt-0.5'>{label}</span>
            <div className='flex items-center gap-1 flex-1 min-w-0'>
                <span className='text-sm font-mono text-white break-all'>{value}</span>
                <CopyButton text={value} />
            </div>
        </div>
    )
}

// ── Main page component ───────────────────────────────────────────────────────

export default function PterodactylDeployPage() {
    // Form state
    const [cfToken, setCfToken] = useState('')
    const [panelFqdn, setPanelFqdn] = useState('')
    const [wingsFqdn, setWingsFqdn] = useState('')
    const [adminEmail, setAdminEmail] = useState('')
    const [adminUsername, setAdminUsername] = useState('')
    const [adminFirstname, setAdminFirstname] = useState('')
    const [adminLastname, setAdminLastname] = useState('')
    const [adminPassword, setAdminPassword] = useState(genPass)
    const [dbPassword, setDbPassword] = useState(genPass)
    const [timezone, setTimezone] = useState('UTC')
    const [nodeName, setNodeName] = useState('Node 1')
    const [nodeMemory, setNodeMemory] = useState('4096')
    const [nodeDisk, setNodeDisk] = useState('51200')
    const [locationShort, setLocationShort] = useState('us1')

    // UI state
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [deployId, setDeployId] = useState<number | null>(null)
    const [status, setStatus] = useState<PterodactylDeployStatus | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [appInstallEnabled, setAppInstallEnabled] = useState<boolean | null>(null)

    useEffect(() => {
        http.get('/api/client/app-install-status')
            .then(res => {
                if (res.data?.data?.enabled !== undefined) {
                    setAppInstallEnabled(Boolean(res.data.data.enabled))
                } else {
                    setAppInstallEnabled(true)
                }
            })
            .catch(() => setAppInstallEnabled(true))
    }, [])

    // Poller
    const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (!deployId) return
        if (status?.status === 'complete' || status?.status === 'failed') return

        pollerRef.current = setInterval(async () => {
            try {
                const s = await getPterodactylDeployStatus(deployId)
                setStatus(s)
                if (s.status === 'complete' || s.status === 'failed') {
                    clearInterval(pollerRef.current!)
                }
            } catch {
                // ignore transient errors
            }
        }, 10_000)

        return () => clearInterval(pollerRef.current!)
    }, [deployId, status?.status])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)

        try {
            const res = await submitPterodactylDeploy({
                cf_tunnel_token: cfToken.trim(),
                panel_fqdn: panelFqdn.trim().replace(/^https?:\/\//, ''),
                wings_fqdn: wingsFqdn.trim().replace(/^https?:\/\//, ''),
                admin_email: adminEmail.trim(),
                admin_username: adminUsername.trim(),
                admin_firstname: adminFirstname.trim(),
                admin_lastname: adminLastname.trim(),
                admin_password: adminPassword,
                db_password: dbPassword,
                timezone,
                node_name: nodeName,
                node_memory: parseInt(nodeMemory, 10),
                node_disk: parseInt(nodeDisk, 10),
                location_short: locationShort.trim(),
            })
            setDeployId(res.deploy_id)
            setStatus({ status: 'pending', panel_fqdn: panelFqdn, wings_fqdn: wingsFqdn, error: null })
        } catch (e: any) {
            setError(
                e.response?.data?.message ||
                Object.values(e.response?.data?.errors ?? {})?.[0]?.[0] ||
                'Failed to submit deploy order.'
            )
        } finally {
            setSubmitting(false)
        }
    }

    const currentStep = stepIndex(status?.status)

    return (
        <div className='min-h-screen bg-black text-white px-4 py-12'>
            <div className='max-w-2xl mx-auto'>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className='text-center mb-10'
                >
                    <div className='inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-xs text-blue-400 font-medium uppercase tracking-widest'>
                        <RocketLaunchIcon className='w-3.5 h-3.5' />
                        One-Click Deploy
                    </div>
                    <h1 className='text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent'>
                        Pterodactyl Auto-Deploy
                    </h1>
                    <p className='mt-3 text-sm text-slate-400 max-w-md mx-auto'>
                        Fill in your Cloudflare Tunnel token and domain — we handle the rest.
                        No IPv4 required.
                    </p>
                </motion.div>

                {/* ── App Installation Disabled Notice ── */}
                {appInstallEnabled === false && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 sm:p-8 text-center space-y-4'
                    >
                        <div className='w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto'>
                            <ExclamationTriangleIcon className='w-6 h-6' />
                        </div>
                        <h2 className='text-xl font-bold text-white'>1-Click App Auto-Installation Disabled</h2>
                        <p className='text-sm text-slate-300 max-w-md mx-auto'>
                            Application auto-installations are currently disabled by the system administrator. You can still deploy standard Linux VPS instances from the main dashboard.
                        </p>
                        <div className='pt-2'>
                            <a
                                href='/'
                                className='inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition'
                            >
                                Back to Dashboard &rarr;
                            </a>
                        </div>
                    </motion.div>
                )}

                {/* ── Deploy Form ── */}
                {!deployId && appInstallEnabled !== false && (
                    <motion.form
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        onSubmit={handleSubmit}
                        className='rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 space-y-6'
                    >
                        {/* Cloudflare */}
                        <div className='space-y-4'>
                            <div className='flex items-center gap-2 pb-2 border-b border-white/10'>
                                <GlobeAltIcon className='w-4 h-4 text-orange-400' />
                                <span className='text-sm font-semibold text-orange-400'>Cloudflare Tunnel</span>
                            </div>
                            <Field
                                id='cf_tunnel_token'
                                label='Tunnel Token'
                                value={cfToken}
                                onChange={setCfToken}
                                type='password'
                                required
                                placeholder='eyJhIjoiYW.......NiJ9'
                                hint='Zero Trust → Tunnels → Create tunnel → copy the token from the "Install connector" step.'
                            />
                            <div className='grid sm:grid-cols-2 gap-4'>
                                <Field
                                    id='panel_fqdn'
                                    label='Panel Domain'
                                    value={panelFqdn}
                                    onChange={setPanelFqdn}
                                    required
                                    placeholder='panel.yourdomain.com'
                                    hint='No https:// prefix'
                                />
                                <Field
                                    id='wings_fqdn'
                                    label='Wings Domain'
                                    value={wingsFqdn}
                                    onChange={setWingsFqdn}
                                    required
                                    placeholder='wings.yourdomain.com'
                                    hint='Separate subdomain for Wings'
                                />
                            </div>
                        </div>

                        {/* Admin account */}
                        <div className='space-y-4'>
                            <div className='flex items-center gap-2 pb-2 border-b border-white/10'>
                                <KeyIcon className='w-4 h-4 text-blue-400' />
                                <span className='text-sm font-semibold text-blue-400'>Admin Account</span>
                            </div>
                            <div className='grid sm:grid-cols-2 gap-4'>
                                <Field
                                    id='admin_email'
                                    label='Email'
                                    value={adminEmail}
                                    onChange={setAdminEmail}
                                    type='email'
                                    required
                                    placeholder='admin@example.com'
                                />
                                <Field
                                    id='admin_username'
                                    label='Username'
                                    value={adminUsername}
                                    onChange={setAdminUsername}
                                    required
                                    placeholder='admin'
                                />
                                <Field
                                    id='admin_firstname'
                                    label='First Name'
                                    value={adminFirstname}
                                    onChange={setAdminFirstname}
                                    required
                                    placeholder='Alex'
                                />
                                <Field
                                    id='admin_lastname'
                                    label='Last Name'
                                    value={adminLastname}
                                    onChange={setAdminLastname}
                                    required
                                    placeholder='Smith'
                                />
                            </div>

                            <div className='grid sm:grid-cols-2 gap-4'>
                                <div className='flex flex-col gap-1'>
                                    <Field
                                        id='admin_password'
                                        label='Admin Password'
                                        value={adminPassword}
                                        onChange={setAdminPassword}
                                        type='password'
                                        required
                                        placeholder='auto-generated'
                                    />
                                    <button
                                        type='button'
                                        onClick={() => setAdminPassword(genPass())}
                                        className='text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 w-fit'
                                    >
                                        <ArrowPathIcon className='w-3 h-3' /> Regenerate
                                    </button>
                                </div>
                                <div className='flex flex-col gap-1'>
                                    <Field
                                        id='db_password'
                                        label='DB Password'
                                        value={dbPassword}
                                        onChange={setDbPassword}
                                        type='password'
                                        required
                                        placeholder='auto-generated'
                                    />
                                    <button
                                        type='button'
                                        onClick={() => setDbPassword(genPass())}
                                        className='text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 w-fit'
                                    >
                                        <ArrowPathIcon className='w-3 h-3' /> Regenerate
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Advanced toggle */}
                        <div>
                            <button
                                type='button'
                                onClick={() => setShowAdvanced(s => !s)}
                                className='flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors'
                            >
                                <ChevronDownIcon
                                    className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-180')}
                                />
                                Advanced options
                            </button>
                            <AnimatePresence>
                                {showAdvanced && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className='overflow-hidden'
                                    >
                                        <div className='grid sm:grid-cols-2 gap-4 mt-4'>
                                            <Field
                                                id='node_name'
                                                label='Node Name'
                                                value={nodeName}
                                                onChange={setNodeName}
                                                placeholder='Node 1'
                                            />
                                            <Field
                                                id='location_short'
                                                label='Location Short'
                                                value={locationShort}
                                                onChange={setLocationShort}
                                                placeholder='us1'
                                                hint='Short code, e.g. eu1, us1'
                                            />
                                            <Field
                                                id='node_memory'
                                                label='Node Memory (MiB)'
                                                value={nodeMemory}
                                                onChange={setNodeMemory}
                                                placeholder='4096'
                                            />
                                            <Field
                                                id='node_disk'
                                                label='Node Disk (MiB)'
                                                value={nodeDisk}
                                                onChange={setNodeDisk}
                                                placeholder='51200'
                                            />
                                            <Field
                                                id='timezone'
                                                label='Timezone'
                                                value={timezone}
                                                onChange={setTimezone}
                                                placeholder='UTC'
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Error */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className='flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300'
                            >
                                <ExclamationTriangleIcon className='w-4 h-4 mt-0.5 shrink-0' />
                                {error}
                            </motion.div>
                        )}

                        <button
                            type='submit'
                            disabled={submitting}
                            className={cn(
                                'w-full rounded-xl py-3 px-6 font-semibold text-sm transition-all',
                                'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400',
                                'shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                            )}
                        >
                            {submitting ? (
                                <span className='flex items-center justify-center gap-2'>
                                    <ArrowPathIcon className='w-4 h-4 animate-spin' />
                                    Submitting…
                                </span>
                            ) : (
                                <span className='flex items-center justify-center gap-2'>
                                    <RocketLaunchIcon className='w-4 h-4' />
                                    Deploy Pterodactyl
                                </span>
                            )}
                        </button>
                    </motion.form>
                )}

                {/* ── Status tracker ── */}
                {deployId && status && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className='rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 space-y-8'
                    >
                        {/* Progress steps */}
                        <div className='space-y-3'>
                            <h2 className='text-sm font-semibold text-slate-300 uppercase tracking-wider'>
                                Install Progress
                            </h2>
                            <ol className='space-y-2'>
                                {STEPS.filter(s => s.id !== 'failed').map((step, i) => {
                                    const done    = i < currentStep
                                    const active  = i === currentStep
                                    const failed  = status.status === 'failed' && i === currentStep
                                    return (
                                        <li key={step.id} className='flex items-center gap-3'>
                                            <div
                                                className={cn(
                                                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border',
                                                    done   && 'bg-green-500/20 border-green-500 text-green-400',
                                                    active && !failed && 'bg-blue-500/20 border-blue-500 text-blue-400',
                                                    failed && 'bg-red-500/20 border-red-500 text-red-400',
                                                    !done && !active && 'bg-white/5 border-white/10 text-slate-600',
                                                )}
                                            >
                                                {done ? (
                                                    <CheckCircleIcon className='w-4 h-4 text-green-400' />
                                                ) : active && !failed ? (
                                                    <ArrowPathIcon className='w-3.5 h-3.5 animate-spin' />
                                                ) : failed ? (
                                                    <ExclamationTriangleIcon className='w-3.5 h-3.5' />
                                                ) : (
                                                    i + 1
                                                )}
                                            </div>
                                            <span
                                                className={cn(
                                                    'text-sm',
                                                    done   && 'text-green-400',
                                                    active && !failed && 'text-white font-medium',
                                                    failed && 'text-red-400',
                                                    !done && !active && 'text-slate-600',
                                                )}
                                            >
                                                {step.label}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ol>
                        </div>

                        {/* Error state */}
                        {status.status === 'failed' && status.error && (
                            <div className='rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300'>
                                <p className='font-semibold mb-1'>Deploy failed</p>
                                <p className='font-mono text-xs opacity-80'>{status.error}</p>
                            </div>
                        )}

                        {/* In-progress message */}
                        {(status.status === 'provisioning' || status.status === 'installing' || status.status === 'pending') && (
                            <div className='text-sm text-slate-400 text-center'>
                                Installation takes ~10–15 minutes. We'll email you when it's done.
                                <br />
                                <span className='text-xs text-slate-600'>
                                    This page auto-refreshes every 10 seconds.
                                </span>
                            </div>
                        )}

                        {/* Credentials — only visible when complete */}
                        <AnimatePresence>
                            {status.status === 'complete' && status.credentials && (
                                <motion.div
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className='space-y-4'
                                >
                                    <div className='flex items-center gap-2'>
                                        <CheckCircleIcon className='w-5 h-5 text-green-400' />
                                        <h2 className='text-base font-semibold text-green-400'>
                                            Your panel is live!
                                        </h2>
                                    </div>

                                    <div className='rounded-xl border border-white/10 bg-white/5 px-4 py-3 divide-y divide-white/5'>
                                        <CredentialRow
                                            label='Panel URL'
                                            value={status.credentials.panel_url}
                                        />
                                        <CredentialRow
                                            label='Admin Email'
                                            value={status.credentials.admin_email}
                                        />
                                        <CredentialRow
                                            label='Admin Password'
                                            value={status.credentials.admin_password}
                                        />
                                        <CredentialRow
                                            label='Node ID'
                                            value={String(status.credentials.node_id)}
                                        />
                                        <CredentialRow
                                            label='Wings Status'
                                            value={status.credentials.node_status}
                                        />
                                    </div>

                                    <div className='rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400 space-y-1'>
                                        <p className='font-semibold'>⚠ Cloudflare DNS setup required</p>
                                        <p>
                                            Go to <strong>Zero Trust → Tunnels → Public Hostnames</strong> and add:
                                        </p>
                                        <ul className='list-disc list-inside space-y-0.5 font-mono text-[11px]'>
                                            <li><strong>{status.panel_fqdn}</strong> → http://localhost:80</li>
                                            <li><strong>{status.wings_fqdn}</strong> → http://localhost:8080</li>
                                            <li>
                                                TCP: <strong>{status.wings_fqdn}:2022</strong> → tcp://localhost:2022
                                            </li>
                                        </ul>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>
        </div>
    )
}
