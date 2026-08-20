import { useEffect, useState } from 'react'
import { ServerContext } from '@/state/server'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import http from '@/api/http'
import Card from '@/components/elements/Card'

const ServerTerminalBlock = () => {
    const server = ServerContext.useStoreState(state => state.server.data)
    const uuid = server?.uuid
    const { t } = useTranslation('server.overview')
    const { t: tStrings } = useTranslation('strings')

    const [tunnelData, setTunnelData] = useState<{
        ssh_string: string | null
        status: 'pending' | 'active' | 'offline'
        port: number | null
    } | null>(null)

    const [tunnelPolling, setTunnelPolling] = useState(false)

    const pollTunnel = async () => {
        if (!server?.id) return
        setTunnelPolling(true)
        try {
            const { data } = await http.get<{
                ssh_string: string | null
                status: 'pending' | 'active' | 'offline'
                port: number | null
            }>(`/api/client/servers/${server.id}/tunnel`)
            setTunnelData(data)
            if (data.status !== 'active') {
                setTimeout(pollTunnel, 6000)
            }
        } catch (e) {
            setTimeout(pollTunnel, 10000)
        } finally {
            setTunnelPolling(false)
        }
    }

    useEffect(() => {
        pollTunnel()
    }, [server?.id])

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

    return (
        <Card className='relative flex flex-col col-span-10 md:col-span-5 font-sans overflow-hidden'>
            <h5 className='h5'>{t('terminal.title')}</h5>
            <p className='description-small mt-1'>
                {t('terminal.description')}
            </p>

            <div className='flex flex-col space-y-4 mt-6'>
                {/* SSH Tunnel Access Block */}
                <div className='p-4 bg-neutral-900/60 border border-white/10 rounded-xl'>
                    {tunnelData?.status === 'active' && tunnelData.ssh_string ? (
                        <div className='tunnel-access'>
                            <p className='text-sm text-gray-400 mb-1'>SSH Access</p>
                            <div className='flex items-center gap-2'>
                                <code className='bg-gray-900 text-green-400 px-3 py-2 rounded text-sm flex-1 font-mono overflow-x-auto whitespace-nowrap scrollbar-none'>
                                    {tunnelData.ssh_string}
                                </code>
                                <button
                                    onClick={() => navigator.clipboard.writeText(tunnelData.ssh_string!)}
                                    className='px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors shrink-0'
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className='tunnel-pending text-sm text-gray-400'>
                            <span className='animate-pulse text-amber-400'>⬤</span>
                            {' '}Tunnel {tunnelData?.status ?? 'initializing'}...
                            {tunnelData?.status === 'offline' && ' (VM may be stopped)'}
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