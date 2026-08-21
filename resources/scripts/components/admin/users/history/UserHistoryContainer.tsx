import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
    getUserHistory,
    getTransactionDetails,
    UserHistoryData,
    TransactionDetailsData,
    SpendingTransaction,
    PromoCodeRecord,
    OwnedServer,
    ServerLifecycleEvent,
} from '@/api/admin/users/getUserHistory'
import http from '@/api/http'
import Spinner from '@/components/elements/Spinner'
import { Modal, LoadingOverlay } from '@mantine/core'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import {
    CurrencyDollarIcon,
    ServerIcon,
    GiftIcon,
    ArrowTrendingDownIcon,
    ArrowTrendingUpIcon,
    ClockIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    MinusIcon,
    ShieldCheckIcon,
    ChatBubbleLeftRightIcon,
    SparklesIcon,
    ArrowTopRightOnSquareIcon,
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

interface Props {
    userId?: number
}

const UserHistoryContainer = ({ userId: propUserId }: Props) => {
    const params = useParams<{ id: string }>()
    const effectiveUserId = propUserId || (params.id ? parseInt(params.id, 10) : null)

    const [history, setHistory] = useState<UserHistoryData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'spending' | 'promos' | 'servers' | 'lifecycle' | 'discord'>('spending')

    // Spending filter & search
    const [txSearch, setTxSearch] = useState('')
    const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'deduction' | 'deposit' | 'bonus'>('all')

    // Modal state for balance adjustments
    const [balanceModalOpen, setBalanceModalOpen] = useState(false)
    const [action, setAction] = useState<'add' | 'remove' | 'set'>('add')
    const [amount, setAmount] = useState(10)
    const [description, setDescription] = useState('')
    const [submittingBalance, setSubmittingBalance] = useState(false)

    // Transaction inspection modal state
    const [txModalOpen, setTxModalOpen] = useState(false)
    const [txSearchInput, setTxSearchInput] = useState('')
    const [txLoading, setTxLoading] = useState(false)
    const [txError, setTxError] = useState<string | null>(null)
    const [txDetails, setTxDetails] = useState<TransactionDetailsData | null>(null)

    const loadData = () => {
        if (!effectiveUserId) return
        setLoading(true)
        setError(null)
        getUserHistory(effectiveUserId)
            .then(data => setHistory(data))
            .catch(err => {
                console.error(err)
                setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load user history.')
            })
            .finally(() => setLoading(false))
    }

    const handleLookupTx = async (identifier?: string) => {
        const query = (identifier || txSearchInput).trim()
        if (!query) return
        setTxLoading(true)
        setTxError(null)
        setTxSearchInput(query)
        setTxModalOpen(true)
        try {
            const data = await getTransactionDetails(query)
            if (!data.ok) {
                setTxError('Transaction record not found.')
                setTxDetails(null)
            } else {
                setTxDetails(data)
            }
        } catch (e: any) {
            setTxError(e.response?.data?.error || e.response?.data?.message || 'Failed to fetch transaction details.')
            setTxDetails(null)
        } finally {
            setTxLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [effectiveUserId])

    const handleExecuteCreditAdjustment = async () => {
        if (!history?.user) return
        setSubmittingBalance(true)
        try {
            await http.post(`/api/admin/users/${history.user.id}/credits`, {
                action,
                amount,
                description,
            })
            setBalanceModalOpen(false)
            loadData()
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to update user balance.')
        } finally {
            setSubmittingBalance(false)
        }
    }

    if (loading) {
        return (
            <div className='py-20 flex flex-col items-center justify-center space-y-3'>
                <Spinner />
                <p className='text-xs text-gray-400 font-medium'>Fetching comprehensive user history & metrics...</p>
            </div>
        )
    }

    if (error || !history) {
        return (
            <div className='py-16 text-center max-w-md mx-auto'>
                <div className='w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 grid place-items-center mx-auto mb-3'>
                    ⚠️
                </div>
                <h3 className='text-lg font-bold text-white'>Unable to Load User History</h3>
                <p className='text-xs text-gray-400 mt-1 mb-4'>{error || 'User not found.'}</p>
                <button
                    onClick={loadData}
                    className='px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition'
                >
                    Retry
                </button>
            </div>
        )
    }

    const { user, summary, balance, spending_history, promo_history, owned_servers, server_history, discord } = history

    // Filter transactions
    const filteredTransactions = spending_history.filter(tx => {
        const matchesSearch =
            !txSearch ||
            (tx.description || '').toLowerCase().includes(txSearch.toLowerCase()) ||
            (tx.reference_id || '').toLowerCase().includes(txSearch.toLowerCase()) ||
            (tx.type || '').toLowerCase().includes(txSearch.toLowerCase())

        if (!matchesSearch) return false

        if (txTypeFilter === 'deduction') return tx.amount < 0 || tx.type === 'deduction'
        if (txTypeFilter === 'deposit') return tx.amount > 0 && ['topup', 'deposit', 'admin_deposit'].includes(tx.type)
        if (txTypeFilter === 'bonus') return tx.type === 'bonus' || tx.type === 'promo'

        return true
    })

    return (
        <div className='space-y-6'>
            {/* ─── Top Profile Header ────────────────────────────────────────────── */}
            <div className='p-6 bg-[#121418] border border-gray-800 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4'>
                <div className='flex items-center gap-4'>
                    <div className='w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-extrabold text-xl grid place-items-center shadow-lg shadow-blue-500/20'>
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className='flex items-center gap-2.5 flex-wrap'>
                            <h2 className='text-xl font-extrabold text-white'>{user.name}</h2>
                            <span className='font-mono text-xs text-gray-500'>#{user.id}</span>
                            {user.root_admin ? (
                                <span className='px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center gap-1'>
                                    <ShieldCheckIcon className='w-3 h-3' /> Admin
                                </span>
                            ) : (
                                <span className='px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-800 border border-gray-700 text-gray-400'>
                                    Client
                                </span>
                            )}
                        </div>
                        <div className='flex items-center gap-3 mt-1 text-xs text-gray-400 font-mono flex-wrap'>
                            <span>{user.email}</span>
                            {user.discord_id && (
                                <span className='flex items-center gap-1 text-[#5865F2] bg-[#5865F2]/10 px-2 py-0.5 rounded-md border border-[#5865F2]/20'>
                                    Discord: {user.discord_username || user.discord_id}
                                </span>
                            )}
                            {user.created_at && (
                                <span className='text-gray-500 font-sans'>Joined: {new Date(user.created_at).toLocaleDateString()}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className='flex items-center gap-2 flex-wrap'>
                    <button
                        onClick={() => {
                            setAction('add')
                            setAmount(10)
                            setDescription('')
                            setBalanceModalOpen(true)
                        }}
                        className='px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm'
                    >
                        <PlusIcon className='w-4 h-4' /> Add BOLTs
                    </button>
                    <button
                        onClick={() => {
                            setAction('remove')
                            setAmount(10)
                            setDescription('')
                            setBalanceModalOpen(true)
                        }}
                        className='px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm'
                    >
                        <MinusIcon className='w-4 h-4' /> Deduct
                    </button>
                    <button
                        onClick={() => {
                            setAction('set')
                            setAmount(balance)
                            setDescription('')
                            setBalanceModalOpen(true)
                        }}
                        className='px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer active:scale-95'
                    >
                        <CurrencyDollarIcon className='w-4 h-4' /> Set Balance
                    </button>
                    <Link
                        to={`/admin/users/${user.id}/settings`}
                        className='px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold inline-flex items-center gap-1 transition'
                    >
                        Settings &rarr;
                    </Link>
                </div>
            </div>

            {/* ─── Metric Cards Grid ─────────────────────────────────────────────── */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'>
                {/* Balance Card */}
                <div className='p-5 bg-[#141619] border border-amber-500/20 rounded-2xl relative overflow-hidden shadow-lg'>
                    <div className='flex items-center justify-between'>
                        <span className='text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5'>
                            <BoltSvgIcon className='w-4 h-4 text-amber-400' /> Current Balance
                        </span>
                    </div>
                    <div className='text-2xl font-black text-white font-mono mt-2'>
                        {balance.toFixed(2)} <span className='text-xs text-amber-400 font-sans font-bold'>BOLTs</span>
                    </div>
                    <span className='text-[10px] text-gray-400 block mt-1'>Available wallet balance</span>
                </div>

                {/* Total Spent */}
                <div className='p-5 bg-[#141619] border border-gray-800 rounded-2xl shadow-lg'>
                    <div className='flex items-center justify-between'>
                        <span className='text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5'>
                            <ArrowTrendingDownIcon className='w-4 h-4 text-rose-400' /> Total Spent
                        </span>
                    </div>
                    <div className='text-2xl font-black text-white font-mono mt-2'>
                        {summary.total_spent.toFixed(2)} <span className='text-xs text-rose-400 font-sans font-bold'>BOLTs</span>
                    </div>
                    <span className='text-[10px] text-gray-400 block mt-1'>Deployments & renewals</span>
                </div>

                {/* Total Deposited / Gained */}
                <div className='p-5 bg-[#141619] border border-gray-800 rounded-2xl shadow-lg'>
                    <div className='flex items-center justify-between'>
                        <span className='text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5'>
                            <ArrowTrendingUpIcon className='w-4 h-4 text-emerald-400' /> Total Gained
                        </span>
                    </div>
                    <div className='text-2xl font-black text-white font-mono mt-2'>
                        {(summary.total_deposited + summary.total_bonus).toFixed(2)} <span className='text-xs text-emerald-400 font-sans font-bold'>BOLTs</span>
                    </div>
                    <span className='text-[10px] text-gray-400 block mt-1'>Deposits, bonuses & gifts</span>
                </div>

                {/* Cloud Servers */}
                <div className='p-5 bg-[#141619] border border-gray-800 rounded-2xl shadow-lg'>
                    <div className='flex items-center justify-between'>
                        <span className='text-[11px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5'>
                            <ServerIcon className='w-4 h-4 text-indigo-400' /> Cloud Servers
                        </span>
                    </div>
                    <div className='text-2xl font-black text-white font-mono mt-2'>
                        {summary.active_servers} <span className='text-xs text-gray-400 font-sans font-normal'>Active</span>
                    </div>
                    <span className='text-[10px] text-gray-400 block mt-1'>{summary.total_servers_lifetime} lifetime instances</span>
                </div>

                {/* Promo Codes */}
                <div className='p-5 bg-[#141619] border border-gray-800 rounded-2xl shadow-lg'>
                    <div className='flex items-center justify-between'>
                        <span className='text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5'>
                            <GiftIcon className='w-4 h-4 text-purple-400' /> Promo Codes
                        </span>
                    </div>
                    <div className='text-2xl font-black text-white font-mono mt-2'>
                        {summary.total_promo_claimed.toFixed(0)} <span className='text-xs text-purple-400 font-sans font-bold'>Claimed</span>
                    </div>
                    <span className='text-[10px] text-gray-400 block mt-1'>{summary.total_promo_codes_issued} issued codes</span>
                </div>
            </div>

            {/* ─── Tab Navigation Bar ───────────────────────────────────────────── */}
            <div className='flex items-center gap-2 border-b border-gray-800 pb-3 overflow-x-auto'>
                <button
                    onClick={() => setActiveTab('spending')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                        activeTab === 'spending'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-[#181a1f] text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                >
                    <CurrencyDollarIcon className='w-4 h-4' /> Spending & Gains ({spending_history.length})
                </button>
                <button
                    onClick={() => setActiveTab('promos')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                        activeTab === 'promos'
                            ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                            : 'bg-[#181a1f] text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                >
                    <GiftIcon className='w-4 h-4' /> Promo Codes & Gifts ({promo_history.length})
                </button>
                <button
                    onClick={() => setActiveTab('servers')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                        activeTab === 'servers'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-[#181a1f] text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                >
                    <ServerIcon className='w-4 h-4' /> Active Servers ({owned_servers.length})
                </button>
                <button
                    onClick={() => setActiveTab('lifecycle')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                        activeTab === 'lifecycle'
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                            : 'bg-[#181a1f] text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                >
                    <ClockIcon className='w-4 h-4' /> Server Lifecycle Log ({server_history.length})
                </button>
                <button
                    onClick={() => setActiveTab('discord')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                        activeTab === 'discord'
                            ? 'bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/20'
                            : 'bg-[#181a1f] text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                >
                    <ChatBubbleLeftRightIcon className='w-4 h-4' /> Discord Activity
                </button>
            </div>

            {/* ─── Tab Content Panels ───────────────────────────────────────────── */}

            {/* TAB 1: Spending & Gains */}
            {activeTab === 'spending' && (
                <div className='bg-[#141619] border border-gray-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                        <div className='flex items-center gap-1.5'>
                            <button
                                onClick={() => setTxTypeFilter('all')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                    txTypeFilter === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                All Transactions
                            </button>
                            <button
                                onClick={() => setTxTypeFilter('deduction')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                    txTypeFilter === 'deduction' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-gray-400 hover:text-rose-400'
                                }`}
                            >
                                Deductions / Spending
                            </button>
                            <button
                                onClick={() => setTxTypeFilter('deposit')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                    txTypeFilter === 'deposit' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-emerald-400'
                                }`}
                            >
                                Deposits / Top-ups
                            </button>
                            <button
                                onClick={() => setTxTypeFilter('bonus')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                    txTypeFilter === 'bonus' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-gray-400 hover:text-amber-400'
                                }`}
                            >
                                Bonuses & Promos
                            </button>
                        </div>

                        <div className='flex items-center gap-2 w-full sm:w-auto'>
                            <button
                                onClick={() => {
                                    setTxSearchInput('')
                                    setTxDetails(null)
                                    setTxError(null)
                                    setTxModalOpen(true)
                                }}
                                className='px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer'
                            >
                                <MagnifyingGlassIcon className='w-4 h-4' /> Lookup Tx ID
                            </button>

                            <div className='relative w-full sm:w-64'>
                                <MagnifyingGlassIcon className='w-4 h-4 text-gray-400 absolute left-3 top-2.5' />
                                <input
                                    type='text'
                                    value={txSearch}
                                    onChange={e => setTxSearch(e.target.value)}
                                    placeholder='Filter description or ref...'
                                    className='w-full pl-9 pr-3 py-1.5 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-xs focus:outline-none focus:border-blue-500'
                                />
                            </div>
                        </div>
                    </div>

                    {filteredTransactions.length === 0 ? (
                        <div className='py-12 text-center text-xs text-gray-500'>
                            No transaction records found matching your filters.
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full text-left border-collapse'>
                                <thead>
                                    <tr className='border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-[#1a1c20]'>
                                        <th className='py-3 px-4'>Type</th>
                                        <th className='py-3 px-4'>Description</th>
                                        <th className='py-3 px-4'>Reference ID</th>
                                        <th className='py-3 px-4 text-right'>Amount</th>
                                        <th className='py-3 px-4 text-right'>Date</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-800/60 text-xs font-medium text-gray-200'>
                                    {filteredTransactions.map(tx => {
                                        const isPositive = tx.amount > 0
                                        return (
                                            <tr key={tx.id} className='hover:bg-[#1a1c20]/60 transition'>
                                                <td className='py-3 px-4'>
                                                    <span
                                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                                            isPositive
                                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                                        }`}
                                                    >
                                                        {tx.type}
                                                    </span>
                                                </td>
                                                <td className='py-3 px-4 font-medium text-white max-w-md truncate'>
                                                    {tx.description || 'Adjustment'}
                                                </td>
                                                <td className='py-3 px-4 font-mono text-[11px] text-gray-400'>
                                                    {tx.reference_id ? (
                                                        <button
                                                            onClick={() => handleLookupTx(tx.reference_id!)}
                                                            className='hover:underline text-blue-400 hover:text-blue-300 font-semibold cursor-pointer text-left inline-flex items-center gap-1 group'
                                                            title='Click to inspect transaction & server details'
                                                        >
                                                            <span className='group-hover:scale-110 transition-transform'>🔍</span> {tx.reference_id}
                                                        </button>
                                                    ) : (
                                                        'N/A'
                                                    )}
                                                </td>
                                                <td className={`py-3 px-4 font-mono font-bold text-right ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {isPositive ? '+' : ''}{tx.amount.toFixed(2)} BOLTs
                                                </td>
                                                <td className='py-3 px-4 text-right text-gray-400 font-mono text-[11px]'>
                                                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: Promo Codes & Admin Gifts */}
            {activeTab === 'promos' && (
                <div className='bg-[#141619] border border-gray-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4'>
                    <div className='flex items-center justify-between border-b border-gray-800 pb-3'>
                        <div>
                            <h3 className='text-sm font-extrabold text-white'>Promo Codes & Admin Rewards</h3>
                            <p className='text-xs text-gray-400'>History of all promo codes generated for or redeemed by this user.</p>
                        </div>
                        <span className='text-xs font-mono text-amber-400 font-bold bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20'>
                            Total Issued: {summary.total_promo_generated.toFixed(0)} BOLTs
                        </span>
                    </div>

                    {promo_history.length === 0 ? (
                        <div className='py-12 text-center text-xs text-gray-500'>
                            No promo codes found for this user.
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full text-left border-collapse'>
                                <thead>
                                    <tr className='border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-[#1a1c20]'>
                                        <th className='py-3 px-4'>Code</th>
                                        <th className='py-3 px-4'>Value</th>
                                        <th className='py-3 px-4'>Status</th>
                                        <th className='py-3 px-4'>Reason</th>
                                        <th className='py-3 px-4'>Generated By</th>
                                        <th className='py-3 px-4 text-right'>Issued Date</th>
                                        <th className='py-3 px-4 text-right'>Claimed Date</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-800/60 text-xs font-medium text-gray-200'>
                                    {promo_history.map((p, idx) => (
                                        <tr key={idx} className='hover:bg-[#1a1c20]/60 transition'>
                                            <td className='py-3 px-4 font-mono font-bold text-amber-400'>{p.code}</td>
                                            <td className='py-3 px-4 font-mono font-bold text-white'>{p.amount.toFixed(0)} BOLTs</td>
                                            <td className='py-3 px-4'>
                                                <span
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                        p.used
                                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                                    }`}
                                                >
                                                    {p.used ? 'Claimed' : 'Unclaimed'}
                                                </span>
                                            </td>
                                            <td className='py-3 px-4 text-gray-300 font-medium'>{p.reason || 'Admin Gift'}</td>
                                            <td className='py-3 px-4 font-mono text-[11px] text-gray-400'>
                                                {p.created_by_discord_id ? `<@${p.created_by_discord_id}>` : 'System'}
                                            </td>
                                            <td className='py-3 px-4 text-right text-gray-400 font-mono text-[11px]'>
                                                {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td className='py-3 px-4 text-right text-gray-400 font-mono text-[11px]'>
                                                {p.used_at ? new Date(p.used_at).toLocaleDateString() : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: Owned Servers */}
            {activeTab === 'servers' && (
                <div className='bg-[#141619] border border-gray-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4'>
                    <div className='flex items-center justify-between border-b border-gray-800 pb-3'>
                        <div>
                            <h3 className='text-sm font-extrabold text-white'>Currently Owned Cloud Servers</h3>
                            <p className='text-xs text-gray-400'>Active VPS instances provisioned under this user account.</p>
                        </div>
                        <Link
                            to={`/admin/users/${user.id}/servers`}
                            className='text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1'
                        >
                            Manage Servers in Admin &rarr;
                        </Link>
                    </div>

                    {owned_servers.length === 0 ? (
                        <div className='py-12 text-center text-xs text-gray-500'>
                            User currently does not own any active cloud servers.
                        </div>
                    ) : (
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            {owned_servers.map(srv => {
                                const statusRaw = (srv.status || 'in_use').toLowerCase()
                                const isHealthy = ['in_use', 'running', 'active'].includes(statusRaw)
                                const isExpired = statusRaw === 'expired'
                                const isSuspended = statusRaw === 'suspended'

                                return (
                                    <div
                                        key={srv.id}
                                        className='p-4 bg-[#181a1f] border border-gray-800/80 rounded-2xl hover:border-blue-500/30 transition shadow-md space-y-3'
                                    >
                                        <div className='flex items-center justify-between'>
                                            <div>
                                                <h4 className='text-sm font-bold text-white flex items-center gap-2'>
                                                    {srv.name}
                                                    <span className='font-mono text-[10px] text-gray-500'>VMID #{srv.vmid}</span>
                                                </h4>
                                                <p className='text-[11px] text-gray-400 font-mono'>{srv.hostname}</p>
                                            </div>
                                            <span
                                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                    isHealthy
                                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                        : isSuspended
                                                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                                        : isExpired
                                                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                                        : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                }`}
                                            >
                                                {srv.status}
                                            </span>
                                        </div>

                                        <div className='grid grid-cols-2 gap-2 text-xs bg-[#121418] p-3 rounded-xl border border-gray-800/60'>
                                            <div>
                                                <span className='text-[10px] text-gray-500 uppercase block font-bold'>Node / Location</span>
                                                <span className='font-semibold text-gray-300 truncate block'>{srv.node_name}</span>
                                            </div>
                                            <div>
                                                <span className='text-[10px] text-gray-500 uppercase block font-bold'>IP Address</span>
                                                <span className='font-mono font-semibold text-gray-300'>{srv.ip}</span>
                                            </div>
                                            <div>
                                                <span className='text-[10px] text-gray-500 uppercase block font-bold'>Hardware Specs</span>
                                                <span className='text-gray-300 font-medium text-[11px]'>
                                                    {srv.cpu_cores} Core | {srv.memory_mb} MB RAM | {srv.disk_mb} MB Disk
                                                </span>
                                            </div>
                                            <div>
                                                <span className='text-[10px] text-gray-500 uppercase block font-bold'>Expiration Date</span>
                                                <span className='font-mono text-gray-300 text-[11px]'>
                                                    {srv.expires_at ? new Date(srv.expires_at).toLocaleDateString() : 'No Expiration'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className='flex items-center justify-between text-xs pt-1'>
                                            <span className='text-[11px] text-gray-400 truncate max-w-[200px]'>
                                                {srv.description || 'Standard Cloud Instance'}
                                            </span>
                                            <Link
                                                to={`/admin/servers/${srv.id}`}
                                                className='px-3 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold inline-flex items-center gap-1 transition'
                                            >
                                                Manage <ArrowTopRightOnSquareIcon className='w-3.5 h-3.5' />
                                            </Link>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 4: Server Lifecycle History */}
            {activeTab === 'lifecycle' && (
                <div className='bg-[#141619] border border-gray-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4'>
                    <div className='flex items-center justify-between border-b border-gray-800 pb-3'>
                        <div>
                            <h3 className='text-sm font-extrabold text-white'>Server Lifecycle & Audit Activity</h3>
                            <p className='text-xs text-gray-400'>
                                What happened to servers: Provisioning, Renewals, Deletions, Suspensions, and Reboots.
                            </p>
                        </div>
                        <span className='text-xs font-mono text-purple-400 font-bold bg-purple-500/10 px-3 py-1 rounded-xl border border-purple-500/20'>
                            {server_history.length} Recorded Events
                        </span>
                    </div>

                    {server_history.length === 0 ? (
                        <div className='py-12 text-center text-xs text-gray-500'>
                            No server lifecycle events recorded for this user.
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full text-left border-collapse'>
                                <thead>
                                    <tr className='border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-[#1a1c20]'>
                                        <th className='py-3 px-4'>Lifecycle Status</th>
                                        <th className='py-3 px-4'>Event / Action</th>
                                        <th className='py-3 px-4'>Server Details</th>
                                        <th className='py-3 px-4'>IP / Actor</th>
                                        <th className='py-3 px-4 text-right'>Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-800/60 text-xs font-medium text-gray-200'>
                                    {server_history.map(ev => {
                                        const badge = ev.status_badge || 'Event'
                                        return (
                                            <tr key={ev.id} className='hover:bg-[#1a1c20]/60 transition'>
                                                <td className='py-3 px-4'>
                                                    <span
                                                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                            badge === 'Deployed'
                                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                                : badge === 'Deleted'
                                                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                                                : badge === 'Renewed'
                                                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                                : badge === 'Suspended'
                                                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                                                : 'bg-gray-800 text-gray-300 border border-gray-700'
                                                        }`}
                                                    >
                                                        {badge}
                                                    </span>
                                                </td>
                                                <td className='py-3 px-4 font-medium text-white max-w-sm truncate'>
                                                    {ev.description || ev.event}
                                                </td>
                                                <td className='py-3 px-4 text-gray-300 font-mono text-[11px]'>
                                                    {ev.server_name ? (
                                                        <span>
                                                            {ev.server_name} {ev.vmid ? `(VMID ${ev.vmid})` : ''}
                                                        </span>
                                                    ) : (
                                                        <span className='text-gray-500'>—</span>
                                                    )}
                                                </td>
                                                <td className='py-3 px-4 font-mono text-[11px] text-gray-400'>
                                                    {ev.ip || 'Local'}
                                                </td>
                                                <td className='py-3 px-4 text-right text-gray-400 font-mono text-[11px]'>
                                                    {ev.created_at ? new Date(ev.created_at).toLocaleString() : 'N/A'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 5: Discord Stats */}
            {activeTab === 'discord' && (
                <div className='bg-[#141619] border border-gray-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-5'>
                    <div className='flex items-center justify-between border-b border-gray-800 pb-3'>
                        <div>
                            <h3 className='text-sm font-extrabold text-white'>Discord Community Activity</h3>
                            <p className='text-xs text-gray-400'>Tracked Discord messages, Nitro server boosts, and invite conversions.</p>
                        </div>
                        {discord?.discord_id ? (
                            <span className='px-3 py-1 rounded-xl text-xs font-mono font-bold bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20'>
                                Discord Snowflake: {discord.discord_id}
                            </span>
                        ) : (
                            <span className='px-3 py-1 rounded-xl text-xs font-bold bg-gray-800 text-gray-400'>
                                Not Linked to Discord
                            </span>
                        )}
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                        <div className='p-4 bg-[#181a1f] border border-gray-800/80 rounded-2xl'>
                            <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400 block'>
                                💬 Chat Messages
                            </span>
                            <div className='text-2xl font-black text-white font-mono mt-1'>
                                {(discord?.stats?.messages ?? 0).toLocaleString()}
                            </div>
                            <span className='text-[10px] text-gray-500 mt-1 block'>Tracked in Discord community</span>
                        </div>

                        <div className='p-4 bg-[#181a1f] border border-gray-800/80 rounded-2xl'>
                            <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400 block'>
                                🚀 Nitro Server Boosts
                            </span>
                            <div className='text-2xl font-black text-pink-400 font-mono mt-1'>
                                {discord?.stats?.boosts ?? 0}
                            </div>
                            <span className='text-[10px] text-gray-500 mt-1 block'>Active server boosts</span>
                        </div>

                        <div className='p-4 bg-[#181a1f] border border-gray-800/80 rounded-2xl'>
                            <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400 block'>
                                🎁 Valid Invites
                            </span>
                            <div className='text-2xl font-black text-emerald-400 font-mono mt-1'>
                                {discord?.invites?.valid ?? 0}
                            </div>
                            <span className='text-[10px] text-gray-500 mt-1 block'>
                                Total: {discord?.invites?.joined ?? 0} | Left: {discord?.invites?.left ?? 0} | Fake: {discord?.invites?.fake ?? 0}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Balance Adjustment Modal ─────────────────────────────────────── */}
            <Modal
                opened={balanceModalOpen}
                onClose={() => setBalanceModalOpen(false)}
                title={
                    <div className='font-bold text-lg text-white flex items-center gap-2'>
                        <BoltSvgIcon className='w-5 h-5 text-amber-400' />
                        {action === 'add' ? 'Add BOLTs to User' : action === 'remove' ? 'Deduct BOLTs from User' : 'Set User BOLT Balance'}
                    </div>
                }
                centered
                styles={{
                    modal: { backgroundColor: '#141619', color: '#fff', border: '1px solid #2a2d34', borderRadius: '16px' },
                    header: { backgroundColor: '#141619', color: '#fff', borderBottom: '1px solid #2a2d34' },
                    close: { color: '#9ca3af', '&:hover': { backgroundColor: '#1c1e22', color: '#fff' } }
                }}
            >
                <div className='relative pt-1 space-y-4'>
                    <LoadingOverlay visible={submittingBalance} radius='md' />

                    <div className='p-3 bg-[#1c1e22] rounded-xl border border-gray-800 text-xs'>
                        <span className='font-bold block text-white'>{user.name} ({user.email})</span>
                        <span className='text-gray-400 mt-0.5 block'>
                            Current Balance: <strong className='text-amber-400 font-mono'>⚡ {balance.toFixed(2)} BOLTs</strong>
                        </span>
                    </div>

                    <div>
                        <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>Amount (BOLTs)</label>
                        <input
                            type='number'
                            step='0.01'
                            min='0.01'
                            value={amount}
                            onChange={e => setAmount(Number(e.target.value))}
                            className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-semibold focus:outline-none focus:border-blue-500'
                        />
                    </div>

                    <div>
                        <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>Audit Description / Note</label>
                        <input
                            type='text'
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder='Reason for BOLT adjustment'
                            className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-medium focus:outline-none focus:border-blue-500'
                        />
                    </div>

                    <button
                        onClick={handleExecuteCreditAdjustment}
                        className={`w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition cursor-pointer active:scale-95 ${
                            action === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : action === 'remove' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        Confirm BOLT Adjustment
                    </button>
                </div>
            </Modal>

            {/* ─── Transaction Inspector Modal ─────────────────────────────────────── */}
            <Modal
                opened={txModalOpen}
                onClose={() => setTxModalOpen(false)}
                size='lg'
                title={
                    <div className='font-bold text-base text-white flex items-center gap-2'>
                        <MagnifyingGlassIcon className='w-5 h-5 text-purple-400' />
                        Transaction & Server Inspector
                    </div>
                }
                centered
                styles={{
                    modal: { backgroundColor: '#141619', color: '#fff', border: '1px solid #2a2d34', borderRadius: '20px', maxWidth: '720px' },
                    header: { backgroundColor: '#141619', color: '#fff', borderBottom: '1px solid #2a2d34' },
                    close: { color: '#9ca3af', '&:hover': { backgroundColor: '#1c1e22', color: '#fff' } }
                }}
            >
                <div className='relative pt-1 space-y-4'>
                    <LoadingOverlay visible={txLoading} radius='md' />

                    {/* Lookup Search Input in Modal */}
                    <div className='flex items-center gap-2'>
                        <div className='relative flex-1'>
                            <MagnifyingGlassIcon className='w-4 h-4 text-gray-400 absolute left-3 top-2.5' />
                            <input
                                type='text'
                                value={txSearchInput}
                                onChange={e => setTxSearchInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleLookupTx()
                                }}
                                placeholder='Enter Reference ID (e.g. RENEW-5OBDSIRG, DEPLOY-XXXX)...'
                                className='w-full pl-9 pr-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-xs font-mono focus:outline-none focus:border-purple-500'
                            />
                        </div>
                        <button
                            onClick={() => handleLookupTx()}
                            disabled={txLoading || !txSearchInput.trim()}
                            className='px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer'
                        >
                            Lookup
                        </button>
                    </div>

                    {txError && (
                        <div className='p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2'>
                            <ExclamationTriangleIcon className='w-4 h-4 shrink-0' />
                            <span>{txError}</span>
                        </div>
                    )}

                    {txDetails && (
                        <div className='space-y-4 text-xs'>
                            {/* Transaction Summary Header */}
                            <div className='p-4 bg-[#181a1f] rounded-2xl border border-gray-800/80 flex flex-wrap items-center justify-between gap-3'>
                                <div>
                                    <div className='flex items-center gap-2'>
                                        <span className='font-mono text-sm font-bold text-purple-400'>
                                            {txDetails.transaction.reference_id || `TX#${txDetails.transaction.id}`}
                                        </span>
                                        <span className='px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-gray-800 border border-gray-700 text-gray-300'>
                                            {txDetails.transaction.type}
                                        </span>
                                    </div>
                                    <p className='text-gray-300 font-medium mt-1'>{txDetails.transaction.description || 'No description recorded'}</p>
                                    <span className='text-[11px] text-gray-500 font-mono block mt-0.5'>
                                        {txDetails.transaction.created_at ? new Date(txDetails.transaction.created_at).toLocaleString() : 'N/A'}
                                    </span>
                                </div>
                                <div className='text-right'>
                                    <span className='text-[10px] text-gray-400 uppercase font-bold block'>Transaction Value</span>
                                    <span className={`text-xl font-black font-mono ${txDetails.transaction.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {txDetails.transaction.amount > 0 ? '+' : ''}{txDetails.transaction.amount.toFixed(2)} BOLTs
                                    </span>
                                </div>
                            </div>

                            {/* User details card */}
                            {txDetails.user && (
                                <div className='p-3.5 bg-[#121418] rounded-xl border border-gray-800/60 grid grid-cols-1 sm:grid-cols-2 gap-3'>
                                    <div>
                                        <span className='text-[10px] uppercase font-bold text-gray-500 block'>Associated User</span>
                                        <span className='font-bold text-white'>{txDetails.user.name}</span>
                                        <span className='text-gray-400 font-mono text-[11px] block'>{txDetails.user.email}</span>
                                    </div>
                                    <div>
                                        <span className='text-[10px] uppercase font-bold text-gray-500 block'>Discord & Balance</span>
                                        <span className='text-[#5865F2] font-mono text-[11px] block'>
                                            {txDetails.user.discord_username ? `@${txDetails.user.discord_username}` : (txDetails.user.discord_id || 'Not linked')}
                                        </span>
                                        <span className='text-amber-400 font-mono text-[11px] font-bold block'>
                                            Current Balance: ⚡ {txDetails.user.credits.toFixed(2)} BOLTs
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Server info card */}
                            {txDetails.server ? (
                                <div className='p-4 bg-[#181a1f] rounded-2xl border border-indigo-500/20 space-y-3 shadow-md'>
                                    <div className='flex items-center justify-between border-b border-gray-800 pb-2.5'>
                                        <div className='flex items-center gap-2'>
                                            <ServerIcon className='w-4 h-4 text-indigo-400' />
                                            <h4 className='font-bold text-white text-sm'>{txDetails.server.name}</h4>
                                            {txDetails.server.vmid && (
                                                <span className='font-mono text-[10px] text-gray-400'>VMID #{txDetails.server.vmid}</span>
                                            )}
                                        </div>
                                        <span
                                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                !txDetails.server.server_exists || txDetails.server.status === 'deleted'
                                                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                                    : txDetails.server.status === 'suspended'
                                                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                                    : txDetails.server.status === 'expired'
                                                    ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                                                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                            }`}
                                        >
                                            {!txDetails.server.server_exists || txDetails.server.status === 'deleted' ? '🗑️ Deleted' : txDetails.server.status}
                                        </span>
                                    </div>

                                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-[#121418] p-3 rounded-xl border border-gray-800/60'>
                                        <div>
                                            <span className='text-[10px] text-gray-500 uppercase block font-bold'>Price when Bought / Cost</span>
                                            <span className='font-mono font-bold text-amber-400 text-sm'>
                                                ⚡ {(txDetails.server.price_when_bought || Math.abs(txDetails.transaction.amount)).toFixed(2)} BOLTs
                                            </span>
                                        </div>
                                        <div>
                                            <span className='text-[10px] text-gray-500 uppercase block font-bold'>Server Creation Date</span>
                                            <span className='font-mono text-gray-300 font-semibold'>
                                                {txDetails.server.server_created_at ? new Date(txDetails.server.server_created_at).toLocaleDateString() : 'N/A'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className='text-[10px] text-gray-500 uppercase block font-bold'>Server Expiry Date</span>
                                            <span className='font-mono text-gray-300 font-semibold'>
                                                {txDetails.server.server_expires_at ? new Date(txDetails.server.server_expires_at).toLocaleDateString() : (txDetails.server.server_exists ? 'Never' : 'Expired/Deleted')}
                                            </span>
                                        </div>
                                        <div>
                                            <span className='text-[10px] text-gray-500 uppercase block font-bold'>Node & IP Address</span>
                                            <span className='font-mono text-gray-300 truncate block'>
                                                {txDetails.server.node_name || 'Primary'} ({txDetails.server.ip_address || txDetails.server.node_ip || 'N/A'})
                                            </span>
                                        </div>
                                        <div>
                                            <span className='text-[10px] text-gray-500 uppercase block font-bold'>Hardware Specs</span>
                                            <span className='text-gray-300 font-medium'>
                                                {txDetails.server.cpu_cores || 1} vCPU | {txDetails.server.memory_mb || 0} MB RAM | {txDetails.server.disk_mb || 0} MB Disk
                                            </span>
                                        </div>
                                        <div>
                                            <span className='text-[10px] text-gray-500 uppercase block font-bold'>Plan / Description</span>
                                            <span className='text-gray-300 truncate block'>
                                                {txDetails.server.plan_name || txDetails.server.description || 'Cloud VPS'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {/* Promo code details if promo */}
                            {txDetails.promo && (
                                <div className='p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5'>
                                    <div className='flex items-center justify-between'>
                                        <span className='font-mono font-bold text-amber-400 text-sm'>{txDetails.promo.code}</span>
                                        <span className='font-mono font-bold text-white'>⚡ {txDetails.promo.amount.toFixed(0)} BOLTs</span>
                                    </div>
                                    <p className='text-gray-300 text-xs'>Reason: <em>{txDetails.promo.reason}</em></p>
                                    <div className='text-[11px] text-gray-400 font-mono flex items-center justify-between'>
                                        <span>By: {txDetails.promo.created_by_discord_id ? `<@${txDetails.promo.created_by_discord_id}>` : 'System'}</span>
                                        <span>Issued: {txDetails.promo.created_at ? new Date(txDetails.promo.created_at).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                </div>
                            )}

                            {/* Lifecycle audit trail */}
                            {txDetails.lifecycle && txDetails.lifecycle.length > 0 && (
                                <div className='space-y-2 pt-1'>
                                    <span className='text-[11px] font-bold uppercase tracking-wider text-gray-400 block'>
                                        📜 Related Lifecycle & Audit Trail
                                    </span>
                                    <div className='divide-y divide-gray-800/60 bg-[#121418] rounded-xl border border-gray-800/60 overflow-hidden'>
                                        {txDetails.lifecycle.map((l, i) => (
                                            <div key={i} className='p-2.5 flex items-center justify-between gap-2 text-[11px]'>
                                                <div className='flex items-center gap-2'>
                                                    <span className='font-mono font-bold text-purple-400 uppercase'>{l.event}</span>
                                                    <span className='text-gray-300'>{l.description}</span>
                                                </div>
                                                <span className='text-gray-500 font-mono shrink-0'>
                                                    {l.timestamp ? new Date(l.timestamp).toLocaleDateString() : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    )
}

export default UserHistoryContainer
