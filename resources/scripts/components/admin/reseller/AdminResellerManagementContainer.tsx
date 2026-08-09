import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, UserCheck, RefreshCw, ShieldCheck, ShoppingCart, Percent } from 'lucide-react'
import {
    getAdminResellers,
    toggleAdminResellerStatus,
    getAdminWithdrawals,
    approveAdminWithdrawal,
    rejectAdminWithdrawal,
    AdminResellerUser,
    AdminWithdrawalItem,
} from '@/api/admin/reseller'

export default function AdminResellerManagementContainer() {
    const [activeTab, setActiveTab] = useState<'withdrawals' | 'users'>('withdrawals')
    const [loading, setLoading] = useState(true)

    // Users state
    const [users, setUsers] = useState<AdminResellerUser[]>([])
    const [search, setSearch] = useState('')
    const [resellersOnly, setResellersOnly] = useState(false)

    // Withdrawals state
    const [withdrawals, setWithdrawals] = useState<AdminWithdrawalItem[]>([])
    const [selectedWithdrawal, setSelectedWithdrawal] = useState<AdminWithdrawalItem | null>(null)
    const [txHash, setTxHash] = useState('')
    const [adminNotes, setAdminNotes] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    // Grant modal state
    const [grantTarget, setGrantTarget] = useState<AdminResellerUser | null>(null)
    const [selectedPlanType, setSelectedPlanType] = useState<'own_inventory' | 'zero_cost'>('zero_cost')
    const [grantNotes, setGrantNotes] = useState('')

    useEffect(() => {
        loadData()
    }, [activeTab, resellersOnly])

    const loadData = async () => {
        setLoading(true)
        try {
            if (activeTab === 'users') {
                const res = await getAdminResellers({ resellers_only: resellersOnly, search })
                setUsers(res.users.data)
            } else {
                const res = await getAdminWithdrawals()
                setWithdrawals(res.withdrawals.data)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleToggleReseller = async (user: AdminResellerUser) => {
        if (!user || !user.id) {
            alert('Invalid user account ID')
            return
        }
        // Revoking — no plan dialog needed
        if (user.is_reseller) {
            if (!confirm(`Revoke reseller access for ${user.name}?`)) return
            try {
                await toggleAdminResellerStatus(user.id, { is_reseller: false })
                alert(`Reseller access revoked for ${user.name}`)
                loadData()
            } catch (err: any) {
                alert(err?.response?.data?.message || 'Failed to revoke reseller status')
            }
            return
        }
        // Granting — show plan type selection modal
        setGrantTarget(user)
        setSelectedPlanType('zero_cost')
        setGrantNotes('')
    }

    const handleConfirmGrant = async () => {
        if (!grantTarget || !grantTarget.id) return
        setActionLoading(true)
        try {
            await toggleAdminResellerStatus(grantTarget.id, {
                is_reseller: true,
                plan_type: selectedPlanType,
                reseller_notes: grantNotes || undefined,
            })
            alert(`Reseller access granted for ${grantTarget.name} (${selectedPlanType === 'own_inventory' ? 'Own Inventory' : 'Zero Cost 30%'})`)
            setGrantTarget(null)
            loadData()
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Failed to grant reseller status')
        } finally {
            setActionLoading(false)
        }
    }

    const handleApprove = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedWithdrawal || !txHash) return

        setActionLoading(true)
        try {
            await approveAdminWithdrawal(selectedWithdrawal.id, { tx_hash: txHash, admin_notes: adminNotes })
            alert('Withdrawal approved and TxID recorded!')
            setSelectedWithdrawal(null)
            setTxHash('')
            setAdminNotes('')
            loadData()
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Approval failed')
        } finally {
            setActionLoading(false)
        }
    }

    const handleReject = async (w: AdminWithdrawalItem) => {
        const reason = prompt('Enter reason for rejecting withdrawal (locked balance will be refunded):')
        if (!reason) return

        try {
            await rejectAdminWithdrawal(w.id, { admin_notes: reason })
            alert('Withdrawal rejected and balance unlocked.')
            loadData()
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Rejection failed')
        }
    }

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold text-white">Reseller Management & Payouts</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Authorize resellers and approve pending crypto withdrawal requests.
                    </p>
                </div>
                <button onClick={loadData} className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg flex items-center">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 space-x-6 text-sm font-semibold">
                <button
                    onClick={() => setActiveTab('withdrawals')}
                    className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
                        activeTab === 'withdrawals' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                >
                    <DollarSign className="w-4 h-4" /> Crypto Withdrawal Queue
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
                        activeTab === 'users' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                >
                    <UserCheck className="w-4 h-4" /> Reseller User Permissions
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
                </div>
            ) : activeTab === 'withdrawals' ? (
                <div className="space-y-6">
                    <Card className="bg-slate-900/60 border-slate-800 rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <h4 className="font-bold text-white text-sm">Pending & Historic Crypto Withdrawals</h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-950/40">
                                        <th className="p-3">Reseller</th>
                                        <th className="p-3">Coin</th>
                                        <th className="p-3">Amount</th>
                                        <th className="p-3">Wallet Address</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Date</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {withdrawals.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-6 text-center text-slate-500">
                                                No withdrawal requests found.
                                            </td>
                                        </tr>
                                    ) : (
                                        withdrawals.map(w => (
                                            <tr key={w.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                                                <td className="p-3">
                                                    <span className="font-bold text-white block">{w.user?.name || `User #${w.user_id}`}</span>
                                                    <span className="text-xs text-slate-400">{w.user?.email}</span>
                                                </td>
                                                <td className="p-3 font-mono text-cyan-400 font-bold">{w.coin}</td>
                                                <td className="p-3 font-mono font-extrabold text-white">{w.amount}</td>
                                                <td className="p-3 font-mono text-xs text-slate-300 truncate max-w-[180px]">
                                                    {w.wallet_address}
                                                </td>
                                                <td className="p-3">
                                                    {w.status === 'approved' ? (
                                                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                                            APPROVED & PAID
                                                        </Badge>
                                                    ) : w.status === 'rejected' ? (
                                                        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px]">
                                                            REJECTED
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                                            PENDING APPROVAL
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="p-3 text-xs text-slate-400 font-mono">
                                                    {new Date(w.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="p-3 text-right space-x-2">
                                                    {w.status === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => setSelectedWithdrawal(w)}
                                                                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg transition"
                                                            >
                                                                Approve Payout
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(w)}
                                                                className="bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs px-3 py-1.5 rounded-lg transition"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Approve Modal */}
                    {selectedWithdrawal && (
                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <Card className="bg-slate-900 border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4">
                                <h3 className="text-lg font-bold text-white">Approve Crypto Payout</h3>
                                <p className="text-xs text-slate-400">
                                    Approve payout of <strong>{selectedWithdrawal.amount} {selectedWithdrawal.coin}</strong> to {selectedWithdrawal.wallet_address}.
                                </p>

                                <form onSubmit={handleApprove} className="space-y-3">
                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">Blockchain Transaction Hash (TxID)</label>
                                        <input
                                            placeholder="Enter TxID / Hash from company wallet"
                                            value={txHash}
                                            onChange={e => setTxHash(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">Admin Notes (Optional)</label>
                                        <input
                                            placeholder="e.g. Sent via Binance / Exodus wallet"
                                            value={adminNotes}
                                            onChange={e => setAdminNotes(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs"
                                        />
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            type="submit"
                                            disabled={actionLoading || !txHash}
                                            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 rounded-lg text-sm transition"
                                        >
                                            {actionLoading ? 'Processing...' : 'Confirm & Record TxID'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedWithdrawal(null)}
                                            className="bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2 rounded-lg text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            </Card>
                        </div>
                    )}
                </div>
            ) : (
                /* Users List & Reseller Toggle */
                <Card className="bg-slate-900/60 border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-300 flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={resellersOnly}
                                    onChange={e => setResellersOnly(e.target.checked)}
                                    className="accent-cyan-500 rounded"
                                />
                                Show Authorized Resellers Only
                            </label>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-950/40">
                                    <th className="p-3">User</th>
                                    <th className="p-3">Plan Type</th>
                                    <th className="p-3">Reseller Status</th>
                                    <th className="p-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                                        <td className="p-3">
                                            <span className="font-bold text-white block">{u.name}</span>
                                            <span className="text-xs text-slate-400">{u.email}</span>
                                        </td>
                                        <td className="p-3">
                                            {u.reseller_plan_type === 'own_inventory' ? (
                                                <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[10px] flex items-center gap-1 w-fit">
                                                    <ShoppingCart className="w-2.5 h-2.5" /> Own Inventory
                                                </Badge>
                                            ) : u.reseller_plan_type === 'zero_cost' ? (
                                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] flex items-center gap-1 w-fit">
                                                    <Percent className="w-2.5 h-2.5" /> Zero Cost (30% cap)
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-600 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            {u.is_reseller ? (
                                                <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px]">
                                                    AUTHORIZED RESELLER
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-slate-500 border-slate-800 text-[10px]">
                                                    STANDARD USER
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                onClick={() => handleToggleReseller(u)}
                                                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${
                                                    u.is_reseller
                                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                                                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                                                }`}
                                            >
                                                {u.is_reseller ? 'Revoke Reseller' : 'Grant Reseller Access'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Grant Reseller Modal — Plan Type Selection */}
            {grantTarget && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <Card className="bg-slate-900 border-slate-700 p-6 rounded-2xl max-w-lg w-full space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="bg-cyan-500/20 p-2.5 rounded-xl">
                                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Grant Reseller Access</h3>
                                <p className="text-xs text-slate-400">Granting to <strong className="text-slate-200">{grantTarget.name}</strong> ({grantTarget.email})</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Select Reseller Plan Model</p>
                            <div
                                onClick={() => setSelectedPlanType('zero_cost')}
                                className={`cursor-pointer border rounded-xl p-4 transition-all ${
                                    selectedPlanType === 'zero_cost'
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-slate-700 hover:border-slate-600'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-500/20 p-2 rounded-lg">
                                        <Percent className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Zero Cost</p>
                                        <p className="text-xs text-slate-400">Reseller marks up our base plans up to 30%. Zero cost to us on sales, we earn on what we sell to them.</p>
                                    </div>
                                </div>
                            </div>
                            <div
                                onClick={() => setSelectedPlanType('own_inventory')}
                                className={`cursor-pointer border rounded-xl p-4 transition-all ${
                                    selectedPlanType === 'own_inventory'
                                        ? 'border-violet-500 bg-violet-500/10'
                                        : 'border-slate-700 hover:border-slate-600'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="bg-violet-500/20 p-2 rounded-lg">
                                        <ShoppingCart className="w-4 h-4 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Own Inventory</p>
                                        <p className="text-xs text-slate-400">Reseller purchases servers from us at our price and sets any custom markup. We profit from their wholesale orders.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-slate-400 mb-1 block">Admin Notes (optional)</label>
                            <input
                                placeholder="e.g. Partner discount applied"
                                value={grantNotes}
                                onChange={e => setGrantNotes(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                            />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={handleConfirmGrant}
                                disabled={actionLoading}
                                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-lg text-sm transition"
                            >
                                {actionLoading ? 'Granting...' : 'Confirm Grant Access'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setGrantTarget(null)}
                                className="bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2.5 rounded-lg text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
