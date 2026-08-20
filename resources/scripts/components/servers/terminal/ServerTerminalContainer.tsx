import { ServerContext } from '@/state/server'
import { useFlashKey } from '@/util/useFlash'
import { useEffect, useRef, useState } from 'react'
import http from '@/api/http'
import ServerContentBlock from '@/components/servers/ServerContentBlock'

interface TunnelData {
    ssh_string: string | null
    status: 'pending' | 'active' | 'offline'
    port: number | null
}

const ServerTerminalContainer = () => {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid)
    const { clearAndAddHttpError } = useFlashKey(`servers.${uuid}.console`)

    const [tunnelData, setTunnelData] = useState<TunnelData | null>(null)
    const [copied, setCopied] = useState(false)
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const mountedRef = useRef(true)

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const pollTunnel = async () => {
        try {
            const { data } = await http.get(`/api/client/servers/${uuid}/tunnel`)
            if (!mountedRef.current) return
            setTunnelData(data)
            // Keep polling every 6 s until the tunnel is active
            if (data.status !== 'active') {
                pollRef.current = setTimeout(pollTunnel, 6000)
            }
        } catch (e) {
            clearAndAddHttpError(e as Error)
            // Retry even on error so a transient network blip doesn't freeze the UI
            if (mountedRef.current) {
                pollRef.current = setTimeout(pollTunnel, 6000)
            }
        }
    }

    useEffect(() => {
        mountedRef.current = true
        pollTunnel()
        return () => {
            mountedRef.current = false
            if (pollRef.current) clearTimeout(pollRef.current)
        }
    }, [uuid])

    const isActive  = tunnelData?.status === 'active' && tunnelData.ssh_string
    const isOffline = tunnelData?.status === 'offline'

    return (
        <ServerContentBlock
            title='Terminal'
            showFlashKey={`servers.${uuid}.console`}
        >
            <div className='flex flex-col items-center justify-center w-full min-h-[400px] p-6'>
                {isActive ? (
                    <div className='w-full max-w-xl p-6 bg-neutral-950/90 border border-indigo-500/30 rounded-2xl shadow-2xl space-y-4 font-sans'>
                        <div className='flex items-center justify-between'>
                            <h5 className='text-base font-bold text-white flex items-center gap-2'>
                                <span className='w-3 h-3 rounded-full bg-emerald-400 animate-pulse' />
                                SSH Tunnel Active
                            </h5>
                            {copied && <span className='text-emerald-400 text-xs font-bold'>✓ Copied!</span>}
                        </div>
                        <p className='text-xs text-gray-300 leading-relaxed'>
                            Run this command in your local terminal or PowerShell to connect directly to this VPS:
                        </p>
                        <div className='flex items-center gap-2'>
                            <input
                                type='text'
                                readOnly
                                value={tunnelData!.ssh_string!}
                                className='w-full text-xs font-mono bg-neutral-900 border border-white/10 rounded-lg px-3 py-2.5 text-blue-300 select-all focus:outline-none'
                            />
                            <button
                                type='button'
                                className='px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0'
                                onClick={() => copyToClipboard(tunnelData!.ssh_string!)}
                            >
                                Copy SSH
                            </button>
                        </div>
                    </div>
                ) : isOffline ? (
                    <div className='w-full max-w-xl p-6 bg-neutral-950/90 border border-amber-500/30 rounded-2xl shadow-2xl space-y-3 font-sans text-center'>
                        <h5 className='text-base font-bold text-amber-300 flex items-center justify-center gap-2'>
                            <span className='w-3 h-3 rounded-full bg-amber-400' />
                            Tunnel Offline
                        </h5>
                        <p className='text-xs text-gray-400 leading-relaxed'>
                            The SSH tunnel is offline. Start the server — the tunnel will reconnect automatically within a few seconds.
                        </p>
                        <p className='text-xs text-gray-500'>Checking again in 6 s…</p>
                    </div>
                ) : (
                    <div className='w-full max-w-xl p-6 bg-neutral-950/90 border border-indigo-500/20 rounded-2xl shadow-2xl space-y-3 font-sans text-center'>
                        <div className='flex items-center justify-center gap-3'>
                            <span className='w-3 h-3 rounded-full bg-indigo-400 animate-pulse' />
                            <h5 className='text-base font-bold text-indigo-300'>
                                {tunnelData === null ? 'Connecting…' : 'Tunnel initializing…'}
                            </h5>
                        </div>
                        <p className='text-xs text-gray-400 leading-relaxed'>
                            {tunnelData === null
                                ? 'Checking tunnel status for this server.'
                                : 'The VM may still be booting. The SSH tunnel will appear here once established.'}
                        </p>
                        <p className='text-xs text-gray-500'>Checking again in 6 s…</p>
                    </div>
                )}
            </div>
        </ServerContentBlock>
    )
}

export default ServerTerminalContainer