import { getCredits, topUpCredits, CreditTransaction } from '@/api/credits'
import PageContentBlock from '@/components/elements/PageContentBlock'
import { useStoreActions, useStoreState } from '@/state'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import {
    ClipboardDocumentIcon,
    CheckIcon,
    ReceiptPercentIcon,
    ArrowUpRightIcon,
    ArrowDownRightIcon,
    SparklesIcon,
    InformationCircleIcon,
    CreditCardIcon,
} from '@heroicons/react/24/outline'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'

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
            title: 'Admin Credit Deposit',
            detail: 'Promotional balance deposit by system administrator',
        }
    }

    if (/promo/i.test(desc)) {
        return {
            title: 'Promo Code Redemption',
            detail: 'Redeemed bonus credits promotional code',
        }
    }

    if (/earn/i.test(desc) || /discord/i.test(desc)) {
        return {
            title: 'Discord Task Reward',
            detail: 'Claimed community engagement task reward',
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

const CreditsContainer = () => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)
    const [opened, setOpened] = useState(false)
    const [selectedAmount, setSelectedAmount] = useState<number>(25)
    const [customAmount, setCustomAmount] = useState<string>('')
    const [paymentMethod, setPaymentMethod] = useState<string>('Credit Card')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [filterType, setFilterType] = useState<'all' | 'topup' | 'deduction'>('all')
    const [copiedRefId, setCopiedRefId] = useState<string | null>(null)
    const [copiedRefCode, setCopiedRefCode] = useState(false)

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

    const rawTransactions = data?.transactions?.data || []

    const filteredTransactions = rawTransactions.filter(tx => {
        if (filterType === 'all') return true
        if (filterType === 'topup') return tx.type === 'topup' || tx.type === 'bonus'
        if (filterType === 'deduction') return tx.type === 'deduction'
        return true
    })

    const totalSpent = rawTransactions
        .filter(tx => tx.type === 'deduction' || tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

    const memberSinceDate = (user as any)?.created_at
        ? formatDateClean((user as any).created_at).split(',')[0]
        : '29 Jul 2026'

    const referralCode = `REF-${user?.id || 1001}-${(user?.name || 'VERTEX').substring(0, 4).toUpperCase()}`

    const handleCopyRef = (text: string, isCode: boolean = false) => {
        navigator.clipboard.writeText(text)
        if (isCode) {
            setCopiedRefCode(true)
            setTimeout(() => setCopiedRefCode(false), 2000)
        } else {
            setCopiedRefId(text)
            setTimeout(() => setCopiedRefId(null), 2000)
        }
    }

    return (
        <PageMaintenanceGuard pageKey='billing'>
            <PageContentBlock title='Billing & BOLTs' showFlashKey='credits'>
                <div className='pb-12 text-left font-sans'>
                    {/* Page Header */}
                    <div className='flex items-start justify-between mb-8 mt-6'>
                        <div>
                            <h2 className='text-3xl font-semibold text-white flex items-center gap-2.5'>
                                <BoltSvgIcon className='w-8 h-8 text-amber-400' /> Billing &amp; BOLTs Balance
                            </h2>
                            <p className='text-sm text-gray-400 font-normal mt-1'>
                                Manage your active cloud instance credits, automated billing statements, and payment methods.
                            </p>
                        </div>

                        <button
                            onClick={() => setOpened(true)}
                            className='py-3 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold text-sm flex items-center gap-2.5 cursor-pointer transition active:scale-95 shrink-0'
                        >
                            <SparklesIcon className='w-5 h-5' /> Add BOLTs
                        </button>
                    </div>

                    {/* Top 2-Column Section */}
                    <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch'>
                        {/* LEFT CARD (Balance) */}
                        <div className='bg-[#0c0f18]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-6 shadow-xl flex flex-col justify-between'>
                            <div>
                                <div className='flex items-center justify-between mb-4'>
                                    <span className='text-xs font-bold uppercase tracking-wider text-gray-400'>
                                        AVAILABLE BALANCE
                                    </span>
                                    <span className='bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[9px] px-2.5 py-0.5 font-semibold uppercase tracking-wider flex items-center gap-1.5'>
                                        <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' /> ACTIVE
                                    </span>
                                </div>

                                <div className='flex items-baseline gap-2 my-2'>
                                    <BoltSvgIcon className='w-9 h-9 text-amber-400 self-center shrink-0' />
                                    <span className='text-5xl font-bold text-white tracking-tight'>
                                        {(user?.credits ?? 0).toFixed(2)}
                                    </span>
                                    <span className='text-lg font-normal text-gray-400 ml-1'>
                                        BOLTs
                                    </span>
                                </div>
                            </div>

                            <div>
                                <div className='border-t border-white/[0.06] my-4' />

                                <div className='space-y-2.5 text-xs'>
                                    <div className='flex items-center justify-between'>
                                        <span className='text-gray-400 font-medium'>Total Spent</span>
                                        <span className='font-mono font-semibold text-rose-400'>
                                            -{totalSpent.toFixed(2)} BOLTs
                                        </span>
                                    </div>
                                    <div className='flex items-center justify-between'>
                                        <span className='text-gray-400 font-medium'>Member Since</span>
                                        <span className='font-mono font-semibold text-gray-300'>
                                            {memberSinceDate}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT CARD (Info & Referral) */}
                        <div className='bg-[#0c0f18]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-6 shadow-xl flex flex-col justify-between'>
                            <div>
                                <div className='text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2'>
                                    <InformationCircleIcon className='w-4 h-4 text-blue-400' /> BILLING &amp; REFERRAL INFO
                                </div>
                                <p className='text-sm text-gray-400 leading-relaxed'>
                                    Server renewals and VPS billing are automatically debited from your BOLTs balance every 30 days. Maintain a positive balance to avoid instance suspension.
                                </p>
                            </div>

                            <div className='mt-6 pt-4 border-t border-white/[0.06]'>
                                <label className='block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2'>
                                    CLIENT REFERRAL CODE
                                </label>
                                <div className='flex items-center gap-2 bg-[#121624] border border-white/[0.08] rounded-xl p-2.5 px-3 font-mono text-xs text-blue-400 justify-between'>
                                    <span className='truncate font-semibold'>{referralCode}</span>
                                    <button
                                        type='button'
                                        onClick={() => handleCopyRef(referralCode, true)}
                                        className='p-1.5 hover:bg-white/[0.08] rounded-lg text-gray-400 hover:text-white transition cursor-pointer shrink-0'
                                        title='Copy Referral Code'
                                    >
                                        {copiedRefCode ? (
                                            <CheckIcon className='w-4 h-4 text-emerald-400' />
                                        ) : (
                                            <ClipboardDocumentIcon className='w-4 h-4' />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Transaction Table Card */}
                    <div className='bg-[#0c0f18]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl shadow-xl overflow-hidden'>
                        {/* Table Header & Filter Tabs */}
                        <div className='p-6 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-4'>
                            <div className='flex items-center gap-3'>
                                <div className='w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400'>
                                    <ReceiptPercentIcon className='w-5 h-5' />
                                </div>
                                <div>
                                    <div className='flex items-center gap-2'>
                                        <h3 className='font-bold text-lg text-white tracking-tight'>
                                            BOLT Transactions
                                        </h3>
                                        <span className='bg-neutral-800 border border-neutral-700 text-gray-400 text-xs rounded-full px-2.5 py-0.5 font-mono'>
                                            {filteredTransactions.length} Statements
                                        </span>
                                    </div>
                                    <p className='text-xs text-gray-400 mt-0.5'>
                                        Automated server renewal debits, deposits, and promotional rewards.
                                    </p>
                                </div>
                            </div>

                            {/* Filter Tabs */}
                            <div className='bg-[#121624] p-1 rounded-xl border border-white/[0.08] flex items-center gap-1 text-xs font-semibold'>
                                <button
                                    onClick={() => setFilterType('all')}
                                    className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                                        filterType === 'all'
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-500/20 font-bold'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setFilterType('topup')}
                                    className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                                        filterType === 'topup'
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-500/20 font-bold'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    Top-Ups
                                </button>
                                <button
                                    onClick={() => setFilterType('deduction')}
                                    className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                                        filterType === 'deduction'
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-500/20 font-bold'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    Deductions
                                </button>
                            </div>
                        </div>

                        {/* Table Content */}
                        {isLoading ? (
                            <div className='p-12 text-center text-gray-400 text-xs font-semibold'>
                                Loading transaction history...
                            </div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className='p-12 text-center text-gray-400'>
                                <CreditCardIcon className='w-12 h-12 mx-auto text-gray-600 mb-3' />
                                <p className='font-bold text-sm text-gray-300'>No transactions matching filter</p>
                                <p className='text-xs text-gray-500 mt-1'>Select another view or add BOLTs to your balance.</p>
                            </div>
                        ) : (
                            <div className='overflow-x-auto'>
                                <table className='w-full text-left text-xs border-collapse font-sans'>
                                    <thead>
                                        <tr className='bg-[#121624]/60 border-b border-white/[0.06] text-gray-400 text-xs font-bold uppercase tracking-wider'>
                                            <th className='py-3.5 px-5'>Reference ID</th>
                                            <th className='py-3.5 px-5'>Type</th>
                                            <th className='py-3.5 px-5'>Activity Description</th>
                                            <th className='py-3.5 px-5'>Timestamp</th>
                                            <th className='py-3.5 px-5 text-right'>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-white/[0.04] text-gray-200'>
                                        {filteredTransactions.map((tx: CreditTransaction) => {
                                            const parsed = formatTxDescription(tx.description)
                                            const refId = tx.reference_id || `TX-${tx.id}`
                                            const isDeduction = tx.type === 'deduction' || tx.amount < 0
                                            const absVal = Math.abs(tx.amount).toFixed(2)

                                            return (
                                                <tr
                                                    key={tx.id}
                                                    className='hover:bg-white/[0.05] transition-colors duration-150 group border-b border-white/[0.04]'
                                                >
                                                    {/* Reference ID Column */}
                                                    <td className='py-4 px-5 align-middle whitespace-nowrap'>
                                                        <div className='flex items-center gap-2 font-mono text-xs text-gray-400 group-hover:text-gray-200 transition-colors'>
                                                            <span>{refId}</span>
                                                            <button
                                                                type='button'
                                                                onClick={() => handleCopyRef(refId)}
                                                                className='opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-500 hover:text-white cursor-pointer'
                                                                title='Copy Reference ID'
                                                            >
                                                                {copiedRefId === refId ? (
                                                                    <CheckIcon className='w-3 h-3 text-emerald-400' />
                                                                ) : (
                                                                    <ClipboardDocumentIcon className='w-3 h-3' />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>

                                                    {/* Type Pills */}
                                                    <td className='py-4 px-5 align-middle whitespace-nowrap'>
                                                        {isDeduction ? (
                                                            <span className='bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-[9px] px-2.5 py-0.5 font-semibold uppercase tracking-wider inline-flex items-center gap-1'>
                                                                <ArrowDownRightIcon className='w-3 h-3' /> Deduction
                                                            </span>
                                                        ) : (
                                                            <span className='bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[9px] px-2.5 py-0.5 font-semibold uppercase tracking-wider inline-flex items-center gap-1'>
                                                                <ArrowUpRightIcon className='w-3 h-3' /> Topup
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Activity Description */}
                                                    <td className='py-4 px-5 align-middle font-sans'>
                                                        <div className='font-bold text-white text-xs tracking-tight'>
                                                            {parsed.title}
                                                        </div>
                                                        {parsed.detail && (
                                                            <div className='text-[11px] text-gray-400 font-medium mt-0.5'>
                                                                {parsed.detail}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Timestamp Column */}
                                                    <td className='py-4 px-5 align-middle whitespace-nowrap text-xs text-gray-400 font-mono'>
                                                        {formatDateClean(tx.created_at)}
                                                    </td>

                                                    {/* Amount Badges */}
                                                    <td className='py-4 px-5 text-right align-middle whitespace-nowrap'>
                                                        {isDeduction ? (
                                                            <span className='bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold min-w-[120px] text-right inline-block'>
                                                                -{absVal} BOLTs
                                                            </span>
                                                        ) : (
                                                            <span className='bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold min-w-[120px] text-right inline-block'>
                                                                +{absVal} BOLTs
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Top Up Modal */}
                    <Modal
                        opened={opened}
                        onClose={() => setOpened(false)}
                        title={<div className='font-bold text-lg text-white font-sans tracking-tight'>Top Up Account BOLTs</div>}
                        centered
                        size='md'
                        styles={{
                            modal: { backgroundColor: '#0c0f18', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' },
                            header: { backgroundColor: '#0c0f18', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)' },
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
                                                    : 'border-white/[0.08] bg-[#121624] text-gray-300 hover:bg-gray-800'
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
                                    className='w-full px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-[#121624] text-white font-mono font-semibold text-xs focus:outline-none focus:border-blue-500'
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
                                                    : 'border-white/[0.08] bg-[#121624] text-gray-400 hover:bg-gray-800'
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
                                    className='px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs cursor-pointer'
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
                </div>
            </PageContentBlock>
        </PageMaintenanceGuard>
    )
}

export default CreditsContainer
