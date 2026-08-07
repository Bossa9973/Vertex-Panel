import { useEffect, useState } from 'react'
import { ServerContext } from '@/state/server'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { CheckIcon, ClipboardDocumentIcon, SparklesIcon, CommandLineIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { Button, Modal } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import http from '@/api/http'
import Card from '@/components/elements/Card'

const ServerTerminalBlock = () => {
    const serverData = ServerContext.useStoreState(state => state.server.data)
    const uuid = serverData!.uuid
    const rawCreatedAt = (serverData as any)?.createdAt || (serverData as any)?.created_at
    const statusData = ServerContext.useStoreState(state => state.status.data)
    const serverLockdown = statusData?.lockdownSecondsRemaining || 0
    const { t } = useTranslation('server.overview')
    const { t: tStrings } = useTranslation('strings')

    const [terminalMode, setTerminalMode] = useState<'both' | 'sshx'>('both')
    const [sshCmd, setSshCmd] = useState<string | null>(null)
    const [tmateLoading, setTmateLoading] = useState<boolean>(false)
    const [modalOpened, setModalOpened] = useState<boolean>(false)
    const [copiedSsh, setCopiedSsh] = useState<boolean>(false)
    const [secondsLeft, setSecondsLeft] = useState<number>(0)
    const [powerLockSeconds, setPowerLockSeconds] = useState<number>(0)

    // Initial 5-minute boot lock
    useEffect(() => {
        if (!rawCreatedAt) return

        const calculateRemaining = () => {
            const createdMs = rawCreatedAt instanceof Date ? rawCreatedAt.getTime() : new Date(rawCreatedAt).getTime()
            if (isNaN(createdMs)) return 0
            const elapsedSeconds = Math.floor((Date.now() - createdMs) / 1000)
            return Math.max(0, 300 - elapsedSeconds)
        }

        const initial = calculateRemaining()
        setSecondsLeft(initial)

        if (initial <= 0) return

        const timer = setInterval(() => {
            const remaining = calculateRemaining()
            setSecondsLeft(remaining)
            if (remaining <= 0) {
                clearInterval(timer)
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [rawCreatedAt])

    // 30-second power lockdown timer
    useEffect(() => {
        if (!uuid) return

        const updateLockRemaining = () => {
            const lockUntilStr = localStorage.getItem(`power_lock_until_${uuid}`)
            let localRemaining = 0
            if (lockUntilStr) {
                const lockUntil = parseInt(lockUntilStr, 10)
                if (!isNaN(lockUntil)) {
                    localRemaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000))
                }
            }

            const activeLock = Math.max(localRemaining, serverLockdown)
            setPowerLockSeconds(activeLock)
        }

        updateLockRemaining()

        const timer = setInterval(() => {
            updateLockRemaining()
        }, 1000)

        return () => clearInterval(timer)
    }, [uuid, serverLockdown])

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60)
        const s = secs % 60
        return `${m}:${s < 10 ? '0' : ''}${s}`
    }

    useEffect(() => {
        http.get('/api/terminal-mode')
            .then(res => {
                if (res.data?.data?.mode) {
                    setTerminalMode(res.data.data.mode)
                }
            })
            .catch(() => {})
    }, [])

    const handleFetchTmateSession = async () => {
        const totalLock = Math.max(secondsLeft, powerLockSeconds)
        if (totalLock > 0) return

        setTmateLoading(true)
        try {
            const res = await http.post(`/api/client/servers/${uuid}/create-sshx-session`)
            if (res.data?.data) {
                const data = res.data.data
                if (data.restricted) {
                    setSshCmd(null)
                    if (data.remaining_seconds) {
                        const lockUntil = Date.now() + data.remaining_seconds * 1000
                        localStorage.setItem(`power_lock_until_${uuid}`, String(lockUntil))
                        setPowerLockSeconds(data.remaining_seconds)
                    }
                    return
                }
                const cmd = data.ssh_cmd || data.url
                if (cmd) {
                    setSshCmd(cmd)
                    setModalOpened(true)
                }
            }
        } catch (err: any) {
            console.error('Failed to fetch tmate session:', err)
            const errorMsg = err?.response?.data?.errors?.[0]?.detail || err?.response?.data?.message || err?.message || 'Error executing Proxmox guest agent request.'
            setSshCmd(`Error: ${errorMsg}`)
            setModalOpened(true)
        } finally {
            setTmateLoading(false)
        }
    }

    const copySshToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopiedSsh(true)
        setTimeout(() => setCopiedSsh(false), 2000)
    }

    const launch = (type: 'novnc' | 'xtermjs' | 'sshx' = 'novnc', popup: boolean = false) => {
        if (type === 'sshx') {
            handleFetchTmateSession()
            return
        }

        if (popup) {
            window.open(
                `/servers/${uuid}/terminal?type=${type}`,
                'Terminal',
                'width=800,height=600'
            )
        } else {
            window.open(
                `/servers/${uuid}/terminal?type=${type}`,
                '_blank'
            )
        }
    }

    const totalLock = Math.max(secondsLeft, powerLockSeconds)
    const isLocked = totalLock > 0

    return (
        <>
            <Card className='relative flex flex-col col-span-10 md:col-span-5 font-sans overflow-hidden'>
                {/* 5-minute Liquid Glass Blur Full Component Popup Overlay after Deploy */}
                {secondsLeft > 0 && (
                    <div className='absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-neutral-950/85 via-blue-950/70 to-neutral-950/90 backdrop-blur-xl border border-blue-500/30 rounded-2xl shadow-2xl transition-all duration-300 space-y-4 overflow-hidden'>
                        {/* Abstract Radial Glow Backgrounds */}
                        <div className='absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl pointer-events-none' />
                        <div className='absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-amber-500/15 blur-3xl pointer-events-none' />

                        {/* Animated Glass Badge Icon */}
                        <div className='relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-amber-500/20 border border-blue-400/40 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)] backdrop-blur-md animate-pulse z-10'>
                            <SparklesIcon className='h-7 w-7 text-blue-400' />
                        </div>

                        {/* Title & Explanation */}
                        <div className='relative z-10 space-y-1.5 max-w-sm'>
                            <h6 className='text-lg font-extrabold text-white tracking-tight flex items-center justify-center gap-2'>
                                Initial Cloud-Init Provisioning
                            </h6>
                            <p className='text-xs text-slate-300 leading-relaxed font-sans'>
                                Terminal access is temporarily locked behind this boot shield for the first 5 minutes post-deployment to ensure Cloud-Init finishes initial OS package setup cleanly before accepting connections.
                            </p>
                        </div>

                        {/* Countdown Pill */}
                        <div className='relative z-10 flex items-center gap-2.5 px-4 py-2 rounded-full bg-neutral-900/90 border border-amber-500/40 shadow-lg shadow-amber-950/50 backdrop-blur-md'>
                            <span className='w-2 h-2 rounded-full bg-amber-400 animate-ping' />
                            <span className='text-[11px] font-bold text-slate-300 uppercase tracking-wider'>Unlocks In:</span>
                            <span className='font-mono font-extrabold text-sm text-amber-400 tracking-widest'>
                                {formatTime(secondsLeft)}
                            </span>
                        </div>
                    </div>
                )}

                <h5 className='h5'>{t('terminal.title')}</h5>
                <p className='description-small mt-1'>
                    {t('terminal.description')}
                </p>

                {terminalMode === 'sshx' ? (
                    <div className='grid lg:grid-cols-1 mt-6 space-y-4'>
                        <div className='flex flex-col justify-between py-2'>
                            <div>
                                <div className='flex items-center gap-2'>
                                    <h6 className='h6'>tmate Terminal</h6>
                                    <span className='px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center gap-1'>
                                        <SparklesIcon className='w-3 h-3 text-indigo-400' /> Live Session
                                    </span>
                                </div>
                                <p className='description-small mt-1 leading-relaxed'>
                                    On-demand SSH terminal session powered by <a href="https://tmate.io" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">tmate.io</a>.
                                </p>
                            </div>

                            {isLocked && (
                                <div className='mt-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-300 space-y-1 animate-pulse'>
                                    <div className='font-bold flex items-center gap-1.5'>
                                        <LockClosedIcon className='w-4 h-4 text-amber-400' />
                                        <span>Boot / Power Action Lock</span>
                                        <span className='ml-auto font-mono text-amber-200 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30'>
                                            {formatTime(totalLock)} remaining
                                        </span>
                                    </div>
                                    <p className='text-[11px] text-amber-300/80 leading-snug'>
                                        tmate terminal sessions are locked for 30 seconds after server boot or power actions to ensure QEMU guest agent and system services initialize cleanly.
                                    </p>
                                </div>
                            )}

                            {sshCmd && (
                                <div className='mt-4 p-3.5 bg-neutral-950/90 border border-indigo-500/30 rounded-xl space-y-3'>
                                    <div className='text-xs font-bold text-indigo-300 flex items-center justify-between'>
                                        <span className='flex items-center gap-1.5'>
                                            <CommandLineIcon className='w-4 h-4 text-blue-400' /> Active SSH Command:
                                        </span>
                                        {copiedSsh && <span className='text-emerald-400 flex items-center gap-1 text-xs'><CheckIcon className='w-3 h-3' /> Copied!</span>}
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <input
                                            type='text'
                                            readOnly
                                            value={sshCmd}
                                            className='w-full text-xs font-mono bg-neutral-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-blue-300 select-all focus:outline-none'
                                        />
                                        <Button
                                            size='xs'
                                            className='bg-blue-600 hover:bg-blue-500 text-white shrink-0'
                                            onClick={() => copySshToClipboard(sshCmd)}
                                        >
                                            <ClipboardDocumentIcon className='w-3.5 h-3.5 mr-1' /> Copy SSH
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <Button.Group className='mt-5'>
                                <Button
                                    className='grow'
                                    variant='outline'
                                    loading={tmateLoading}
                                    disabled={tmateLoading || isLocked}
                                    onClick={handleFetchTmateSession}
                                >
                                    {isLocked
                                        ? `tmate Restricted (${formatTime(totalLock)})`
                                        : (sshCmd ? 'View tmate SSH Command' : 'Fetch tmate SSH Session')}
                                </Button>
                                <Button
                                    variant='outline'
                                    disabled={tmateLoading || isLocked}
                                    onClick={handleFetchTmateSession}
                                    title={isLocked ? `Locked during boot / power action (${formatTime(totalLock)})` : 'Fetch tmate session'}
                                >
                                    <CommandLineIcon className='w-4 h-4' />
                                </Button>
                            </Button.Group>
                        </div>
                    </div>
                ) : (
                    <div className='grid lg:grid-cols-2 mt-6'>
                        <div className='flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-accent-200 lg:pr-5 pb-5 lg:py-5'>
                            <div>
                                <h6 className='h6'>noVNC</h6>
                                <p className='description-small mt-1'>
                                    {t('terminal.novnc_description')}
                                </p>
                            </div>
                            <Button.Group className='mt-6'>
                                <Button
                                    className='grow'
                                    variant='outline'
                                    onClick={() => launch('novnc')}
                                >
                                    {tStrings('launch')}
                                </Button>
                                <Button
                                    variant='outline'
                                    onClick={() => launch('novnc', true)}
                                >
                                    <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                                </Button>
                            </Button.Group>
                        </div>
                        <div className='flex flex-col justify-between lg:pl-5 pt-5 lg:py-5'>
                            <div>
                                <h6 className='h6'>xTerm.js</h6>
                                <p className='description-small mt-1'>
                                    {t('terminal.xtermjs_description')}
                                </p>
                            </div>
                            <Button.Group className='mt-6'>
                                <Button
                                    variant='outline'
                                    className='grow'
                                    onClick={() => launch('xtermjs')}
                                >
                                    {tStrings('launch')}
                                </Button>
                                <Button
                                    variant='outline'
                                    onClick={() => launch('xtermjs', true)}
                                >
                                    <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                                </Button>
                            </Button.Group>
                        </div>
                    </div>
                )}
            </Card>

            {/* tmate SSH Session Details Modal */}
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title={
                    <div className='flex items-center gap-2 font-bold text-white text-base'>
                        <CommandLineIcon className='w-5 h-5 text-indigo-400' />
                        <span>tmate SSH Connection</span>
                    </div>
                }
                centered
                size='md'
                styles={{
                    modal: {
                        backgroundColor: '#121418',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '16px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    },
                    header: {
                        backgroundColor: 'transparent',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    },
                }}
            >
                {sshCmd && (
                    <div className='space-y-5 font-sans pt-2'>
                        <p className='text-xs text-gray-300 leading-relaxed'>
                            Copy and paste the SSH command below into your terminal application to connect directly to this VPS instance.
                        </p>

                        {/* SSH Command Box */}
                        <div className='bg-neutral-950 p-4 rounded-xl border border-white/10 space-y-2'>
                            <div className='flex items-center justify-between text-xs font-bold text-gray-200'>
                                <span className='flex items-center gap-1.5'>
                                    <CommandLineIcon className='w-4 h-4 text-blue-400' /> SSH Command:
                                </span>
                                {copiedSsh && (
                                    <span className='text-emerald-400 flex items-center gap-1 text-xs'>
                                        <CheckIcon className='w-3.5 h-3.5' /> Copied!
                                    </span>
                                )}
                            </div>
                            <div className='flex items-center gap-2'>
                                <input
                                    type='text'
                                    readOnly
                                    value={sshCmd}
                                    className='w-full text-xs font-mono bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-blue-300 select-all focus:outline-none'
                                />
                                <Button
                                    size='sm'
                                    className='bg-blue-600 hover:bg-blue-500 text-white shrink-0'
                                    onClick={() => copySshToClipboard(sshCmd)}
                                >
                                    <ClipboardDocumentIcon className='w-4 h-4 mr-1.5' /> Copy SSH
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    )
}

export default ServerTerminalBlock