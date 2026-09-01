import { useStoreState } from '@/state'
import { usePersistedState } from '@/util/usePersistedState'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { ServerIcon } from '@heroicons/react/24/outline'
import { Skeleton, Switch } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import useSWR from 'swr'

import getServers from '@/api/getServers'

import Pagination from '@/components/elements/Pagination'
import TextInput from '@/components/elements/inputs/TextInput'

import ServerCard from '@/components/dashboard/ServerCard'

const ServerContainer = () => {
    const { t } = useTranslation('dashboard.index')
    const { t: tStrings } = useTranslation('strings')
    const { search: location } = useLocation()
    const defaultPage = Number(new URLSearchParams(location).get('page') || '1')
    const [page, setPage] = useState(
        !isNaN(defaultPage) && defaultPage > 0 ? defaultPage : 1
    )
    const [query, setQuery] = useState('')
    const [debouncedQuery] = useDebouncedValue(query, 200)

    const uuid = useStoreState(state => state.user.data!.email)
    const rootAdmin = useStoreState(state => state.user.data!.rootAdmin)
    const [showOnlyAdmin, setShowOnlyAdmin] = usePersistedState(
        `${uuid}:show_all_servers`,
        false
    )
    const { data } = useSWR(
        [
            '/api/client/servers',
            showOnlyAdmin && rootAdmin,
            page,
            debouncedQuery,
        ],
        () =>
            getServers({
                query: debouncedQuery,
                page,
                type: showOnlyAdmin && rootAdmin ? 'all' : undefined,
                perPage: 51,
            })
    )

    useEffect(() => {
        setPage(1)
    }, [debouncedQuery])

    const showAllLabel = t('show_all_servers') && !t('show_all_servers').includes('show_all_servers') ? t('show_all_servers') : 'Show All Admin Servers'
    const searchPlaceholder = tStrings('search') && !tStrings('search').includes('search') ? `${tStrings('search')}...` : 'Search servers...'
    const emptyStateText = showOnlyAdmin
        ? 'No servers found matching admin filter criteria.'
        : 'No virtual servers found on your account.'

    return (
        <>
            {rootAdmin && (
                <div className='flex items-center space-x-3 justify-end mb-4 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border border-gray-200/60 dark:border-gray-800/60 w-fit ml-auto'>
                    <p className='text-xs font-semibold text-gray-600 dark:text-gray-300'>{showAllLabel}</p>
                    <Switch
                        checked={showOnlyAdmin}
                        onChange={() => setShowOnlyAdmin(!showOnlyAdmin)}
                    />
                </div>
            )}
            <TextInput
                icon={
                    <MagnifyingGlassIcon className='text-accent-400 w-4 h-4' />
                }
                value={query}
                onChange={e => setQuery(e.currentTarget.value)}
                placeholder={searchPlaceholder}
            />
            <div className='pt-6'>
                {!data ? (
                    <div className='grid sm:grid-cols-2 lg:grid-cols-3 gap-6'>
                        {[1, 2, 3, 4, 5, 6].map(val => (
                            <Skeleton key={val} height='136px' radius='lg' />
                        ))}
                    </div>
                ) : data.pagination.total === 0 ? (
                    <div className='text-center py-12 px-4 bg-gray-50/50 dark:bg-gray-900/40 rounded-xl border border-dashed border-gray-300 dark:border-gray-800'>
                        <ServerIcon className='w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-3' />
                        <p className='text-base font-semibold text-gray-800 dark:text-gray-200'>
                            {emptyStateText}
                        </p>
                        <p className='text-xs text-gray-500 mt-1 max-w-sm mx-auto'>
                            Contact administrator or deploy a new virtual server instance to manage it here.
                        </p>
                    </div>
                ) : (
                    <Pagination data={data} onPageSelect={setPage}>
                        {({ items }) => (
                            <div className='grid sm:grid-cols-2 lg:grid-cols-3 gap-6'>
                                {items.map(server => (
                                    <ServerCard
                                        key={server.uuid}
                                        server={server}
                                    />
                                ))}
                            </div>
                        )}
                    </Pagination>
                )}
            </div>
        </>
    )
}

export default ServerContainer

