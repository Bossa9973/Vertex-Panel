import { useDebouncedValue } from '@mantine/hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import PageContentBlock from '@/components/elements/PageContentBlock'

type Tab = 'all' | 'failed_uninstalls'

import SearchBar from '@/components/admin/SearchBar'
import CreateServerModal from '@/components/admin/servers/CreateServerModal'
import ServersTable from '@/components/admin/servers/ServersTable'


const ServersContainer = () => {
    const [query, setQuery] = useState('')
    const [debouncedQuery] = useDebouncedValue(query, 200)
    const [open, setOpen] = useState(false)
    const [tab, setTab] = useState<Tab>('all')
    const { t } = useTranslation('admin.servers.index')
    const { t: tStrings } = useTranslation('strings')

    return (
        <div className='bg-background min-h-screen'>
            <CreateServerModal open={open} onClose={() => setOpen(false)} />
            <PageContentBlock title={tStrings('server_other') ?? 'Servers'}>
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6'>
                    {/* Sub-Tabs: All Servers vs Failed Installs */}
                    <div className='flex items-center gap-2 p-1.5 bg-[#141619] border border-stone-800/80 rounded-2xl w-fit'>
                        <button
                            type='button'
                            onClick={() => setTab('all')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                tab === 'all'
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-md'
                                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
                            }`}
                        >
                            All Servers
                        </button>
                        <button
                            type='button'
                            onClick={() => setTab('failed_uninstalls')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                tab === 'failed_uninstalls'
                                    ? 'bg-red-600/20 text-red-400 border border-red-500/30 shadow-md'
                                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
                            }`}
                        >
                            <span className='w-2 h-2 rounded-full bg-red-400 animate-pulse' />
                            Failed Uninstalls
                        </button>
                    </div>

                    <SearchBar
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        buttonText={t('create_server')}
                        onClick={() => setOpen(true)}
                    />
                </div>
                <ServersTable query={debouncedQuery} tab={tab} />
            </PageContentBlock>
        </div>
    )
}

export default ServersContainer