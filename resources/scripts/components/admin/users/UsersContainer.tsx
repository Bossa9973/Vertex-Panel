import usePagination from '@/util/usePagination'
import { CheckIcon } from '@heroicons/react/20/solid'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useDebouncedValue } from '@mantine/hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { User } from '@/api/admin/users/getUsers'
import useUsersSWR from '@/api/admin/users/useUsersSWR'
import { toggleUserIpPrivacy } from '@/api/admin/roles/adminRoles'

import PageContentBlock from '@/components/elements/PageContentBlock'
import Pagination from '@/components/elements/Pagination'
import Spinner from '@/components/elements/Spinner'
import Table, { ColumnArray } from '@/components/elements/displays/Table'

import SearchBar from '@/components/admin/SearchBar'
import CreateUserModal from '@/components/admin/users/CreateUserModal'

const IpPrivacyCell = ({ row }: { row: User }) => {
    const [hidden, setHidden] = useState(Boolean(row.hideIpInAudit))
    const [loading, setLoading] = useState(false)

    const handleToggle = async () => {
        setLoading(true)
        try {
            await toggleUserIpPrivacy(row.id, !hidden)
            setHidden(!hidden)
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to toggle IP privacy.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='flex items-center justify-center'>
            <button
                type='button'
                onClick={handleToggle}
                disabled={loading}
                title={hidden ? 'IP address is hidden in audit logs. Click to make visible.' : 'IP address is visible in audit logs. Click to hide.'}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer active:scale-95 disabled:opacity-50 ${
                    hidden
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                        : 'bg-neutral-800 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
            >
                {hidden ? (
                    <>
                        <EyeSlashIcon className='w-3.5 h-3.5 text-amber-400' />
                        <span>IP Hidden</span>
                    </>
                ) : (
                    <>
                        <EyeIcon className='w-3.5 h-3.5 text-gray-400' />
                        <span>IP Visible</span>
                    </>
                )}
            </button>
        </div>
    )
}

const columns: ColumnArray<User> = [
    {
        accessor: 'name',
        header: 'Name',
        cell: ({ value, row }) => (
            <Link
                to={`/admin/users/${row.id}/settings`}
                className='link text-foreground font-medium'
            >
                {value}
            </Link>
        ),
    },
    {
        accessor: 'email',
        header: 'Email',
    },
    {
        accessor: 'rootAdmin',
        header: 'Administrator',
        align: 'center',
        cell: ({ value }) => (
            <div className='grid place-items-center'>
                {value ? (
                    <CheckIcon
                        title='hidden'
                        className='h-5 w-5 text-foreground'
                    />
                ) : null}
            </div>
        ),
    },
    {
        accessor: 'hideIpInAudit',
        header: 'Audit Privacy',
        align: 'center',
        cell: ({ row }) => <IpPrivacyCell row={row} />,
    },
    {
        accessor: 'serversCount',
        header: 'Servers',
        align: 'center',
        cell: ({ value, row }) => (
            <Link
                to={`/admin/users/${row.id}/servers`}
                className='link text-foreground'
            >
                {value}
            </Link>
        ),
    },
]

const UsersContainer = () => {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [debouncedQuery] = useDebouncedValue(query, 200)
    const [page, setPage] = usePagination()
    const { data } = useUsersSWR({ page, query: debouncedQuery })

    return (
        <div className='bg-background min-h-screen'>
            <CreateUserModal open={open} onClose={() => setOpen(false)} />
            <PageContentBlock title='Users' showFlashKey='admin:users'>
                <SearchBar
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    buttonText='New User'
                    onClick={() => setOpen(true)}
                />
                {!data ? (
                    <Spinner />
                ) : (
                    <Pagination data={data} onPageSelect={setPage}>
                        {({ items }) => (
                            <Table columns={columns} data={items} />
                        )}
                    </Pagination>
                )}
            </PageContentBlock>
        </div>
    )
}

export default UsersContainer