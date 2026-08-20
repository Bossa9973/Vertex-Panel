import { useEffect, useRef, useState } from 'react'
import { ServerContext } from '@/state/server'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { ComputerDesktopIcon, CommandLineIcon, BoltIcon } from '@heroicons/react/24/outline'
import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import http from '@/api/http'
import Card from '@/components/elements/Card'

interface TunnelData {
    ssh_string: string | null
    status: 'pending' | 'active' | 'offline'
    port: number | null
}

interface TmateData {
    ssh_cmd: string | null
    url: string | null
    notice?: string
    restricted?: boolean
    remaining_seconds?: number
    server_vmid?: number
    server_uuid?: string
    server_name?: string
}

type TerminalMode = 'both' | 'sshx'

const ServerTerminalBlock = () => {
    const server = ServerContext.useStoreState(state => state.server.data!)
    const uuid = server.uuid
    const { t } = useTranslation('server.overview')
    const { t: tStrings } = useTranslation('strings')

    // SSH tunnel state — only relevant when coterm is not configured (no xtermjs)
    const [tunnelData, setTunnelData] = useState<TunnelData | null>(null)
    const [copied, setCopied] = useState(false)
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const mountedRef = useRef(true)

    // Admin-configured terminal mode
    const [terminalMode, setTerminalMode] = useState<TerminalMode>('both')
    const [modeLoading, setModeLoading] = useState(true)

    // tmate session state (for sshx mode)
    const [tmateData, setTmateData] = useState<TmateData | null>(null)
    const [tmateLoading, setTmateLoading] = useState(false)
    const [tmateCopied, setTmateCopied] = useState(false)

    // Coterm is attached to the node — if cotermId is set, xterm.js is backed by coterm.
    // We show the SSH tunnel block only when coterm is not configured (cotermId is null).
    const hasCotermOrXterm = (server as any).node?.cotermId !== null

    const launch = (useXterm: boolean = false, popup: boolean = false) => {
        const type = useXterm ? 'xtermjs' : 'novnc'
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const copyTmateToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setTmateCopied(true)
        setTimeout(() => setTmateCopied(false), 2000)
    }

    const pollTunnel = async () => {
        if (!uuid) return
        try {
            const { data } = await http.get<TunnelData>(`/api/client/servers/${uuid}/tunnel`)
            if (!mountedRef.current) return
            setTunnelData(data)
            if (data.status !== 'active') {
                pollRef.current = setTimeout(pollTunnel, 6000)
            }
        } catch {
            if (mountedRef.current) {
                pollRef.current = setTimeout(pollTunnel, 10000)
            }
        }
    }

    const requestTmateSession = async () => {
        if (tmateLoading) return
        setTmateLoading(true)
        setTmateData(null)
        try {
            const { data } = await http.post<{ success: boolean; data: TmateData }>(`/api/client/servers/${uuid}/tmate-session`)
            if (mountedRef.current) {
                setTmateData(data.data)
            }
        } catch (err: any) {
            if (mountedRef.current) {
                setTmateData({
                    ssh_cmd: null,
                    url: null,
                    notice: err?.response?.data?.errors?.[0]?.detail ?? 'Failed to create tmate session. Please try again.',
                    restricted: false,
                })
            }
        } finally {
            if (mountedRef.current) {
                setTmateLoading(false)
            }
        }
    }

    useEffect(() => {
        mountedRef.current = true

        // Fetch admin-configured terminal mode
        http.get<{ success: boolean; data: { mode: TerminalMode } }>(`/api/client/servers/${uuid}/terminal-mode`)
            .then(({ data }) => {
                if (mountedRef.current) {
                    setTerminalMode(data.data?.mode ?? 'both')
                }
            })
            .catch(() => {
                // Default to 'both' on error
            })
            .finally(() => {
                if (mountedRef.current) setModeLoading(false)
            })

        // Only poll tunnel if coterm/xterm is not available — SSH is the fallback terminal access
        if (!hasCotermOrXterm) {
            pollTunnel()
        }

        return () => {
            mountedRef.current = false
            if (pollRef.current) clearTimeout(pollRef.current)
        }
    }, [uuid])

    return (
        <Card className='relative flex flex-col col-span-10 md:col-span-5 font-sans overflow-hidden'>
            <h5 className='h5'>{t('terminal.title')}</h5>
            <p className='description-small mt-1'>
                {t('terminal.description')}
            </p>

            <div className='flex flex-col space-y-4 mt-6'>
                {!modeLoading && terminalMode === 'sshx' ? (
                    /* ── tmate SSH Mode (admin set "Only tmate") ── */
                    <div className='p-4 bg-neutral-900/60 border border-indigo-500/20 rounded-xl space-y-3'>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-2'>
                                <BoltIcon className='w-4 h-4 text-indigo-400' />
                                <h6 className='h6 !text-sm font-bold text-white'>tmate SSH Session</h6>
                                <span className='px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'>
                                    Instant
                                </span>
                            </div>
                            {tmateCopied && <span className='text-emerald-400 text-xs font-bold'>✓ Copied!</span>}
                        </div>
                        <p className='text-xs text-stone-400 leading-relaxed'>
                            Spawn a live tmate terminal session inside your VM via the QEMU Guest Agent. Copy the SSH command to connect instantly from your local terminal.
                        </p>

                        {/* Notice / cooldown message */}
                        {tmateData?.notice && !tmateData.ssh_cmd && (
                            <div className={`text-xs px-3 py-2.5 rounded-lg border font-medium ${
                                tmateData.restricted
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            }`}>
                                {tmateData.notice}
                                {tmateData.remaining_seconds && (
                                    <span className='ml-1 font-bold'> ({tmateData.remaining_seconds}s)</span>
                                )}
                            </div>
                        )}

                        {/* SSH command display */}
                        {tmateData?.ssh_cmd && (
                            <div className='flex items-center gap-2'>
                                <input
                                    type='text'
                                    readOnly
                                    value={tmateData.ssh_cmd}
                                    className='w-full text-xs font-mono bg-neutral-950 border border-white/10 rounded-lg px-3 py-2.5 text-indigo-300 select-all focus:outline-none'
                                />
                                <button
                                    type='button'
                                    className='px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0'
                                    onClick={() => copyTmateToClipboard(tmateData.ssh_cmd!)}
                                >
                                    Copy
                                </button>
                            </div>
                        )}

                        <Button
                            fullWidth
                            variant='outline'
                            color='indigo'
                            loading={tmateLoading}
                            onClick={requestTmateSession}
                            leftSection={<BoltIcon className='w-4 h-4' />}
                        >
                            {tmateData?.ssh_cmd ? 'Refresh Session' : 'Launch tmate Session'}
                        </Button>
                    </div>
                ) : !modeLoading ? (
                    <>
                        {/* noVNC Web Console */}
                        <div className='p-4 bg-neutral-900/60 border border-white/10 rounded-xl space-y-3'>
                            <div className='flex items-center gap-2'>
                                <ComputerDesktopIcon className='w-4 h-4 text-indigo-400' />
                                <h6 className='h6 !text-sm font-bold text-white'>noVNC Web Console</h6>
                            </div>
                            <p className='text-xs text-stone-400 leading-relaxed'>
                                {t('terminal.novnc_description')}
                            </p>
                            <Button.Group className='mt-2'>
                                <Button
                                    className='grow'
                                    variant='outline'
                                    onClick={() => launch(false)}
                                >
                                    {tStrings('launch')}
                                </Button>
                                <Button
                                    variant='outline'
                                    onClick={() => launch(false, true)}
                                    title='Open in popup window'
                                >
                                    <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                                </Button>
                            </Button.Group>
                        </div>

                        {/* xterm.js SSH Console */}
                        <div className='p-4 bg-neutral-900/60 border border-white/10 rounded-xl space-y-3'>
                            <div className='flex items-center gap-2'>
                                <CommandLineIcon className='w-4 h-4 text-emerald-400' />
                                <h6 className='h6 !text-sm font-bold text-white'>xterm.js Console</h6>
                            </div>
                            <p className='text-xs text-stone-400 leading-relaxed'>
                                {t('terminal.xtermjs_description')}
                            </p>
                            <Button.Group className='mt-2'>
                                <Button
                                    className='grow'
                                    variant='outline'
                                    onClick={() => launch(true)}
                                >
                                    {tStrings('launch')}
                                </Button>
                                <Button
                                    variant='outline'
                                    onClick={() => launch(true, true)}
                                    title='Open in popup window'
                                >
                                    <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                                </Button>
                            </Button.Group>
                        </div>
                    </>
                ) : null}

                {/* SSH Tunnel Access — shown only when coterm is not configured and tunnel is active */}
                {!hasCotermOrXterm && tunnelData?.status === 'active' && tunnelData.ssh_string && (
                    <div className='p-4 bg-neutral-900/60 border border-emerald-500/20 rounded-xl space-y-3'>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-2'>
                                <span className='w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse' />
                                <h6 className='h6 !text-sm font-bold text-white'>SSH Access</h6>
                            </div>
                            {copied && <span className='text-emerald-400 text-xs font-bold'>✓ Copied!</span>}
                        </div>
                        <p className='text-xs text-stone-400 leading-relaxed'>
                            Run this command in your terminal to connect directly to this server via SSH.
                        </p>
                        <div className='flex items-center gap-2'>
                            <input
                                type='text'
                                readOnly
                                value={tunnelData.ssh_string}
                                className='w-full text-xs font-mono bg-neutral-950 border border-white/10 rounded-lg px-3 py-2.5 text-blue-300 select-all focus:outline-none'
                            />
                            <button
                                type='button'
                                className='px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0'
                                onClick={() => copyToClipboard(tunnelData.ssh_string!)}
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    )
}

export default ServerTerminalBlock