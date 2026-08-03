import { useEffect, useState } from 'react'
import { ServerContext } from '@/state/server'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { CheckIcon, ClipboardDocumentIcon, SparklesIcon, CommandLineIcon } from '@heroicons/react/24/outline'
import { Button, Modal } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import http from '@/api/http'
import Card from '@/components/elements/Card'

const ServerTerminalBlock = () => {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid)
    const { t } = useTranslation('server.overview')
    const { t: tStrings } = useTranslation('strings')

    const [terminalMode, setTerminalMode] = useState<'both' | 'sshx'>('both')
    const [sshCmd, setSshCmd] = useState<string | null>(null)
    const [tmateLoading, setTmateLoading] = useState<boolean>(false)
    const [modalOpened, setModalOpened] = useState<boolean>(false)
    const [copiedSsh, setCopiedSsh] = useState<boolean>(false)

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
        setTmateLoading(true)
        try {
            const res = await http.post(`/api/client/servers/${uuid}/create-sshx-session`)
            if (res.data?.data) {
                const data = res.data.data
                const cmd = data.ssh_cmd || data.url
                setSshCmd(cmd)
                setModalOpened(true)
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

    return (
        <>
            <Card className='flex flex-col col-span-10 md:col-span-5 font-sans'>
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
                                    onClick={handleFetchTmateSession}
                                >
                                    {sshCmd ? 'View tmate SSH Command' : 'Fetch tmate SSH Session'}
                                </Button>
                                <Button
                                    variant='outline'
                                    disabled={tmateLoading}
                                    onClick={handleFetchTmateSession}
                                    title='Fetch tmate session'
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