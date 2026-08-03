import { getCredits, topUpCredits, CreditTransaction } from '@/api/credits'
import PageContentBlock from '@/components/elements/PageContentBlock'
import { useStoreActions, useStoreState } from '@/state'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import {
    CreditCardIcon,
    PlusIcon,
    SparklesIcon,
    ShieldCheckIcon,
    ArrowUpRightIcon,
    ArrowDownRightIcon,
    ReceiptPercentIcon,
    ClockIcon,
    HashtagIcon,
} from '@heroicons/react/24/outline'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import BorderBeam from '@/components/ui/BorderBeam'
import { GlassWalletCard } from '@/components/dashboard/GlassWalletCard'
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

const CreditsContainer = () => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)
    const [opened, setOpened] = useState(false)
    const [selectedAmount, setSelectedAmount] = useState<number>(25)
    const [customAmount, setCustomAmount] = useState<string>('')
    const [paymentMethod, setPaymentMethod] = useState<string>('Credit Card')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [filterType, setFilterType] = useState<'all' | 'topup' | 'deduction'>('all')

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

    const renderTxAmount = (tx: CreditTransaction) => {
        const isDeduction = tx.type === 'deduction' || tx.amount < 0
        const absVal = Math.abs(tx.amount).toFixed(2)

        if (isDeduction) {
            return (
                <span className='font-mono font-bold text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-lg shadow-xs inline-flex items-center gap-1.5'>
                    <BoltSvgIcon className='w-3.5 h-3.5 text-rose-400' />
                    <span>-{absVal} BOLTs</span>
                </span>
            )
        }
        return (
            <span className='font-mono font-bold text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg shadow-xs inline-flex items-center gap-1.5'>
                <BoltSvgIcon className='w-3.5 h-3.5 text-emerald-400' />
                <span>+{absVal} BOLTs</span>
            </span>
        )
    }

    return (
        <PageMaintenanceGuard pageKey='billing'>
        <PageContentBlock title='Billing & BOLTs' showFlashKey='credits'>
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 font-sans items-stretch'>
                {/* Glass Wallet Balance Card */}
                <div className='lg:col-span-2 flex flex-col justify-center'>
                    <GlassWalletCard
                        balance={(user?.credits ?? 0).toFixed(2)}
                        currency='BOLTs'
                        cardHolder={(user as any) ? `${(user as any).firstname || ''} ${(user as any).lastname || ''}`.trim() || (user as any).username || user?.email : 'Account Client'}
                        cardNumber={`ACCT •••• •••• ${String((user as any)?.id || 1001).padStart(4, '0')}`}
                        expiry='Automated'
                        address={user?.email ? user.email.split('@')[0] : 'Active'}
                        trend='Active'
                        onTopUp={() => setOpened(true)}
                        className='max-w-none w-full'
                    />
                </div>

                {/* Quick Info Card */}
                <div className='relative overflow-hidden bg-white/80 dark:bg-neutral-900/70 border border-blue-400/40 dark:border-blue-500/30 text-slate-900 dark:text-white rounded-2xl p-6 flex flex-col justify-between shadow-xl shadow-blue-500/10 dark:shadow-2xl dark:shadow-blue-950/30 backdrop-blur-xl font-sans hover:border-blue-500/60 dark:hover:border-blue-400/50 transition-all'>
                    <div>
                        <div className='flex items-center gap-2 text-blue-500 dark:text-blue-400 font-bold text-xs uppercase tracking-wider mb-2'>
                            <SparklesIcon className='w-4 h-4' /> Client Referral & Bonus
                        </div>
                        <h4 className='text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight'>
                            Welcome Bonus Applied!
                        </h4>
                        <p className='text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans'>
                            Every new account receives 10.00 BOLTs initial bonus. Need additional server capacity? Add BOLTs anytime.
                        </p>
                    </div>
                    <div className='mt-6 bg-slate-100/80 dark:bg-[#0d0e11] rounded-xl p-3.5 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xs font-sans'>
                        Automated billing automatically deducts from your active BOLT balance.
                    </div>
                </div>
            </div>

            {/* Modernized BOLT Activity & Transactions Table */}
            <div className='relative overflow-hidden bg-white/80 dark:bg-neutral-900/70 border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-2xl dark:shadow-blue-950/20 backdrop-blur-xl font-sans hover:border-slate-300 dark:hover:border-white/20 transition-all'>
                {/* Header & Filter Controls */}
                <div className='p-6 border-b border-slate-200/80 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-4'>
                    <div className='flex items-center gap-3.5'>
                        <div className='w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]'>
                            <ReceiptPercentIcon className='w-5 h-5' />
                        </div>
                        <div>
                            <div className='flex items-center gap-2.5'>
                                <h3 className='font-bold text-lg text-slate-900 dark:text-white tracking-tight'>
                                    BOLT Activity & Transactions
                                </h3>
                                <span className='px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono font-bold'>
                                    {filteredTransactions.length} Statements
                                </span>
                            </div>
                            <p className='text-xs text-slate-400 mt-0.5'>
                                Recent balance additions, bonuses, and server billing statements.
                            </p>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className='flex items-center gap-1.5 bg-[#0d0e11] p-1 rounded-xl border border-white/[0.08] text-xs font-semibold'>
                        <button
                            onClick={() => setFilterType('all')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                                filterType === 'all'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilterType('topup')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                                filterType === 'topup'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Top-Ups
                        </button>
                        <button
                            onClick={() => setFilterType('deduction')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                                filterType === 'deduction'
                                    ? 'bg-rose-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Deductions
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className='p-12 text-center text-slate-400 text-xs font-semibold'>
                        Loading transaction history...
                    </div>
                ) : filteredTransactions.length === 0 ? (
                    <div className='p-12 text-center text-slate-400'>
                        <CreditCardIcon className='w-12 h-12 mx-auto text-slate-600 mb-3' />
                        <p className='font-bold text-sm text-slate-300'>No transactions matching filter</p>
                        <p className='text-xs text-slate-500 mt-1'>Top up your account balance or select another filter view.</p>
                    </div>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full text-left text-xs border-collapse font-sans'>
                            <thead>
                                <tr className='bg-[#0d0e11]/80 border-b border-white/[0.08] text-slate-400 text-[11px] font-semibold tracking-wider uppercase'>
                                    <th className='py-3.5 px-5'>Reference ID</th>
                                    <th className='py-3.5 px-5'>Type</th>
                                    <th className='py-3.5 px-5'>Activity Description</th>
                                    <th className='py-3.5 px-5'>Timestamp</th>
                                    <th className='py-3.5 px-5 text-right'>Amount</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-white/[0.04] text-slate-200'>
                                {filteredTransactions.map((tx: CreditTransaction) => {
                                    const parsed = formatTxDescription(tx.description)

                                    return (
                                        <tr key={tx.id} className='hover:bg-white/[0.03] transition-colors duration-150 group'>
                                            {/* Reference ID Pill */}
                                            <td className='py-4 px-5 align-middle'>
                                                <span className='font-mono text-[11px] font-bold text-slate-300 tracking-tight bg-[#0d0e11] border border-white/[0.08] px-2.5 py-1 rounded-lg shadow-xs inline-flex items-center gap-1.5 group-hover:border-blue-500/40 transition-colors'>
                                                    <HashtagIcon className='w-3 h-3 text-slate-500' />
                                                    {tx.reference_id || `#TX-${tx.id}`}
                                                </span>
                                            </td>

                                            {/* Styled Type Badges with Icons */}
                                            <td className='py-4 px-5 align-middle'>
                                                {tx.type === 'bonus' ? (
                                                    <span className='px-3 py-1 rounded-full text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-xs capitalize'>
                                                        <SparklesIcon className='w-3 h-3' /> bonus
                                                    </span>
                                                ) : tx.type === 'topup' ? (
                                                    <span className='px-3 py-1 rounded-full text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-xs capitalize'>
                                                        <ArrowUpRightIcon className='w-3 h-3' /> topup
                                                    </span>
                                                ) : (
                                                    <span className='px-3 py-1 rounded-full text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-xs capitalize'>
                                                        <ArrowDownRightIcon className='w-3 h-3' /> deduction
                                                    </span>
                                                )}
                                            </td>

                                            {/* Human-Friendly Activity Description & Sub-details */}
                                            <td className='py-4 px-5 align-middle font-sans'>
                                                <div className='font-bold text-white text-xs tracking-tight'>
                                                    {parsed.title}
                                                </div>
                                                {parsed.detail && (
                                                    <div className='text-[11px] text-slate-400 font-medium mt-0.5 tracking-normal'>
                                                        {parsed.detail}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Clean International Timestamp */}
                                            <td className='py-4 px-5 align-middle text-[11px] text-slate-400 font-mono tracking-tight'>
                                                <div className='flex items-center gap-1.5'>
                                                    <ClockIcon className='w-3.5 h-3.5 text-slate-500 shrink-0' />
                                                    <span>{formatDateClean(tx.created_at)}</span>
                                                </div>
                                            </td>

                                            {/* Amount Readout */}
                                            <td className='py-4 px-5 text-right align-middle'>
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
                <div className='relative space-y-5 pt-2 font-sans'>
                    <LoadingOverlay visible={isSubmitting} />

                    <div>
                        <label className='block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2'>
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
                                            : 'border-white/[0.08] bg-[#16181d] text-slate-300 hover:bg-slate-800'
                                    }`}
                                >
                                    {amt} BOLTs
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className='block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1'>
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
                        <label className='block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2'>
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
                                            : 'border-white/[0.08] bg-[#16181d] text-slate-400 hover:bg-slate-800'
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
                            className='px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer'
                        >
                            Cancel
                        </button>
                        <button
                            type='button'
                            onClick={handleTopUp}
                            className='px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 active:scale-95 cursor-pointer'
                        >
                            Pay & Add ${customAmount ? customAmount : selectedAmount} BOLTs
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContentBlock>
        </PageMaintenanceGuard>
    )
}

export default CreditsContainer
