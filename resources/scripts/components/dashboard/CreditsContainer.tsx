import { getCredits, topUpCredits, CreditTransaction } from '@/api/credits'
import PageContentBlock from '@/components/elements/PageContentBlock'
import { useStoreActions, useStoreState } from '@/state'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import {
    ClipboardIcon,
    ArrowUpRightIcon,
} from '@heroicons/react/24/outline'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'
import { motion } from 'framer-motion'
import { Copy, Check, RotateCw, CreditCard } from 'lucide-react'
import { Link } from 'react-router-dom'

const formatTxDescription = (desc: string) => {
    if (!desc) return { title: 'Transaction Statement', detail: 'Account balance update' }

    if (/deployed vps/i.test(desc)) {
        let instance = 'VPS Instance'
        const instMatch = desc.match(/(vps-instance[-\w]*)/i)
        if (instMatch) instance = instMatch[1]

        let plan = '30-Day Active Instance'
        const planMatch = desc.match(/\(([^)]+)\)/)
        if (planMatch) {
            plan = planMatch[1].replace(/on Node /i, ' • Node ').replace(/on /i, ' • Node ')
        }

        return {
            title: `Deployed ${instance}`,
            detail: plan,
        }
    }

    if (/renewed vps/i.test(desc)) {
        let instance = 'VPS Instance'
        const instMatch = desc.match(/(vps-instance[-\w]*)/i)
        if (instMatch) instance = instMatch[1]

        return {
            title: `Renewed ${instance}`,
            detail: 'Extended service duration by +30 Days',
        }
    }

    if (/top-up/i.test(desc)) {
        const method = desc.split(/via/i)[1]?.trim() || 'Online Payment'
        return {
            title: 'Account Balance Top-Up',
            detail: `Instant payment completed via ${method}`,
        }
    }

    if (/admin/i.test(desc)) {
        return {
            title: 'Admin Credit Bonus',
            detail: 'Promotional balance deposit by system administrator',
        }
    }

    return {
        title: desc,
        detail: 'Account activity statement',
    }
}

const formatDateClean = (dateStr: string) => {
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        const day = String(d.getDate()).padStart(2, '0')
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const month = months[d.getMonth()]
        const year = d.getFullYear()
        const hours = String(d.getHours()).padStart(2, '0')
        const mins = String(d.getMinutes()).padStart(2, '0')
        return `${day} ${month} ${year}, ${hours}:${mins}`
    } catch {
        return dateStr
    }
}

const formatMemberSinceDate = (dateStr?: string | null) => {
    if (!dateStr) return '12 Jan 2025'
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return '12 Jan 2025'
        const day = String(d.getDate()).padStart(2, '0')
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const month = months[d.getMonth()]
        const year = d.getFullYear()
        return `${day} ${month} ${year}`
    } catch {
        return '12 Jan 2025'
    }
}

const CreditsContainer = () => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)
    const [opened, setOpened] = useState(false)
    const [selectedAmount, setSelectedAmount] = useState<number>(25)
    const [customAmount, setCustomAmount] = useState<string>('')
    const [paymentMethod, setPaymentMethod] = useState<string>('Credit Card')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [filterType, setFilterType] = useState<'all' | 'topup' | 'deduction'>('all')
    const [copiedRef, setCopiedRef] = useState(false)
    const [copiedTxId, setCopiedTxId] = useState<string | null>(null)

    const { data, isLoading } = useSWR('/api/client/credits', getCredits)

    useEffect(() => {
        if (data?.credits !== undefined) {
            updateCredits(data.credits)
        }
    }, [data])

    const handleTopUp = async () => {
        const amount = customAmount ? parseFloat(customAmount) : selectedAmount
        if (isNaN(amount) || amount <= 0) return

        setIsSubmitting(true)
        try {
            const res = await topUpCredits(amount, paymentMethod)
            updateCredits(res.credits)
            mutate('/api/client/credits')
            setOpened(false)
            setCustomAmount('')
        } catch (e) {
            console.error('Failed to top up credits:', e)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCopyRefCode = () => {
        const code = `REF-${String(user?.id || 1001).padStart(5, '0')}`
        navigator.clipboard.writeText(code)
        setCopiedRef(true)
        setTimeout(() => setCopiedRef(false), 2000)
    }

    const handleCopyTxRef = (refId: string) => {
        navigator.clipboard.writeText(refId)
        setCopiedTxId(refId)
        setTimeout(() => setCopiedTxId(null), 2000)
    }

    const rawTransactions = data?.transactions?.data || []
    const filteredTransactions = rawTransactions.filter(tx => {
        if (filterType === 'all') return true
        if (filterType === 'topup') return tx.type === 'topup' || tx.type === 'bonus'
        if (filterType === 'deduction') return tx.type === 'deduction'
        return true
    })

    const totalSpent = rawTransactions
        .filter(tx => tx.type === 'deduction' || tx.amount < 0)
        .reduce((acc, tx) => acc + Math.abs(tx.amount), 0)

    const balanceVal = (user?.credits ?? 0).toFixed(2)
    const [wholePart, decimalPart] = balanceVal.split('.')

    const userCreatedAt = (user as any)?.createdAt || (user as any)?.created_at
    const memberSinceFormatted = formatMemberSinceDate(userCreatedAt)

    const renderTxAmount = (tx: CreditTransaction) => {
        const isDeduction = tx.type === 'deduction' || tx.amount < 0
        const absVal = Math.abs(tx.amount).toFixed(2)

        if (isDeduction) {
            return (
                <div className='bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold min-w-[130px] text-right inline-block ml-auto'>
                    -{absVal} BOLTs
                </div>
            )
        }
        return (
            <div className='bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold min-w-[130px] text-right inline-block ml-auto'>
                +{absVal} BOLTs
            </div>
        )
    }

    return (
        <PageMaintenanceGuard pageKey='billing'>
            <PageContentBlock title='Billing & BOLTs' showFlashKey='credits'>
                {/* 2-Column Top Section */}
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 font-sans items-stretch text-left'>
                    {/* LEFT CARD (Balance) */}
                    <div className='p-6 bg-neutral-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl shadow-[0px_0px_120px_-20px_#0900ff] text-white relative font-sans text-left flex flex-col justify-between'>
                        <div className='absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none z-0 rounded-2xl' />

                        <div className='relative z-10'>
                            <div className='flex items-center justify-between'>
                                <span className='text-xs font-bold uppercase tracking-wider text-gray-400'>
                                    AVAILABLE BALANCE
                                </span>
                                <span className='bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono shrink-0'>
                                    ACTIVE
                                </span>
                            </div>

                            {/* Split balance number with smaller decimal */}
                            <div className='text-5xl font-bold text-white tracking-tight flex items-baseline gap-1 mt-3'>
                                <BoltSvgIcon className='w-10 h-10 text-amber-400 shrink-0 self-center' />
                                <span className='text-5xl font-bold text-white'>{wholePart}</span>
                                <span className='text-2xl font-bold text-gray-400'>.{decimalPart}</span>
                                <span className='text-lg font-bold text-gray-400 ml-1.5'>BOLTs</span>
                            </div>

                            <div className='border-t border-white/[0.06] my-4' />

                            <div className='space-y-2'>
                                <div className='flex items-center justify-between text-xs text-gray-400'>
                                    <span>Total Spent</span>
                                    <span className='font-mono text-white font-semibold'>
                                        {totalSpent.toFixed(2)} BOLTs
                                    </span>
                                </div>
                                <div className='flex items-center justify-between text-xs text-gray-400'>
                                    <span>Member Since</span>
                                    <span className='font-mono text-white font-semibold'>
                                        {memberSinceFormatted}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Circular Action Buttons */}
                        <div className='relative z-10 flex items-center gap-6 mt-6'>
                            {/* "Top Up" */}
                            <div className='flex flex-col items-center gap-1.5'>
                                <button
                                    type='button'
                                    onClick={() => setOpened(true)}
                                    className='w-12 h-12 rounded-full bg-blue-500 shadow-lg shadow-blue-500/40 flex items-center justify-center cursor-pointer active:scale-95 transition hover:bg-blue-400'
                                    title='Top Up'
                                >
                                    <ArrowUpRightIcon className='w-5 h-5 text-white' />
                                </button>
                                <span className='text-xs text-gray-400 font-sans font-medium'>Top Up</span>
                            </div>

                            {/* "Earn Free" */}
                            <div className='flex flex-col items-center gap-1.5'>
                                <Link
                                    to='/earn'
                                    className='w-12 h-12 rounded-full bg-amber-500 shadow-lg shadow-amber-500/40 flex items-center justify-center cursor-pointer active:scale-95 transition hover:bg-amber-400'
                                    title='Earn Free'
                                >
                                    <BoltSvgIcon className='w-5 h-5 text-white' />
                                </Link>
                                <span className='text-xs text-gray-400 font-sans font-medium'>Earn Free</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT CARD (Billing & Referral Info) */}
                    <div className='p-6 bg-neutral-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl shadow-[0px_0px_120px_-20px_#0900ff] text-white relative font-sans text-left flex flex-col justify-between'>
                        <div className='absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none z-0 rounded-2xl' />

                        <div className='relative z-10 space-y-4'>
                            <div>
                                <span className='text-xs font-bold uppercase tracking-wider text-gray-400 block'>
                                    BILLING &amp; REFERRAL INFO
                                </span>
                                <p className='text-sm text-gray-400 leading-relaxed mt-2 font-sans'>
                                    Automated billing dynamically deducts server renewal fees from your active BOLT balance every 30 days. Maintain sufficient balance to ensure uninterrupted service availability.
                                </p>
                            </div>

                            <div className='border-t border-white/[0.06] pt-3 space-y-2'>
                                <div className='flex items-center justify-between text-xs text-gray-400'>
                                    <span>AUTOMATED BILLING</span>
                                    <span className='font-mono text-white font-semibold'>Active</span>
                                </div>
                                <div className='flex items-center justify-between text-xs text-gray-400'>
                                    <span>RENEWAL CYCLE</span>
                                    <span className='font-mono text-white font-semibold'>Every 30 Days</span>
                                </div>
                                <div className='flex items-center justify-between text-xs text-gray-400'>
                                    <span>AUTO-RENEWAL</span>
                                    <span className='font-mono text-white font-semibold'>Enabled · Every 30 days</span>
                                </div>
                            </div>

                            <div className='pt-3 border-t border-white/[0.06]'>
                                <label className='block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5'>
                                    YOUR CLIENT REFERRAL CODE
                                </label>
                                <div className='flex items-center w-full'>
                                    <input
                                        type='text'
                                        readOnly
                                        value={`REF-${String((user as any)?.id || 1001).padStart(5, '0')}`}
                                        className='w-full px-3.5 py-2.5 rounded-l-xl border border-r-0 border-neutral-700 bg-black/60 text-white font-mono text-xs focus:outline-none select-all'
                                    />
                                    <button
                                        type='button'
                                        onClick={handleCopyRefCode}
                                        className='px-3.5 py-2.5 rounded-r-xl border border-neutral-700 bg-neutral-800/90 text-blue-400 hover:text-blue-300 font-mono text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1.5 shadow-inner transition active:scale-95'
                                    >
                                        {copiedRef ? <Check className='w-4 h-4 text-emerald-400' /> : <Copy className='w-4 h-4' />}
                                        <span>{copiedRef ? 'Copied' : 'Copy'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* TRANSACTION TABLE CARD */}
                <div className='p-6 bg-neutral-900/60 backdrop-blur-sm border border-white/[0.04] border-t border-t-blue-500/30 shadow-[0px_0px_120px_-20px_#0900ff] text-white relative rounded-2xl mb-8 font-sans text-left'>
                    <div className='absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none z-0 rounded-2xl' />

                    {/* Section Header */}
                    <div className='relative z-10 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-neutral-700/80 text-left'>
                        <div className='flex items-center gap-3'>
                            <h2 className='text-lg font-bold text-white tracking-tight font-sans'>BOLT Activity &amp; Statements</h2>
                            <span className='bg-neutral-800 border border-neutral-700 text-gray-400 text-xs rounded-full px-2 py-0.5 font-mono font-medium'>
                                {filteredTransactions.length} Statements
                            </span>
                        </div>

                        {/* StepPillSwitch Filter Tabs */}
                        <div className='relative z-10 flex w-fit rounded-full bg-neutral-900/90 border border-gray-700/80 p-1 backdrop-blur-md'>
                            {[
                                { key: 'all', label: 'All' },
                                { key: 'topup', label: 'Top-Ups' },
                                { key: 'deduction', label: 'Deductions' },
                            ].map(tab => {
                                const isActive = filterType === tab.key
                                return (
                                    <button
                                        key={tab.key}
                                        type='button'
                                        onClick={() => setFilterType(tab.key as any)}
                                        className={`relative z-10 w-fit h-8 rounded-full px-4 py-1 text-xs font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                            isActive ? 'text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                    >
                                        {isActive && (
                                            <motion.span
                                                layoutId='billingFilterSwitch'
                                                className='absolute top-0 left-0 h-8 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-500 bg-gradient-to-t from-blue-600 to-blue-500'
                                                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                                            />
                                        )}
                                        <span className='relative flex items-center gap-1.5'>
                                            {tab.label}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Table Content */}
                    <div className='relative z-10'>
                        {isLoading ? (
                            <div className='text-center py-16 text-gray-400 text-xs font-semibold flex flex-col items-center justify-center gap-3 font-sans'>
                                <RotateCw className='w-5 h-5 animate-spin text-blue-400' />
                                <span>Loading billing statements...</span>
                            </div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className='text-center py-14 px-4 border border-dashed border-neutral-700/80 rounded-xl bg-neutral-900/60 font-sans'>
                                <div className='w-12 h-12 mx-auto rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-gray-400 mb-3 shadow-md'>
                                    <CreditCard className='w-6 h-6' />
                                </div>
                                <h3 className='text-sm font-bold text-white'>No Statements Found</h3>
                                <p className='text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed'>
                                    No transactions matching the selected filter option.
                                </p>
                            </div>
                        ) : (
                            <div className='overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'>
                                <table className='w-full text-left border-collapse font-sans'>
                                    <thead>
                                        <tr className='border-b border-neutral-700/80 text-xs font-bold uppercase tracking-wider text-gray-400 opacity-100 pb-3'>
                                            <th className='py-3 px-4'>Reference ID</th>
                                            <th className='py-3 px-4'>Type</th>
                                            <th className='py-3 px-4'>Activity Description</th>
                                            <th className='py-3 px-4'>Timestamp</th>
                                            <th className='py-3 px-4 text-right'>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-neutral-700/80 text-xs font-medium text-gray-300'>
                                        {filteredTransactions.map((tx: CreditTransaction) => {
                                            const parsed = formatTxDescription(tx.description)
                                            const refStr = tx.reference_id || `#TX-${tx.id}`
                                            const isDeduction = tx.type === 'deduction' || tx.amount < 0

                                            return (
                                                <tr
                                                    key={tx.id}
                                                    className='relative h-14 border-b border-white/[0.04] group hover:bg-white/[0.05] transition-colors duration-150'
                                                >
                                                    {/* Reference ID Column */}
                                                    <td className='relative py-3 px-4 align-middle whitespace-nowrap'>
                                                        <div className='absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150' />
                                                        <div className='flex items-center gap-1.5 pl-1 font-mono text-xs text-gray-400'>
                                                            <span>{refStr}</span>
                                                            <button
                                                                type='button'
                                                                onClick={() => handleCopyTxRef(refStr)}
                                                                title='Copy Reference ID'
                                                                className='opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:text-white cursor-pointer p-0.5'
                                                            >
                                                                {copiedTxId === refStr ? (
                                                                    <Check className='w-3.5 h-3.5 text-emerald-400 inline' />
                                                                ) : (
                                                                    <ClipboardIcon className='w-3.5 h-3.5 inline' />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>

                                                    {/* Type Pills */}
                                                    <td className='py-3 px-4 align-middle whitespace-nowrap'>
                                                        {isDeduction ? (
                                                            <span className='bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-[9px] px-2 py-0.5 font-semibold uppercase tracking-wider inline-block font-mono'>
                                                                Deduction
                                                            </span>
                                                        ) : (
                                                            <span className='bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[9px] px-2 py-0.5 font-semibold uppercase tracking-wider inline-block font-mono'>
                                                                Topup
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Description */}
                                                    <td className='py-3 px-4 align-middle font-sans'>
                                                        <div className='font-semibold text-white text-sm font-sans tracking-tight leading-snug'>
                                                            {parsed.title}
                                                        </div>
                                                        {parsed.detail && (
                                                            <div className='text-xs text-gray-400 font-mono tracking-tight leading-none mt-0.5'>
                                                                {parsed.detail}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Timestamp */}
                                                    <td className='py-3 px-4 align-middle text-xs text-gray-400 font-mono whitespace-nowrap'>
                                                        {formatDateClean(tx.created_at)}
                                                    </td>

                                                    {/* Amount Badges */}
                                                    <td className='py-3 px-4 align-middle text-right whitespace-nowrap'>
                                                        {renderTxAmount(tx)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Top Up Modal */}
                <Modal
                    opened={opened}
                    onClose={() => setOpened(false)}
                    title={<div className='font-bold text-lg text-white font-sans tracking-tight'>Top Up Account BOLTs</div>}
                    centered
                    size='md'
                    styles={{
                        modal: { backgroundColor: '#121417', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' },
                        header: { backgroundColor: '#121417', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)' },
                        close: { color: '#9ca3af', '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff' } }
                    }}
                >
                    <div className='relative space-y-5 pt-2 font-sans text-left'>
                        <LoadingOverlay visible={isSubmitting} />

                        <div>
                            <label className='block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2'>
                                Select Amount
                            </label>
                            <div className='grid grid-cols-4 gap-2.5'>
                                {[10, 25, 50, 100].map(amt => (
                                    <button
                                        key={amt}
                                        type='button'
                                        onClick={() => {
                                            setSelectedAmount(amt)
                                            setCustomAmount('')
                                        }}
                                        className={`py-3 rounded-xl font-bold font-mono text-xs border transition-all active:scale-95 cursor-pointer ${
                                            selectedAmount === amt && !customAmount
                                                ? 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-md'
                                                : 'border-white/[0.08] bg-[#16181d] text-gray-300 hover:bg-neutral-800'
                                        }`}
                                    >
                                        {amt} BOLTs
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className='block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1'>
                                Custom Amount (BOLTs)
                            </label>
                            <input
                                type='number'
                                placeholder='Enter custom amount (e.g. 150)'
                                value={customAmount}
                                onChange={e => setCustomAmount(e.target.value)}
                                className='w-full px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-[#16181d] text-white font-mono font-semibold text-xs focus:outline-none focus:border-blue-500'
                            />
                        </div>

                        <div>
                            <label className='block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2'>
                                Payment Method
                            </label>
                            <div className='grid grid-cols-3 gap-2.5'>
                                {['Credit Card', 'PayPal', 'Crypto / USDT'].map(method => (
                                    <button
                                        key={method}
                                        type='button'
                                        onClick={() => setPaymentMethod(method)}
                                        className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer active:scale-95 ${
                                            paymentMethod === method
                                                ? 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-md'
                                                : 'border-white/[0.08] bg-[#16181d] text-gray-400 hover:bg-neutral-800'
                                        }`}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className='pt-4 flex justify-end gap-3 border-t border-white/[0.08]'>
                            <button
                                type='button'
                                onClick={() => setOpened(false)}
                                className='px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-bold text-xs cursor-pointer'
                            >
                                Cancel
                            </button>
                            <button
                                type='button'
                                onClick={handleTopUp}
                                className='px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 active:scale-95 cursor-pointer'
                            >
                                Pay &amp; Add ${customAmount ? customAmount : selectedAmount} BOLTs
                            </button>
                        </div>
                    </div>
                </Modal>
            </PageContentBlock>
        </PageMaintenanceGuard>
    )
}

export default CreditsContainer
