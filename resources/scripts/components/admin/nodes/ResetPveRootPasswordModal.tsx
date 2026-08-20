import { useFlashKey } from '@/util/useFlash'
import { useState } from 'react'
import { KeyIcon, EyeIcon, EyeSlashIcon, SparklesIcon, CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'

import resetRootPassword from '@/api/admin/nodes/resetRootPassword'
import FlashMessageRender from '@/components/elements/FlashMessageRenderer'
import MessageBox from '@/components/elements/MessageBox'
import Modal from '@/components/elements/Modal'
import Button from '@/components/elements/Button'

interface Props {
    open: boolean
    onClose: () => void
    node: {
        id: number
        name: string
        fqdn?: string
        cluster?: string
    } | null
    onSuccess?: () => void
}

const generateStrongPassword = (length = 18): string => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+'
    let retVal = ''
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n))
    }
    return retVal
}

const ResetPveRootPasswordModal = ({ open, onClose, node, onSuccess }: Props) => {
    const [userid, setUserid] = useState('root@pam')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [copied, setCopied] = useState(false)
    const [loading, setLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const flashKey = node ? `admin.nodes.${node.id}.reset_password` : 'admin.nodes.reset_password'
    const { clearFlashes, clearAndAddHttpError } = useFlashKey(flashKey)

    const handleGenerate = () => {
        const newPass = generateStrongPassword(18)
        setPassword(newPass)
        setShowPassword(true)
    }

    const handleCopy = () => {
        if (!password) return
        navigator.clipboard.writeText(password)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleClose = () => {
        clearFlashes()
        setPassword('')
        setUserid('root@pam')
        setShowPassword(false)
        setSuccessMessage(null)
        onClose()
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!node) return
        if (!password || password.length < 6) {
            return
        }

        clearFlashes()
        setSuccessMessage(null)
        setLoading(true)

        try {
            const res = await resetRootPassword(node.id, {
                password,
                userid: userid.trim() || 'root@pam',
            })

            setSuccessMessage(res.message || `Successfully reset PVE password on ${node.name}.`)
            if (onSuccess) {
                onSuccess()
            }
        } catch (error) {
            clearAndAddHttpError(error as Error)
        } finally {
            setLoading(false)
        }
    }

    if (!node) return null

    return (
        <Modal open={open} onClose={handleClose}>
            <Modal.Header>
                <div className='flex items-center gap-3'>
                    <div className='w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0'>
                        <KeyIcon className='w-5 h-5' />
                    </div>
                    <div>
                        <Modal.Title>Reset PVE Root Password</Modal.Title>
                        <p className='text-xs text-gray-400 mt-0.5'>
                            Node: <span className='text-white font-medium'>{node.name}</span> ({node.fqdn || node.cluster || `#${node.id}`})
                        </p>
                    </div>
                </div>
            </Modal.Header>

            <form onSubmit={handleSubmit}>
                <Modal.Body>
                    <FlashMessageRender className='mb-4' byKey={flashKey} />

                    {successMessage && (
                        <MessageBox className='mb-4' title='Success' type='info'>
                            {successMessage}
                        </MessageBox>
                    )}

                    <div className='space-y-4 font-sans text-left'>
                        <p className='text-xs text-gray-300 leading-relaxed'>
                            This executes a direct <code className='text-amber-300 font-mono bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800'>PUT /api2/json/access/password</code> API call to Proxmox VE to update the user credential immediately.
                        </p>

                        <div>
                            <label className='block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5'>
                                Proxmox User ID (Username & Realm)
                            </label>
                            <input
                                type='text'
                                value={userid}
                                onChange={e => setUserid(e.target.value)}
                                placeholder='root@pam'
                                className='w-full text-xs font-mono bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500'
                            />
                            <span className='text-[11px] text-gray-500 mt-1 block'>
                                Default is <span className='text-gray-400 font-mono'>root@pam</span>. You can also specify any realm like <span className='text-gray-400 font-mono'>admin@pve</span>.
                            </span>
                        </div>

                        <div>
                            <div className='flex items-center justify-between mb-1.5'>
                                <label className='block text-xs font-bold text-gray-300 uppercase tracking-wider'>
                                    New Password
                                </label>
                                <button
                                    type='button'
                                    onClick={handleGenerate}
                                    className='text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer transition'
                                >
                                    <SparklesIcon className='w-3.5 h-3.5' /> Generate Strong Password
                                </button>
                            </div>
                            <div className='relative flex items-center'>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder='Enter or generate new password'
                                    required
                                    minLength={6}
                                    className='w-full text-xs font-mono bg-neutral-900 border border-neutral-700 rounded-lg pl-3 pr-20 py-2.5 text-white focus:outline-none focus:border-blue-500'
                                />
                                <div className='absolute right-2 flex items-center gap-1.5'>
                                    {password && (
                                        <button
                                            type='button'
                                            onClick={handleCopy}
                                            title='Copy Password'
                                            className='p-1 text-gray-400 hover:text-white transition'
                                        >
                                            {copied ? (
                                                <CheckIcon className='w-4 h-4 text-emerald-400' />
                                            ) : (
                                                <ClipboardDocumentIcon className='w-4 h-4' />
                                            )}
                                        </button>
                                    )}
                                    <button
                                        type='button'
                                        onClick={() => setShowPassword(!showPassword)}
                                        title={showPassword ? 'Hide password' : 'Show password'}
                                        className='p-1 text-gray-400 hover:text-white transition'
                                    >
                                        {showPassword ? (
                                            <EyeSlashIcon className='w-4 h-4' />
                                        ) : (
                                            <EyeIcon className='w-4 h-4' />
                                        )}
                                    </button>
                                </div>
                            </div>
                            {copied && (
                                <span className='text-[11px] text-emerald-400 font-semibold mt-1 block'>
                                    ✓ Copied password to clipboard!
                                </span>
                            )}
                        </div>

                        <MessageBox title='Security Note' type='warning'>
                            Ensure you keep this new password safe or copy it before closing. If your Proxmox node uses PAM authentication, this updates the host system password for that user.
                        </MessageBox>
                    </div>
                </Modal.Body>

                <Modal.Actions>
                    <Button
                        type='button'
                        variant='outline'
                        color='secondary'
                        size='sm'
                        onClick={handleClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        type='submit'
                        variant='filled'
                        color='primary'
                        size='sm'
                        loading={loading}
                        disabled={!password || password.length < 6}
                    >
                        Update PVE Password
                    </Button>
                </Modal.Actions>
            </form>
        </Modal>
    )
}

export default ResetPveRootPasswordModal
