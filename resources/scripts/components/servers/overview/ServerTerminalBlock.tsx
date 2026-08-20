import { useEffect, useState, useRef } from 'react'
import { ServerContext } from '@/state/server'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { CheckIcon, ClipboardDocumentIcon, CommandLineIcon, ArrowPathIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import http from '@/api/http'
import Card from '@/components/elements/Card'

interface TunnelResponse {
    ssh_string: string | null
    status: 'pending' | 'active' | 'offline' | string
    port: number | null
}

const ServerTerminalBlock = () => {
    const serverData = ServerContext.useStoreState(state => state.server.data)
    const serverId = serverData?.id
    const uuid = serverData?.uuid
    const { t } = useTranslation('server.overview')
    const { t: tStrings } = useTranslation('strings')

    const [tunnelStatus, setTunnelStatus] = useState<string | null>(null)
    const [sshString, setSshString] = useState<string | null>(null)
    const [copied, setCopied] = useState<boolean>(false)
    const pollingRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        if (!serverId) return

        let isMounted = true

        const fetchTunnel = async () => {
            try {
                const res = await http.get<TunnelResponse>(`/api/client/servers/${serverId}/tunnel`)
                if (!isMounted) return

                const data = res.data
                const status = data?.status || 'pending'
                const ssh = data?.ssh_string || null

                setTunnelStatus(status)
                setSshString(ssh)

                if (status === 'active' && pollingRef.current) {
                    clearInterval(pollingRef.current)
                    pollingRef.current = null
                }
            } catch (err) {
                console.error('Failed to fetch tunnel info:', err)
                if (isMounted && !tunnelStatus) {
                    setTunnelStatus('pending')
                }
            }
        }

        // Initial fetch on component mount
        fetchTunnel()

        // Poll every 6 seconds while status is pending or offline
        if (pollingRef.current) {
            clearInterval(pollingRef.current)
        }
        pollingRef.current = setInterval(fetchTunnel, 6000)

        return () => {
            isMounted = false
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
            }
        }
    }, [serverId])

    const copySshToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const launch = (type: 'novnc' | 'xtermjs' = 'novnc', popup: boolean = false) => {
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

    const renderStatusBadge = () => {
        if (!tunnelStatus) {
            return (
                <span className='px-2 py-0.5 rounded-md text-[11px] font-semibold bg-neutral-800 text-neutral-400 border border-white/10'>
                    checking...
                </span>
            )
        }

        if (tunnelStatus === 'active') {
            return (
                <span className='px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5'>
                    <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' />
                    active
                </span>
            )
        }

        if (tunnelStatus === 'pending') {
            return (
                <span className='px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5'>
                    <span className='w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping' />
                    pending
                </span>
            )
        }

        return (
            <span className='px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5'>
                <span className='w-1.5 h-1.5 rounded-full bg-rose-400' />
                {tunnelStatus}
            </span>
        )
    }

    return (
        <Card className='relative flex flex-col col-span-10 md:col-span-5 font-sans overflow-hidden'>
            <h5 className='h5'>{t('terminal.title')}</h5>
            <p className='description-small mt-1'>
                {t('terminal.description')}
            </p>

            <div className='flex flex-col space-y-4 mt-6'>
                {/* SSH Reverse Tunnel Direct Connection */}
                <div className='p-4 bg-neutral-900/60 border border-white/10 rounded-xl space-y-3'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-2'>
                            <CommandLineIcon className='w-4 h-4 text-blue-400' />
                            <h6 className='h6 !text-sm font-bold text-white'>SSH Direct Tunnel</h6>
                        </div>
                        {renderStatusBadge()}
                    </div>

                    {tunnelStatus === 'active' && sshString ? (
                        <div className='space-y-2 pt-1'>
                            <p className='text-xs text-stone-300 leading-relaxed'>
                                Connect directly using your SSH client:
                            </p>
                            <div className='flex items-center gap-2 bg-neutral-950/90 border border-emerald-500/30 rounded-lg p-2'>
                                <code className='w-full text-xs font-mono text-emerald-300 px-2 py-1 select-all overflow-x-auto whitespace-nowrap scrollbar-none'>
                                    {sshString}
                                </code>
                                <Button
                                    size='xs'
                                    className='bg-blue-600 hover:bg-blue-500 text-white shrink-0'
                                    onClick={() => copySshToClipboard(sshString)}
                                >
                                    {copied ? (
                                        <span className='flex items-center gap-1 text-emerald-300'>
                                            <CheckIcon className='w-3.5 h-3.5' /> Copied!
                                        </span>
                                    ) : (
                                        <span className='flex items-center gap-1'>
                                            <ClipboardDocumentIcon className='w-3.5 h-3.5' /> Copy
                                        </span>
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className='flex items-center justify-between p-3 bg-neutral-950/60 border border-amber-500/20 rounded-lg'>
                            <div className='flex items-center gap-2.5 text-xs text-amber-300'>
                                <ArrowPathIcon className='w-4 h-4 text-amber-400 animate-spin shrink-0' />
                                <span>Tunnel initializing...</span>
                            </div>
                            <span className='text-[11px] text-stone-400'>Retrying every 6s</span>
                        </div>
                    )}
                </div>

                {/* noVNC Web Console */}
                <div className='p-4 bg-neutral-900/60 border border-white/10 rounded-xl space-y-3'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-2'>
                            <ComputerDesktopIcon className='w-4 h-4 text-indigo-400' />
                            <h6 className='h6 !text-sm font-bold text-white'>noVNC Web Console</h6>
                        </div>
                    </div>
                    <p className='text-xs text-stone-400 leading-relaxed'>
                        {t('terminal.novnc_description')}
                    </p>
                    <Button.Group className='mt-2'>
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
                            title='Open in popup window'
                        >
                            <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                        </Button>
                    </Button.Group>
                </div>
            </div>
        </Card>
    )
}

export default ServerTerminalBlock