import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageContentBlock from '@/components/elements/PageContentBlock'
import { getUserHistoryList, UserHistoryListItem } from '@/api/admin/users/getUserHistory'
import UserHistoryContainer from '@/components/admin/users/history/UserHistoryContainer'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import {
    MagnifyingGlassIcon,
    UserIcon,
    ServerIcon,
    ArrowRightIcon,
    ArrowLeftIcon,
    ClockIcon,
} from '@heroicons/react/24/outline'

const AdminUserHistoryContainer = () => {
    const [searchParams, setSearchParams] = useSearchParams()
    const queryUserId = searchParams.get('user_id')

    const [selectedUserId, setSelectedUserId] = useState<number | null>(
        queryUserId ? parseInt(queryUserId, 10) : null
    )
    const [users, setUsers] = useState<UserHistoryListItem[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')

    const fetchUsers = (searchTerm = '') => {
        setLoading(true)
        getUserHistoryList(searchTerm)
            .then(res => {
                setUsers(res.data || [])
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        if (!selectedUserId) {
            fetchUsers(search)
        }
    }, [selectedUserId])

    const handleSelectUser = (id: number) => {
        setSelectedUserId(id)
        setSearchParams({ user_id: id.toString() })
    }

    const handleBackToList = () => {
        setSelectedUserId(null)
        setSearchParams({})
    }

    return (
        <PageContentBlock title='Admin > User History'>
            {selectedUserId ? (
                <div className='space-y-4'>
                    <div className='flex items-center justify-between border-b border-gray-800 pb-4'>
                        <button
                            onClick={handleBackToList}
                            className='px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer active:scale-95'
                        >
                            <ArrowLeftIcon className='w-4 h-4' /> Back to User Directory
                        </button>
                        <span className='text-xs text-gray-400 font-mono'>User ID #{selectedUserId}</span>
                    </div>
                    <UserHistoryContainer userId={selectedUserId} />
                </div>
            ) : (
                <div className='space-y-6'>
                    {/* Header & Search */}
                    <div className='flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4'>
                        <div>
                            <h1 className='text-2xl font-extrabold text-white flex items-center gap-2.5'>
                                <ClockIcon className='w-7 h-7 text-blue-400' /> User History & Activity Tracker
                            </h1>
                            <p className='text-xs text-gray-400 mt-1'>
                                Inspect individual user balances, spending records, promo code claims, owned servers, and hypervisor lifecycle history.
                            </p>
                        </div>

                        <div className='relative w-full sm:w-80'>
                            <MagnifyingGlassIcon className='w-4 h-4 text-gray-400 absolute left-3.5 top-3' />
                            <input
                                type='text'
                                value={search}
                                onChange={e => {
                                    setSearch(e.target.value)
                                    fetchUsers(e.target.value)
                                }}
                                placeholder='Search name, email, Discord snowflake...'
                                className='w-full pl-10 pr-4 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-xs font-semibold focus:outline-none focus:border-blue-500'
                            />
                        </div>
                    </div>

                    {/* Users Directory Table */}
                    {loading ? (
                        <div className='py-16 text-center text-xs text-gray-500'>Loading user history directory...</div>
                    ) : (
                        <div className='bg-[#141619] border border-gray-800 rounded-2xl overflow-hidden shadow-xl'>
                            <div className='overflow-x-auto'>
                                <table className='w-full text-left border-collapse'>
                                    <thead>
                                        <tr className='border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-[#1a1c20]'>
                                            <th className='py-3.5 px-4'>User</th>
                                            <th className='py-3.5 px-4'>Role</th>
                                            <th className='py-3.5 px-4'>Discord Snowflake</th>
                                            <th className='py-3.5 px-4'>Active VPS</th>
                                            <th className='py-3.5 px-4'>BOLT Balance</th>
                                            <th className='py-3.5 px-4 text-right'>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-gray-800/60 text-xs font-medium text-gray-200'>
                                        {users.map(u => (
                                            <tr
                                                key={u.id}
                                                onClick={() => handleSelectUser(u.id)}
                                                className='hover:bg-[#1a1c20]/80 transition cursor-pointer group'
                                            >
                                                <td className='py-3.5 px-4'>
                                                    <div className='font-bold text-white group-hover:text-blue-400 transition'>
                                                        {u.name}
                                                    </div>
                                                    <div className='text-[10px] text-gray-400 font-mono'>{u.email}</div>
                                                </td>
                                                <td className='py-3.5 px-4'>
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                            u.root_admin
                                                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                                : 'bg-gray-800 text-gray-400'
                                                        }`}
                                                    >
                                                        {u.root_admin ? 'Admin' : 'Client'}
                                                    </span>
                                                </td>
                                                <td className='py-3.5 px-4 font-mono text-[11px] text-gray-400'>
                                                    {u.discord_id ? (
                                                        <span className='text-[#5865F2] bg-[#5865F2]/10 px-2 py-0.5 rounded border border-[#5865F2]/20'>
                                                            {u.discord_username || u.discord_id}
                                                        </span>
                                                    ) : (
                                                        <span className='text-gray-600'>Not Linked</span>
                                                    )}
                                                </td>
                                                <td className='py-3.5 px-4 font-semibold text-gray-300'>
                                                    <span className='inline-flex items-center gap-1'>
                                                        <ServerIcon className='w-3.5 h-3.5 text-indigo-400' />
                                                        {u.servers_count} Server{u.servers_count === 1 ? '' : 's'}
                                                    </span>
                                                </td>
                                                <td className='py-3.5 px-4 font-bold text-amber-400 font-mono'>
                                                    <span className='inline-flex items-center gap-1'>
                                                        <BoltSvgIcon className='w-4 h-4 text-amber-400' />
                                                        {(u.credits ?? 0).toFixed(2)} BOLTs
                                                    </span>
                                                </td>
                                                <td className='py-3.5 px-4 text-right'>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation()
                                                            handleSelectUser(u.id)
                                                        }}
                                                        className='px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600 group-hover:bg-blue-600 text-blue-400 group-hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition'
                                                    >
                                                        View History <ArrowRightIcon className='w-3.5 h-3.5' />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </PageContentBlock>
    )
}

export default AdminUserHistoryContainer
