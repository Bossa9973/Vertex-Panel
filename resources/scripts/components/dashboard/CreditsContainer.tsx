import { getCredits, topUpCredits, CreditTransaction } from '@/api/credits'
import PageContentBlock from '@/components/elements/PageContentBlock'
import { useStoreActions, useStoreState } from '@/state'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import PageMaintenanceGuard from '@/components/elements/PageMaintenanceGuard'
import { useNavigate } from 'react'
import { motion } from 'framer-motion'
import {
    ArrowUpRight,
    ArrowDownLeft,
    Copy,
    Check,
    Clipboard,
    Sparkles,
    Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

    if (/promo/i.test(desc)) {
        return {
            title: 'Promo Code Redemption',
            detail: 'Bonus credits added via promotional code',
        }
    }

    if (/discord/i.test(desc)) {
        return {
            title: 'Discord Reward Bonus',
            detail: 'Earned rewards for Discord community participation',
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

const formatDateShort = (dateStr?: string | null) => {
    if (!dateStr) return '29 Jul 2026'
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return '29 Jul 2026'
        const day = String(d.getDate()).padStart(2, '0')
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const month = months[d.getMonth()]
        const year = d.getFullYear()
        return `${day} ${month} ${year}`
    } catch {
        return '29 Jul 2026'
    }
}

const CreditsContainer = () => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)
    const navigate = useNavigate()
    const [opened, setOpened] = useState(false)
    const [selectedAmount, setSelectedAmount] = useState<number>(25)
    const [customAmount, setCustomAmount] = useState<string>('')
    const [paymentMethod, setPaymentMethod] = useState<string>('Credit Card')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [filterType, setFilterType] = useState<'all' | 'topup' | 'deduction'>('all')
    const [copiedReferral, setCopiedReferral] = useState(false)
    const [copiedRefId, setCopiedRefId] = useState<string | null>(null)

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

    const rawTransactions: CreditTransaction[] = data?.transactions?.data || []
    const filteredTransactions = rawTransactions.filter(tx => {
        if (filterType === 'all') return true
        if (filterType === 'topup') return tx.type === 'topup' || tx.type === 'bonus' || tx.amount > 0
        if (filterType === 'deduction') return tx.type === 'deduction' || tx.amount < 0
        return true
    })

    const totalSpent = rawTransactions
        .filter(tx => tx.type === 'deduction' || tx.amount < 0)
        .reduce((acc, tx) => acc + Math.abs(tx.amount), 0)

    const referralCode = user?.id
        ? `VERTEX-REF-${String(user.id).padStart(4, '0')}`
        : 'VERTEX-REF-1001'

    const handleCopyReferral = () => {
        navigator.clipboard.writeText(referralCode)
        setCopiedReferral(true)
        setTimeout(() => setCopiedReferral(false), 2000)
    }

    const handleCopyRefId = (refId: string) => {
        navigator.clipboard.writeText(refId)
        setCopiedRefId(refId)
        setTimeout(() => setCopiedRefId(null), 2000)
    }

    const filterTabs = [
        { id: 'all', label: 'All' },
        { id: 'topup', label: 'Top-Ups' },
        { id: 'deduction', label: 'Deductions' },
    ] as const

    return (
        <PageMaintenanceGuard pageKey='billing'>
        <PageContentBlock title='Billing & BOLTs' showFlashKey='credits'>
            <div className='pb-12 font-sans text-left'>
                {/* TOP SECTION — 2 Column Layout */}
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch'>
                    {/* LEFT CARD (Balance) — Glassmorphism style with colored orbs behind it */}
                    <div className='relative w-full rounded-2xl'>
                        {/* Blue orb behind card */}
                        <div className='absolute top-0 left-0 w-48 h-48 rounded-full bg-blue-600/60 blur-3xl z-0 pointer-events-none' />
                        {/* Amber orb behind card */}
                        <div className='absolute bottom-0 right-0 w-40 h-40 rounded-full bg-amber-500/50 blur-3xl z-0 pointer-events-none' />

                        {/* The Card itself */}
                        <div className='relative z-10 backdrop-blur-xl bg-black/30 border border-white/[0.08] rounded-2xl shadow-[0px_0px_120px_-20px_#0900ff] border-t border-t-blue-500/20 p-6 flex flex-col justify-between h-full'>
                            <div>
                                {/* Eyebrow */}
                                <div className='text-xs font-bold uppercase tracking-wider text-gray-400 mb-2'>
                                    AVAILABLE BALANCE
                                </div>

                                {/* Balance Readout */}
                                <div className='text-5xl font-bold text-white flex items-center tracking-tight mb-6'>
                                    <BoltSvgIcon className='w-10 h-10 text-amber-400 inline-block mr-2 shrink-0' />
                                    <span>{(user?.credits ?? 0).toFixed(2)}</span>
                                    <span className='text-lg text-gray-400 ml-2 font-normal'>BOLTs</span>
                                </div>

                                {/* Two Action Buttons Side by Side */}
                                <div className='flex items-center gap-6 mb-4'>
                                    {/* Top Up */}
                                    <div className='flex flex-col items-center gap-1.5'>
                                        <button
                                            type='button'
                                            onClick={() => setOpened(true)}
                                            className='w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-400 shadow-lg shadow-blue-500/50 text-white flex items-center justify-center cursor-pointer transition-all active:scale-95'
                                            title='Top Up Account BOLTs'
                                        >
                                            <ArrowUpRight className='w-5 h-5 text-white' />
                                        </button>
                                        <span className='text-xs text-white font-medium'>Top Up</span>
                                    </div>

                                    {/* Earn Free */}
                                    <div className='flex flex-col items-center gap-1.5'>
                                        <button
                                            type='button'
                                            onClick={() => navigate('/earn')}
                                            className='w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-500/50 text-white flex items-center justify-center cursor-pointer transition-all active:scale-95'
                                            title='Earn Free BOLTs'
                                        >
                                            <ArrowDownLeft className='w-5 h-5 text-white' />
                                        </button>
                                        <span className='text-xs text-white font-medium'>Earn Free</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                {/* Divider */}
                                <div className='border-t border-white/[0.06] my-4' />

                                {/* Two Stat Rows */}
                                <div className='space-y-2 mb-4'>
                                    <div className='flex items-center justify-between text-xs'>
                                        <span className='text-gray-500'>Total Spent</span>
                                        <span className='text-gray-300 font-mono font-semibold'>
                                            {totalSpent.toFixed(2)} BOLTs
                                        </span>
                                    </div>
                                    <div className='flex items-center justify-between text-xs'>
                                        <span className='text-gray-500'>Member Since</span>
                                        <span className='text-gray-300 font-mono font-semibold'>
                                            {formatDateShort((user as any)?.created_at || (user as any)?.createdAt)}
                                        </span>
                                    </div>
                                </div>

                                {/* Bottom Row */}
                                <div className='flex items-center justify-between text-xs pt-1 border-t border-white/[0.04]'>
                                    <span className='px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5'>
                                        <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' />
                                        Active
                                    </span>
                                    <span className='text-gray-400 font-mono truncate max-w-[160px] sm:max-w-[200px]'>
                                        {user?.email || 'user@vertex.local'}
                                    </span>
                                    <span className='text-gray-500 font-mono'>
                                        ACCT •••• {String(user?.id || 1001).padStart(4, '0')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT CARD — Dashboard Card Style */}
                    <div className='bg-black/40 backdrop-blur-sm border border-white/[0.06] border-t border-t-blue-500/20 shadow-[0px_0px_120px_-20px_#0900ff] rounded-2xl p-6 flex flex-col justify-between relative h-full'>
                        <div>
                            {/* Section Label */}
                            <div className='text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2'>
                                <Sparkles className='w-4 h-4 text-blue-400' /> BILLING &amp; REFERRAL INFO
                            </div>

                            {/* Automated Billing Info */}
                            <p className='text-sm text-gray-400 leading-relaxed mb-6'>
                                Automated billing automatically deducts from your active BOLT balance every 30 days per running instance. Keep your account topped up to prevent automated instance suspensions.
                            </p>
                        </div>

                        <div>
                            {/* Sub-label */}
                            <label className='block text-xs uppercase tracking-wider text-gray-500 font-bold mb-2'>
                                YOUR REFERRAL CODE
                            </label>

                            {/* Split-input Referral Code */}
                            <div className='flex items-center w-full'>
                                <input
                                    type='text'
                                    readOnly
                                    value={referralCode}
                                    className='w-full px-3.5 py-2.5 rounded-l-xl border border-r-0 border-neutral-700 bg-black/60 text-white font-mono text-[11px] focus:outline-none transition'
                                />
                                <button
                                    type='button'
                                    onClick={handleCopyReferral}
                                    className='px-4 py-2.5 rounded-r-xl border border-neutral-700 bg-blue-600 hover:bg-blue-500 text-white font-mono text-[11px] font-bold shrink-0 cursor-pointer flex items-center gap-1.5 transition active:scale-95'
                                >
                                    {copiedReferral ? <Check className='w-3.5 h-3.5' /> : <Copy className='w-3.5 h-3.5' />}
                                    {copiedReferral ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* TRANSACTION TABLE CARD */}
                <div className='bg-black/40 backdrop-blur-sm border border-white/[0.06] border-t border-t-blue-500/20 shadow-[0px_0px_120px_-20px_#0900ff] text-white relative rounded-2xl font-sans text-left overflow-hidden'>
                    {/* Subtle top-to-bottom overlay gradient */}
                    <div className='absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none z-0' />

                    {/* Table Header & Filter Controls */}
                    <div className='relative z-10 p-6 border-b border-neutral-700/80 flex flex-wrap items-center justify-between gap-4'>
                        <div className='flex items-center gap-3.5'>
                            <div className='w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]'>
                                <Receipt className='w-5 h-5' />
                            </div>
                            <div>
                                <div className='flex items-center gap-2.5'>
                                    <h3 className='font-bold text-lg text-white tracking-tight'>
                                        STATEMENTS &amp; TRANSACTIONS
                                    </h3>
                                    <span className='bg-neutral-800 border border-neutral-700 text-gray-400 text-xs rounded-full px-2 py-0.5 font-mono font-bold'>
                                        {filteredTransactions.length}
                                    </span>
                                </div>
                                <p className='text-xs text-gray-400 mt-0.5'>
                                    Recent balance additions, bonuses, and server billing statements.
                                </p>
                            </div>
                        </div>

                        {/* Filter Tabs — Exact StepPillSwitch style from VpsDeployModal */}
                        <div className='relative z-10 flex w-fit rounded-full bg-neutral-900/90 border border-gray-700/80 p-1 backdrop-blur-md'>
                            {filterTabs.map(tab => {
                                const isActive = filterType === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        type='button'
                                        onClick={() => setFilterType(tab.id)}
                                        className={cn(
                                            'relative z-10 w-fit h-9 rounded-full sm:px-4 px-3 py-1 text-xs font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5',
                                            isActive ? 'text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                                        )}
                                    >
                                        {isActive && (
                                            <motion.span
                                                layoutId='filterTabSwitch'
                                                className='absolute top-0 left-0 h-9 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-500 bg-gradient-to-t from-blue-600 to-blue-500'
                                                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                                            />
                                        )}
                                        <span className='relative flex items-center gap-1.5 z-10'>
                                            {tab.label}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Table Body */}
                    {isLoading ? (
                        <div className='p-12 text-center text-gray-400 text-xs font-semibold relative z-10'>
                            Loading transaction history...
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className='p-12 text-center text-gray-400 relative z-10'>
                            <p className='font-bold text-sm text-gray-300'>No transactions matching filter</p>
                            <p className='text-xs text-gray-500 mt-1'>Top up your account balance or select another filter view.</p>
                        </div>
                    ) : (
                        <div className='overflow-x-auto relative z-10'>
                            <table className='w-full text-left text-xs border-collapse font-sans'>
                                <thead>
                                    <tr className='bg-black/40 border-b border-white/[0.08] text-gray-400 text-xs font-bold uppercase tracking-wider'>
                                        <th className='py-3.5 px-5'>REFERENCE ID</th>
                                        <th className='py-3.5 px-5'>TYPE</th>
                                        <th className='py-3.5 px-5'>DESCRIPTION</th>
                                        <th className='py-3.5 px-5'>TIMESTAMP</th>
                                        <th className='py-3.5 px-5 text-right'>AMOUNT</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-white/[0.04] text-gray-200'>
                                    {filteredTransactions.map((tx: CreditTransaction) => {
                                        const parsed = formatTxDescription(tx.description)
                                        const isDeduction = tx.type === 'deduction' || tx.amount < 0
                                        const absVal = Math.abs(tx.amount).toFixed(2)
                                        const refId = tx.reference_id || `#TX-${tx.id}`

                                        return (
                                            <tr
                                                key={tx.id}
                                                className='hover:bg-white/[0.05] relative group transition-colors duration-150'
                                            >
                                                {/* Left Accent Border on Hover */}
                                                <div className='absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity' />

                                                {/* Reference ID Column */}
                                                <td className='py-4 px-5 align-middle'>
                                                    <div className='flex items-center gap-1.5 font-mono text-xs text-gray-400'>
                                                        <span>{refId}</span>
                                                        <button
                                                            type='button'
                                                            onClick={() => handleCopyRefId(refId)}
                                                            className='opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-white cursor-pointer p-0.5'
                                                            title='Copy Reference ID'
                                                        >
                                                            {copiedRefId === refId ? (
                                                                <Check className='w-3 h-3 text-emerald-400' />
                                                            ) : (
                                                                <Clipboard className='w-3 h-3' />
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Type Pills */}
                                                <td className='py-4 px-5 align-middle'>
                                                    {isDeduction ? (
                                                        <span className='bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-[9px] px-2 py-0.5 font-semibold uppercase inline-block'>
                                                            Deduction
                                                        </span>
                                                    ) : tx.type === 'bonus' ? (
                                                        <span className='bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-[9px] px-2 py-0.5 font-semibold uppercase inline-block'>
                                                            Topup
                                                        </span>
                                                    ) : (
                                                        <span className='bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[9px] px-2 py-0.5 font-semibold uppercase inline-block'>
                                                            Topup
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Description */}
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
                                                <td className='py-4 px-5 align-middle text-xs text-gray-400 font-mono whitespace-nowrap'>
                                                    {formatDateClean(tx.created_at)}
                                                </td>

                                                {/* Amount Badges */}
                                                <td className='py-4 px-5 text-right align-middle'>
                                                    {isDeduction ? (
                                                        <span className='bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold min-w-[130px] text-right inline-block'>
                                                            -{absVal} BOLTs
                                                        </span>
                                                    ) : (
                                                        <span className='bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold min-w-[130px] text-right inline-block'>
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
                                            : 'border-white/[0.08] bg-[#16181d] text-gray-300 hover:bg-slate-800'
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
                                            : 'border-white/[0.08] bg-[#16181d] text-gray-400 hover:bg-slate-800'
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
                            className='px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 font-bold text-xs cursor-pointer'
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
