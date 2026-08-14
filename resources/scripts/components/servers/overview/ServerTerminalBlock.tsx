import { useEffect, useState, useRef } from 'react'
import { ServerContext } from '@/state/server'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { CheckIcon, ClipboardDocumentIcon, SparklesIcon, CommandLineIcon, LockClosedIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { Button, Modal } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import http from '@/api/http'
import Card from '@/components/elements/Card'

const ServerTerminalBlock = () => {
    const serverData = ServerContext.useStoreState(state => state.server.data)
    const uuid = serverData!.uuid
    const { t } = useTranslation('server.overview')
    const { t: tStrings } = useTranslation('strings')

    const [sshCmd, setSshCmd] = useState<string | null>(null)
    const [noticeMsg, setNoticeMsg] = useState<string | null>(null)
    const [tmateLoading, setTmateLoading] = useState<boolean>(false)
    const [modalOpened, setModalOpened] = useState<boolean>(false)
    const [copiedSsh, setCopiedSsh] = useState<boolean>(false)
    const [rebootLoading, setRebootLoading] = useState<boolean>(false)
    const [isRepairing, setIsRepairing] = useState<boolean>(false)
    const [repairStatusText, setRepairStatusText] = useState<string>('')
    const pollingRef = useRef<NodeJS.Timeout | null>(null)

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
            }
        }
    }, [])

    const handleAutoEnableReboot = async () => {
        setRebootLoading(true)
        setIsRepairing(true)
        setRepairStatusText('Configuring QEMU Guest Agent & Cloud-Init...')

        try {
            const res = await http.post(`/api/client/servers/${uuid}/auto-enable-agent`)
            if (res.data?.data?.ssh_cmd || res.data?.data?.url) {
                setSshCmd(res.data.data.ssh_cmd || res.data.data.url)
                setNoticeMsg(null)
                setIsRepairing(false)
                setRebootLoading(false)
                setModalOpened(true)
                return
            }

            // If power cycle was triggered, poll every 3 seconds for up to 60s
            setRepairStatusText('VM power-cycled. Initializing services & connecting to tmate...')
            let attempts = 0
            const maxAttempts = 20

            if (pollingRef.current) {
                clearInterval(pollingRef.current)
            }

            pollingRef.current = setInterval(async () => {
                attempts++
                try {
                    const pollRes = await http.post(`/api/client/servers/${uuid}/create-sshx-session`)
                    const pollData = pollRes.data?.data
                    const cmd = pollData?.ssh_cmd || pollData?.url
                    if (cmd) {
                        if (pollingRef.current) clearInterval(pollingRef.current)
                        setSshCmd(cmd)
                        setNoticeMsg(null)
                        setIsRepairing(false)
                        setRebootLoading(false)
                        return
                    }
                } catch {
                    // Still booting/initializing
                }

                if (attempts >= maxAttempts) {
                    if (pollingRef.current) clearInterval(pollingRef.current)
                    setIsRepairing(false)
                    setRebootLoading(false)
                    setNoticeMsg('VM was reconfigured and power-cycled. Initialization may take an additional moment. Please click "1-Click Repair & Start tmate" again or try connecting shortly.')
                }
            }, 3000)

        } catch (err: any) {
            console.error('Failed to auto-enable agent and reboot:', err)
            setIsRepairing(false)
            setRebootLoading(false)
            setNoticeMsg('Unable to automatically reconfigure VM. Please ensure the server is powered on and try again.')
        }
    }

    const handleFetchTmateSession = async () => {
        setTmateLoading(true)
        try {
            const res = await http.post(`/api/client/servers/${uuid}/create-sshx-session`)
            if (res.data?.data) {
                const data = res.data.data
                const cmd = data.ssh_cmd || data.url
                if (cmd) {
                    setSshCmd(cmd)
                    setNoticeMsg(null)
                    setModalOpened(true)
                } else if (data.notice) {
                    setSshCmd(null)
                    setNoticeMsg(data.notice)
                    setModalOpened(true)
                }
            }
        } catch (err: any) {
            console.error('Failed to fetch tmate session:', err)
            const errorMsg = err?.response?.data?.errors?.[0]?.detail || err?.response?.data?.message || err?.message || 'Error executing Proxmox guest agent request.'
            setSshCmd(null)
            setNoticeMsg(`Error: ${errorMsg}`)
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

    return (
        <>
            <Card className='relative flex flex-col col-span-10 md:col-span-5 font-sans overflow-hidden'>
                <h5 className='h5'>{t('terminal.title')}</h5>
                <p className='description-small mt-1'>
                    {t('terminal.description')}
                </p>

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
                                disabled={tmateLoading}
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
                {isRepairing && (
                    <div className='py-8 flex flex-col items-center justify-center space-y-4 text-center font-sans'>
                        <div className='relative flex items-center justify-center'>
                            <div className='w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin' />
                            <ArrowPathIcon className='w-5 h-5 text-blue-400 absolute' />
                        </div>
                        <div className='space-y-1.5 max-w-sm'>
                            <h4 className='text-sm font-semibold text-gray-100'>Repairing VM & Starting tmate</h4>
                            <p className='text-xs text-gray-400 leading-relaxed'>
                                {repairStatusText || 'Configuring QEMU Guest Agent and initializing tmate session. The SSH command will appear here automatically once ready.'}
                            </p>
                        </div>
                    </div>
                )}

                {!isRepairing && sshCmd && (
                    <div className='space-y-5 font-sans pt-2'>
                        <div className='p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-300 font-medium text-xs'>
                            <CheckIcon className='w-4 h-4 text-emerald-400 shrink-0' />
                            <span>tmate SSH session is active! Run the command below in any terminal to connect:</span>
                        </div>

                        {/* SSH Command Box */}
                        <div className='bg-neutral-950 p-4 rounded-xl border border-white/10 space-y-2'>
                            <div className='flex items-center justify-between text-xs font-bold text-gray-200'>
                                <span className='flex items-center gap-1.5'>
                                    <CommandLineIcon className='w-4 h-4 text-blue-400' /> SSH Command:
                                </span>
                                {copiedSsh && (
                                    <span className='text-emerald-400 flex items-center gap-1 text-xs'>
                                        <CheckIcon className='w-3.5 h-3.5' /> Copied to clipboard!
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

                        <div className='flex justify-end pt-2 border-t border-white/10'>
                            <Button
                                variant='outline'
                                onClick={() => setModalOpened(false)}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                )}

                {!isRepairing && !sshCmd && noticeMsg && (
                    <div className='space-y-5 font-sans pt-2'>
                        <div className='p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2'>
                            <div className='flex items-center gap-2 text-amber-300 font-bold text-xs'>
                                <LockClosedIcon className='w-4 h-4 text-amber-400' />
                                <span>QEMU Guest Agent Required for tmate</span>
                            </div>
                            <p className='text-xs text-amber-200/90 leading-relaxed'>
                                {noticeMsg}
                            </p>
                        </div>

                        <p className='text-xs text-gray-400 leading-relaxed'>
                            Clicking <strong>1-Click Repair & Start tmate</strong> will automatically enable the QEMU guest agent in Proxmox VM hardware and trigger service initialization so tmate is active.
                        </p>

                        <div className='flex flex-wrap justify-end gap-3 pt-2 border-t border-white/10'>
                            <Button
                                variant='outline'
                                onClick={() => setModalOpened(false)}
                            >
                                Close
                            </Button>
                            <Button
                                className='bg-amber-600 hover:bg-amber-500 text-white'
                                loading={rebootLoading}
                                onClick={handleAutoEnableReboot}
                            >
                                <ArrowPathIcon className='w-4 h-4 mr-1.5' /> 1-Click Repair & Start tmate
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    )
}

export default ServerTerminalBlock