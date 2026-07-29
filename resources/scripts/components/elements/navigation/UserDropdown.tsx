import { useStoreState } from '@/state'
import { getInitials } from '@/util/helpers'
import { CpuChipIcon, ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import { Avatar } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import Menu from '@/components/elements/Menu'
import ThemeSwitch from '@/components/elements/ThemeSwitch'

interface Props {
    logout: () => void
}

const UserDropdown = ({ logout }: Props) => {
    const user = useStoreState(state => state.user.data)
    const navigate = useNavigate()
    const { t: tAuth } = useTranslation('auth')
    const { t: tStrings } = useTranslation('strings')

    const adminLabel = tStrings('admin_cp') && !tStrings('admin_cp').includes('admin_cp') ? tStrings('admin_cp') : 'Admin Control Panel'
    const signOutLabel = tAuth('sign_out') && !tAuth('sign_out').includes('sign_out') ? tAuth('sign_out') : 'Sign Out'

    if (!user) return null

    return (
        <div className='hidden sm:flex items-center space-x-3.5'>
            {/* BOLT Balance Badge */}
            <Link
                to='/credits'
                className='flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 dark:bg-gradient-to-r dark:from-amber-500/15 dark:to-amber-600/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold text-xs transition-all border border-amber-500/30 shadow-xs hover:border-amber-400/50 cursor-pointer active:scale-95'
                title='Click to top up account BOLTs'
            >
                <BoltSvgIcon className='w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0' />
                <span className='font-mono tracking-tight'>{(user.credits ?? 0).toFixed(2)} BOLTs</span>
            </Link>

            {/* Theme Toggle Button */}
            <ThemeSwitch />

            {/* User Dropdown */}
            <Menu width={240} position='bottom-end' withinPortal zIndex={9999} shadow='xl'>
                <Menu.Target>
                    <button className='group flex items-center space-x-3 bg-white/80 dark:bg-neutral-900/60 hover:bg-slate-100 dark:hover:bg-neutral-800/80 border border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 backdrop-blur-md rounded-2xl px-3 py-1.5 transition-all duration-200 cursor-pointer active:scale-95 shadow-xs dark:shadow-md'>
                        <span className='text-slate-800 dark:text-stone-200 group-hover:text-slate-900 dark:group-hover:text-white font-bold text-xs tracking-tight transition-colors'>
                            {user.name}
                        </span>
                        <Avatar color='blue' size='sm' radius='xl' className='font-bold shadow-sm ring-2 ring-blue-500/40'>
                            {getInitials(user.name, ' ', 2)}
                        </Avatar>
                    </button>
                </Menu.Target>
                <Menu.Dropdown>
                    {/* User Header Details */}
                    <div className='px-3 py-2 mb-1 border-b border-slate-200/80 dark:border-white/10'>
                        <p className='text-xs font-bold text-slate-900 dark:text-white tracking-tight truncate'>{user.name}</p>
                        <p className='text-[11px] font-medium text-slate-500 dark:text-stone-400 truncate'>{user.email}</p>
                    </div>

                    <Menu.Item
                        icon={<BoltSvgIcon className='w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0' />}
                        onClick={() => navigate('/credits')}
                    >
                        <div className='flex items-center justify-between w-full'>
                            <span>Billing & BOLTs</span>
                            <span className='text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20'>
                                {(user.credits ?? 0).toFixed(2)}
                            </span>
                        </div>
                    </Menu.Item>

                    {user.rootAdmin && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                icon={<CpuChipIcon className='w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0' />}
                                onClick={() => navigate('/admin')}
                            >
                                <span className='text-slate-800 dark:text-stone-200 font-bold'>{adminLabel}</span>
                            </Menu.Item>
                        </>
                    )}

                    <Menu.Divider />

                    <Menu.Item
                        color='red'
                        icon={<ArrowLeftOnRectangleIcon className='w-4 h-4 text-rose-400 shrink-0' />}
                        onClick={logout}
                    >
                        <span className='font-bold'>{signOutLabel}</span>
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </div>
    )
}

export default UserDropdown
