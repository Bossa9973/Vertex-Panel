import { useFlashKey } from '@/util/useFlash'
import { useState } from 'react'
import { KeyIcon, EyeIcon, EyeSlashIcon, SparklesIcon, CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'

import resetRootPassword from '@/api/admin/nodes/resetRootPassword'
import useNodeSWR from '@/api/admin/nodes/useNodeSWR'

import Button from '@/components/elements/Button'
import FlashMessageRender from '@/components/elements/FlashMessageRenderer'
import FormCard from '@/components/elements/FormCard'
import MessageBox from '@/components/elements/MessageBox'

const generateStrongPassword = (length = 18): string => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+'
    let retVal = ''
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n))
    }
    return retVal
}

const ResetPveRootPasswordCard = () => {
    const { data: node } = useNodeSWR()
    const flashKey = `admin.nodes.${node.id}.settings.general.reset_password`
    const { clearFlashes, clearAndAddHttpError } = useFlashKey(flashKey)

    const [userid, setUserid] = useState('root@pam')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [copied, setCopied] = useState(false)
    const [loading, setLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!password || password.length < 6) return

        clearFlashes()
        setSuccessMessage(null)
        setLoading(true)

        try {
            const res = await resetRootPassword(node.id, {
                password,
                userid: userid.trim() || 'root@pam',
            })

            setSuccessMessage(res.message || `Successfully reset PVE password for ${userid} on ${node.name}.`)
        } catch (error) {
            clearAndAddHttpError(error as Error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <FormCard className='w-full'>
            <form onSubmit={handleSubmit}>
                <FormCard.Body>
                    <div className='flex items-center gap-3 mb-2'>
                        <div className='w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400'>
                            <KeyIcon className='w-4 h-4' />
                        </div>
                        <div>
                            <FormCard.Title>Reset Proxmox (PVE) Root Password</FormCard.Title>
                        </div>
                    </div>

                    <div className='space-y-4 mt-3'>
                        <FlashMessageRender byKey={flashKey} />

                        {successMessage && (
                            <MessageBox title='Success' type='info'>
                                {successMessage}
                            </MessageBox>
                        )}

                        <p className='text-xs text-gray-300 leading-relaxed'>
                            Update the authentication password for <code className='text-amber-300 font-mono bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800'>{userid || 'root@pam'}</code> directly on this Proxmox VE node using the Proxmox API (<code className='text-blue-300 font-mono text-[11px]'>PUT /api2/json/access/password</code>).
                        </p>

                        <div>
                            <label className='block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5'>
                                User ID (Username & Realm)
                            </label>
                            <input
                                type='text'
                                value={userid}
                                onChange={e => setUserid(e.target.value)}
                                placeholder='root@pam'
                                className='w-full text-xs font-mono bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500'
                            />
                            <span className='text-[11px] text-gray-500 mt-1 block'>
                                Default is <span className='text-gray-400 font-mono'>root@pam</span>.
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

                        <MessageBox title='Important' type='warning'>
                            Make sure to save or copy the password before updating. If you are changing the root password, ensure you keep access credentials updated for any external tools.
                        </MessageBox>
                    </div>
                </FormCard.Body>

                <FormCard.Footer>
                    <Button
                        loading={loading}
                        disabled={!password || password.length < 6}
                        type='submit'
                        variant='filled'
                        color='primary'
                        size='sm'
                    >
                        Update PVE Password
                    </Button>
                </FormCard.Footer>
            </form>
        </FormCard>
    )
}

export default ResetPveRootPasswordCard
