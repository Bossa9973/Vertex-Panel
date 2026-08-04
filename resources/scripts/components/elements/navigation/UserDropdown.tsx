import { useStoreState } from '@/state'
import { getInitials } from '@/util/helpers'
import { CpuChipIcon, ArrowLeftOnRectangleIcon, UserIcon } from '@heroicons/react/24/outline'
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
    const isDark = useStoreState(state => state.settings.data?.theme !== 'light')
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
                className='flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-white transition-all cursor-pointer font-sans'
                title='Click to top up account BOLTs'
            >
                <BoltSvgIcon className='w-4 h-4 text-amber-400 shrink-0' />
                <span className='font-sans text-sm font-semibold text-white'>{(user.credits ?? 0).toFixed(2)}</span>
                <span className='text-xs font-semibold text-amber-400 font-sans'>BOLTs</span>
            </Link>

            {/* Theme Toggle Button */}
            <ThemeSwitch />

            {/* User Dropdown */}
            <Menu width={240} position='bottom-end' withinPortal zIndex={9999} shadow='xl'>
                <Menu.Target>
                    <button className={`group flex items-center space-x-3 backdrop-blur-md rounded-2xl px-3 py-1.5 transition-all duration-200 cursor-pointer active:scale-95 ${isDark ? 'bg-neutral-900/60 hover:bg-neutral-800/80 border border-white/10 hover:border-white/20 shadow-md' : 'bg-white/80 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 shadow-xs'}`}>
                        <span className={`font-bold text-xs tracking-tight transition-colors ${isDark ? 'text-stone-200 group-hover:text-white' : 'text-slate-800 group-hover:text-slate-900'}`}>
                            {user.name}
                        </span>
                        <Avatar color='blue' size='sm' radius='xl' className='font-bold shadow-sm ring-2 ring-blue-500/40'>
                            {getInitials(user.name, ' ', 2)}
                        </Avatar>
                    </button>
                </Menu.Target>
                <Menu.Dropdown>
                    {/* User Header Details - Clicking user name opens /account */}
                    <div
                        onClick={() => navigate('/account')}
                        className={`px-3 py-2mb-1 border-b cursor-pointer transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                        title='Click to manage profile and linked accounts'
                    >
                        <p className={`font-bold text-xs truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {user.name}
                        </p>
                        <p className='text-[11px] text-gray-400 truncate font-sans'>
                            {user.email}
                        </p>
                    </div>

                    <Menu.Item
                        icon={<UserIcon className='w-4 h-4 text-blue-400 shrink-0' />}
                        onClick={() => navigate('/account')}
                    >
                        <div className='flex items-center justify-between w-full font-sans'>
                            <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-slate-800'}`}>Account Profile</span>
                        </div>
                    </Menu.Item>

                    <Menu.Item
                        icon={<BoltSvgIcon className='w-4 h-4 text-blue-400 shrink-0' />}
                        onClick={() => navigate('/credits')}
                    >
                        <div className='flex items-center justify-between w-full font-sans'>
                            <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-slate-800'}`}>Billing & BOLTs</span>
                            <span className='text-[11px] font-sans font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20'>
                                {(user.credits ?? 0).toFixed(2)} BOLTs
                            </span>
                        </div>
                    </Menu.Item>

                    {user.rootAdmin && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                icon={<CpuChipIcon className='w-4 h-4 text-blue-400 shrink-0' />}
                                onClick={() => navigate('/admin')}
                            >
                                <span className={`font-bold ${isDark ? 'text-stone-200' : 'text-slate-800'}`}>{adminLabel}</span>
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
