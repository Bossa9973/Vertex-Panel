import PageContentBlock from '@/components/elements/PageContentBlock'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useState, useEffect } from 'react'
import http from '@/api/http'
import { PlusIcon, MinusIcon, CurrencyDollarIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import AdminCreditsToggle from '@/components/admin/users/AdminCreditsToggle'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'

interface UserItem {
    id: number
    name: string
    email: string
    credits: number
    root_admin: boolean
    servers_count: number
    created_at: string
}

const AdminUserBalanceContainer = () => {
    const [users, setUsers] = useState<UserItem[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [action, setAction] = useState<'add' | 'remove' | 'set'>('add')
    const [amount, setAmount] = useState(10)
    const [description, setDescription] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const fetchUsers = () => {
        setLoading(true)
        http.get('/api/admin/users-balances')
            .then(res => {
                const rawUsers = res.data.users?.data || (Array.isArray(res.data.users) ? res.data.users : [])
                setUsers(rawUsers)
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    const handleOpenModal = (user: UserItem, act: 'add' | 'remove' | 'set') => {
        setSelectedUser(user)
        setAction(act)
        setAmount(act === 'set' ? user.credits : 10)
        setDescription('')
        setModalOpen(true)
    }

    const handleExecuteCreditAdjustment = async () => {
        if (!selectedUser) return
        setSubmitting(true)

        try {
            await http.post(`/api/admin/users/${selectedUser.id}/credits`, {
                action,
                amount,
                description,
            })
            fetchUsers()
            setModalOpen(false)
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to update user balance.')
        } finally {
            setSubmitting(false)
        }
    }

    const filteredUsers = Array.isArray(users)
        ? users.filter(u => (u.name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase()))
        : []

    return (
        <PageContentBlock title='Admin > User BOLT Balances'>
            <div className='flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-gray-800 pb-4'>
                <div>
                    <h1 className='text-2xl font-extrabold text-white'>User BOLT Balances</h1>
                    <p className='text-xs text-gray-400 mt-1'>
                        View and manage client account BOLT balances, deposit funds, process deductions, or override user balance limits.
                    </p>
                </div>
                <div className='relative w-full sm:w-64'>
                    <MagnifyingGlassIcon className='w-4 h-4 text-gray-400 absolute left-3 top-3' />
                    <input
                        type='text'
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder='Search user email...'
                        className='w-full pl-9 pr-4 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-xs font-semibold focus:outline-none focus:border-blue-500'
                    />
                </div>
            </div>

            <AdminCreditsToggle />

            {loading ? (
                <div className='py-12 text-center text-xs text-gray-500'>Loading user credit balances...</div>
            ) : (
                <div className='bg-[#141619] border border-gray-800 rounded-2xl overflow-hidden shadow-xl'>
                    <div className='overflow-x-auto'>
                        <table className='w-full text-left border-collapse'>
                            <thead>
                                <tr className='border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-[#1a1c20]'>
                                    <th className='py-3.5 px-4'>ID</th>
                                    <th className='py-3.5 px-4'>User</th>
                                    <th className='py-3.5 px-4'>Role</th>
                                    <th className='py-3.5 px-4'>Active VPS</th>
                                    <th className='py-3.5 px-4'>BOLT Balance</th>
                                    <th className='py-3.5 px-4 text-right'>Actions</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-800/60 text-xs font-medium text-gray-200'>
                                {filteredUsers.map(user => (
                                    <tr key={user.id} className='hover:bg-[#1a1c20]/60 transition'>
                                        <td className='py-3.5 px-4 font-mono text-gray-500'>#{user.id}</td>
                                        <td className='py-3.5 px-4'>
                                            <div className='font-bold text-white'>{user.name}</div>
                                            <div className='text-[10px] text-gray-400 font-mono'>{user.email}</div>
                                        </td>
                                        <td className='py-3.5 px-4'>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${user.root_admin ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-gray-800 text-gray-400'}`}>
                                                {user.root_admin ? 'Admin' : 'Client'}
                                            </span>
                                        </td>
                                        <td className='py-3.5 px-4 font-semibold text-gray-300'>
                                            {user.servers_count} Server{user.servers_count === 1 ? '' : 's'}
                                        </td>
                                        <td className='py-3.5 px-4 font-extrabold text-amber-400 font-mono text-sm flex items-center gap-1 mt-1'>
                                            <BoltSvgIcon className='w-4 h-4 text-amber-400' />
                                            {(user.credits ?? 0).toFixed(2)} BOLTs
                                        </td>
                                        <td className='py-3.5 px-4 text-right'>
                                            <div className='flex items-center justify-end gap-1.5'>
                                                <a
                                                    href={`/admin/users/${user.id}/history`}
                                                    className='px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer'
                                                >
                                                    History
                                                </a>
                                                <button
                                                    onClick={() => handleOpenModal(user, 'add')}
                                                    className='px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer'
                                                >
                                                    <PlusIcon className='w-3.5 h-3.5' /> Add
                                                </button>
                                                <button
                                                    onClick={() => handleOpenModal(user, 'remove')}
                                                    className='px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer'
                                                >
                                                    <MinusIcon className='w-3.5 h-3.5' /> Deduct
                                                </button>
                                                <button
                                                    onClick={() => handleOpenModal(user, 'set')}
                                                    className='px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer'
                                                >
                                                    <CurrencyDollarIcon className='w-3.5 h-3.5' /> Set
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={
                    <div className='font-bold text-lg text-white flex items-center gap-2'>
                        <BoltSvgIcon className='w-5 h-5 text-amber-400' />
                        {action === 'add' ? 'Give BOLTs to User' : action === 'remove' ? 'Deduct BOLTs from User' : 'Set User BOLT Balance'}
                    </div>
                }
                centered
                styles={{
                    modal: { backgroundColor: '#141619', color: '#fff', border: '1px solid #2a2d34', borderRadius: '16px' },
                    header: { backgroundColor: '#141619', color: '#fff', borderBottom: '1px solid #2a2d34' },
                    close: { color: '#9ca3af', '&:hover': { backgroundColor: '#1c1e22', color: '#fff' } }
                }}
            >
                {selectedUser && (
                    <div className='relative pt-1 space-y-4'>
                        <LoadingOverlay visible={submitting} radius='md' />

                        <div className='p-3 bg-[#1c1e22] rounded-xl border border-gray-800 text-xs'>
                            <span className='font-bold block text-white'>{selectedUser.name} ({selectedUser.email})</span>
                            <span className='text-gray-400 mt-0.5 block'>Current Balance: <strong className='text-amber-400'>вљЎ {(selectedUser.credits ?? 0).toFixed(2)} BOLTs</strong></span>
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
                )}
            </Modal>
        </PageContentBlock>
    )
}

export default AdminUserBalanceContainer

