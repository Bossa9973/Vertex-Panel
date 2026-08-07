import usePagination from '@/util/usePagination'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import http from '@/api/http'

import useServersSWR from '@/api/admin/servers/useServersSWR'
import { AdminServerBuild } from '@/api/admin/servers/getServer'

import Menu from '@/components/elements/Menu'
import Pagination from '@/components/elements/Pagination'
import Spinner from '@/components/elements/Spinner'
import { Actions } from '@/components/elements/displays/Table'

interface Props {
    query?: string
    className?: string
    nodeId?: number
    userId?: number
    tab?: 'all' | 'failed_uninstalls'
}

type RowActionsProps = { row: AdminServerBuild }

const STATUS_BADGE: Record<string, string> = {
    install_failed: 'bg-red-500/10 text-red-400 border-red-500/30',
    deletion_failed: 'bg-red-500/10 text-red-400 border-red-500/30',
    installing: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    deleting: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    suspended: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
}

const ServersTable = ({ query, className, nodeId, userId, tab = 'all' }: Props) => {
    const { t: tStrings } = useTranslation('strings')
    const [page, setPage] = usePagination()
    const { data, mutate } = useServersSWR({
        page,
        query,
        nodeId,
        userId,
        include: ['node', 'user'],
    })

    const [selectedIds, setSelectedIds] = useState<number[]>([])
    const [fadingIds, setFadingIds] = useState<number[]>([])
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const filterItems = (items: AdminServerBuild[]) => {
        if (tab === 'failed_uninstalls') {
            return items.filter(s => s.status === 'deletion_failed')
        }
        return items
    }

    const toggleSelectAll = (items: AdminServerBuild[]) => {
        const visible = filterItems(items).map(s => s.internalId)
        if (selectedIds.length === visible.length && visible.length > 0) {
            setSelectedIds([])
        } else {
            setSelectedIds(visible)
        }
    }

    const toggleSelect = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return
        setDeleting(true)
        setErrorMsg(null)
        setFadingIds(selectedIds)

        // force=true  → DB wipe only (Failed Uninstalls tab, no Proxmox)
        // force=false → dispatch real deletion job chain (All Servers tab)
        const force = tab === 'failed_uninstalls'

        try {
            await http.post('/api/admin/servers/bulk-delete', {
                server_ids: selectedIds,
                force,
            })
            setTimeout(async () => {
                setSelectedIds([])
                setConfirmOpen(false)
                setDeleting(false)
                setFadingIds([])
                await mutate()
            }, 700)
        } catch (e: any) {
            setErrorMsg(e.response?.data?.message || 'Bulk deletion failed.')
            setDeleting(false)
            setFadingIds([])
        }
    }

    const rowActions = ({ row: server }: RowActionsProps) => (
        <Actions>
            <Menu.Item onClick={() => navigator.clipboard.writeText(server.uuid)}>
                Copy UUID
            </Menu.Item>
            <Menu.Item
                color='red'
                onClick={() => {
                    setSelectedIds([server.internalId])
                    setConfirmOpen(true)
                }}
            >
                Force Wipe
            </Menu.Item>
        </Actions>
    )

    return (
        <div className={`relative ${className ?? ''}`}>

            {/* ─── Confirmation Modal ──────────────────────────────────────── */}
            {confirmOpen && (
                <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm'>
                    <div className='w-full max-w-md bg-[#141619] border border-stone-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-element'>
                        <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-xl font-bold shrink-0'>!</div>
                            <div>
                                <h3 className='text-base font-bold text-white'>
                                    {tab === 'failed_uninstalls'
                                        ? `Force Wipe ${selectedIds.length} Server${selectedIds.length !== 1 ? 's' : ''} from DB`
                                        : `Delete ${selectedIds.length} Server${selectedIds.length !== 1 ? 's' : ''}`
                                    }
                                </h3>
                                <p className='text-xs text-stone-500'>
                                    {tab === 'failed_uninstalls'
                                        ? 'Immediate database purge — no Proxmox communication'
                                        : 'Dispatches Proxmox deletion job chain'
                                    }
                                </p>
                            </div>
                        </div>
                        <p className='text-sm text-stone-300 leading-relaxed bg-stone-900/60 border border-stone-800 rounded-xl p-4'>
                            {tab === 'failed_uninstalls' ? (
                                <>
                                    Selected server{selectedIds.length !== 1 ? 's' : ''} will be{' '}
                                    <span className='text-red-400 font-semibold'>permanently wiped</span> from the database
                                    with no Proxmox communication. All allocated IPs will be released immediately.
                                </>
                            ) : (
                                <>
                                    The deletion job will be dispatched for {selectedIds.length} server{selectedIds.length !== 1 ? 's' : ''}.
                                    Proxmox will delete the VM and then remove the record from the database.{' '}
                                    <span className='text-amber-400 font-semibold'>If Proxmox fails</span>, the server
                                    will appear in the <span className='text-white font-semibold'>Failed Uninstalls</span> tab
                                    where you can force-wipe it.
                                </>
                            )}
                        </p>
                        {errorMsg && (
                            <p className='text-xs text-red-400 bg-red-950/40 border border-red-500/20 rounded-xl px-4 py-2'>{errorMsg}</p>
                        )}
                        <div className='flex items-center justify-end gap-3 pt-1'>
                            <button
                                type='button'
                                disabled={deleting}
                                onClick={() => { setConfirmOpen(false); setErrorMsg(null) }}
                                className='px-4 py-2 text-xs font-semibold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-xl transition disabled:opacity-50'
                            >
                                Cancel
                            </button>
                            <button
                                type='button'
                                disabled={deleting}
                                onClick={handleBulkDelete}
                                className='px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 rounded-xl shadow-lg shadow-red-600/20 transition flex items-center gap-2 disabled:opacity-50'
                            >
                                {deleting ? '…Wiping' : '⚡ Wipe Into Void'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Floating Selection Bar ──────────────────────────────────── */}
            {selectedIds.length > 0 && (
                <div className='fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-5 px-6 py-3.5 bg-[#141619]/95 border border-red-500/30 backdrop-blur-xl rounded-2xl shadow-2xl'>
                    <span className='text-sm font-semibold text-stone-200'>
                        🗑 {selectedIds.length} selected
                    </span>
                    <button
                        type='button'
                        onClick={() => setSelectedIds([])}
                        className='text-xs text-stone-400 hover:text-white px-3 py-1.5 bg-stone-800/80 rounded-lg transition'
                    >
                        Clear
                    </button>
                    <button
                        type='button'
                        onClick={() => setConfirmOpen(true)}
                        className='text-xs font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 px-4 py-2 rounded-xl shadow-lg shadow-red-600/20 transition'
                    >
                        ⚡ Delete Selected
                    </button>
                </div>
            )}

            {/* ─── Table ───────────────────────────────────────────────────── */}
            {!data ? (
                <Spinner />
            ) : (
                <Pagination data={data} onPageSelect={setPage}>
                    {({ items }) => {
                        const visible = filterItems(items)
                        const allSelected =
                            visible.length > 0 &&
                            visible.every(s => selectedIds.includes(s.internalId))

                        if (visible.length === 0) {
                            return (
                                <div className='p-10 text-center text-stone-400 text-sm bg-[#141619] border border-stone-800/80 rounded-2xl'>
                                    {tab === 'failed_uninstalls'
                                        ? 'No servers with failed uninstallation found.'
                                        : 'No servers found.'}
                                </div>
                            )
                        }

                        return (
                            <div className='overflow-x-auto rounded-2xl border border-stone-800/80'>
                                <table className='w-full text-left border-collapse text-sm'>
                                    <thead>
                                        <tr className='border-b border-stone-800/80 bg-stone-900/50 text-xs font-bold text-stone-400 uppercase tracking-wider'>
                                            <th className='p-3 w-10'>
                                                <input
                                                    type='checkbox'
                                                    checked={allSelected}
                                                    onChange={() => toggleSelectAll(items)}
                                                    className='rounded border-stone-700 bg-stone-900 text-blue-500 focus:ring-0 cursor-pointer'
                                                />
                                            </th>
                                            <th className='p-3'>{tStrings('name') ?? 'Name'}</th>
                                            <th className='p-3'>{tStrings('hostname') ?? 'Hostname'}</th>
                                            <th className='p-3'>{tStrings('owner') ?? 'Owner'}</th>
                                            <th className='p-3'>{tStrings('node') ?? 'Node'}</th>
                                            <th className='p-3 text-right'>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-stone-800/40'>
                                        {visible.map(server => {
                                            const isFading = fadingIds.includes(server.internalId)
                                            return (
                                                <tr
                                                    key={server.internalId}
                                                    className={`transition-all duration-700 ${
                                                        isFading
                                                            ? 'opacity-0 scale-95 -translate-y-1 blur-sm bg-red-950/40 pointer-events-none'
                                                            : 'hover:bg-stone-900/40'
                                                    }`}
                                                >
                                                    <td className='p-3'>
                                                        <input
                                                            type='checkbox'
                                                            checked={selectedIds.includes(server.internalId)}
                                                            onChange={() => toggleSelect(server.internalId)}
                                                            className='rounded border-stone-700 bg-stone-900 text-blue-500 focus:ring-0 cursor-pointer'
                                                        />
                                                    </td>
                                                    <td className='p-3 font-bold text-white'>
                                                        <div className='flex items-center gap-2 flex-wrap'>
                                                            <Link
                                                                to={`/admin/servers/${server.internalId}`}
                                                                className='hover:text-blue-400 transition'
                                                            >
                                                                {server.name}
                                                            </Link>
                                                            {server.status && (
                                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wider ${STATUS_BADGE[server.status] ?? 'bg-stone-800 text-stone-400 border-stone-700'} ${server.status === 'installing' || server.status === 'deleting' ? 'animate-pulse' : ''}`}>
                                                                    {server.status.replace('_', ' ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className='p-3 text-xs text-stone-300 font-mono'>{server.hostname}</td>
                                                    <td className='p-3 text-xs'>
                                                        {server.user ? (
                                                            <Link
                                                                to={`/admin/users/${server.user.id}/settings`}
                                                                className='text-stone-300 hover:text-white transition'
                                                            >
                                                                {server.user.email}
                                                            </Link>
                                                        ) : '—'}
                                                    </td>
                                                    <td className='p-3 text-xs text-stone-400'>
                                                        {server.node?.name ?? '—'}
                                                    </td>
                                                    <td className='p-3 text-right'>
                                                        {rowActions({ row: server })}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    }}
                </Pagination>
            )}
        </div>
    )
}

export default ServersTable
