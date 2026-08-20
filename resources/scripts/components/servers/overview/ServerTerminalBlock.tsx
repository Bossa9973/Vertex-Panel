import { useEffect, useRef, useState } from 'react'
import { ServerContext } from '@/state/server'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { ComputerDesktopIcon, CommandLineIcon } from '@heroicons/react/24/outline'
import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import http from '@/api/http'
import Card from '@/components/elements/Card'

interface TunnelData {
    ssh_string: string | null
    status: 'pending' | 'active' | 'offline'
    port: number | null
}

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

    useEffect(() => {
        mountedRef.current = true
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