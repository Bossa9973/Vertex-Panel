import { ServerContext } from '@/state/server'
import { useFlashKey } from '@/util/useFlash'
import { Loader } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import http from '@/api/http'

import createConsoleSession, {
    ConsoleType,
} from '@/api/server/createConsoleSession'

import ServerContentBlock from '@/components/servers/ServerContentBlock'


const ServerTerminalContainer = () => {
    const [params] = useSearchParams()
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid)
    const { clearFlashes, clearAndAddHttpError } = useFlashKey(
        `servers.${uuid}.console`
    )
    const [message, setMessage] = useState('Initializing')
    const [tmateSsh, setTmateSsh] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [loading, setLoading] = useState(true)

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    useEffect(() => {
        const main = async () => {
            setLoading(true)
            try {
                const res = await http.post(`/api/client/servers/${uuid}/create-sshx-session`)
                if (res.data?.data?.ssh_cmd || res.data?.data?.url) {
                    setTmateSsh(res.data.data.ssh_cmd || res.data.data.url)
                }
            } catch (e) {
                clearAndAddHttpError(e as Error)
            } finally {
                setLoading(false)
            }
        }

        main()
    }, [uuid])

    return (
        <ServerContentBlock
            title='Terminal'
            showFlashKey={`servers.${uuid}.console`}
        >
            <div className='flex flex-col items-center justify-center w-full min-h-[400px] p-6'>
                {loading ? (
                    <div className='flex flex-col items-center space-y-3'>
                        <Loader size='lg' />
                        <p className='text-sm text-gray-400'>Connecting to tmate session...</p>
                    </div>
                ) : tmateSsh ? (
                    <div className='w-full max-w-xl p-6 bg-neutral-950/90 border border-indigo-500/30 rounded-2xl shadow-2xl space-y-4 font-sans'>
                        <div className='flex items-center justify-between'>
                            <h5 className='text-base font-bold text-white flex items-center gap-2'>
                                <span className='w-3 h-3 rounded-full bg-emerald-400 animate-pulse' />
                                tmate SSH Live Terminal
                            </h5>
                            {copied && <span className='text-emerald-400 text-xs font-bold'>✓ Copied!</span>}
                        </div>
                        <p className='text-xs text-gray-300 leading-relaxed'>
                            Run this SSH command in your local terminal or PowerShell to connect directly to this VPS:
                        </p>
                        <div className='flex items-center gap-2'>
                            <input
                                type='text'
                                readOnly
                                value={tmateSsh}
                                className='w-full text-xs font-mono bg-neutral-900 border border-white/10 rounded-lg px-3 py-2.5 text-blue-300 select-all focus:outline-none'
                            />
                            <button
                                type='button'
                                className='px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0'
                                onClick={() => copyToClipboard(tmateSsh)}
                            >
                                Copy SSH
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className='text-center space-y-2'>
                        <p className='text-sm text-amber-300 font-bold'>Unable to fetch tmate SSH session</p>
                        <p className='text-xs text-gray-400'>Please ensure the VM is running and click fetch on the Overview tab.</p>
                    </div>
                )}
            </div>
        </ServerContentBlock>
    )
}

export default ServerTerminalContainer