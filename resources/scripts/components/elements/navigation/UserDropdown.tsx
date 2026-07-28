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
        <div className='hidden sm:flex items-center space-x-3'>
            {/* BOLT Balance Badge */}
            <Link
                to='/credits'
                className='flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs transition border border-amber-500/20 shadow-xs'
                title='Click to top up account BOLTs'
            >
                <BoltSvgIcon className='w-4 h-4 text-amber-400' />
                <span>{(user.credits ?? 0).toFixed(2)} BOLTs</span>
            </Link>

            {/* Theme Toggle Button */}
            <ThemeSwitch />

            {/* User Dropdown */}
            <Menu width={220} position='bottom-end'>
                <Menu.Target>
                    <button className='flex items-center space-x-3 bg-transparent ring-transparent rounded-xl px-2.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-875 transition cursor-pointer'>
                        <p className='text-gray-900 dark:text-gray-100 font-semibold text-sm'>
                            {user.name}
                        </p>
                        <Avatar color='blue' size='md' radius='xl' className='font-bold shadow-xs'>
                            {getInitials(user.name, ' ', 2)}
                        </Avatar>
                    </button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        icon={<BoltSvgIcon className='w-4 h-4 text-amber-400' />}
                        onClick={() => navigate('/credits')}
                    >
                        Billing & BOLTs ({(user.credits ?? 0).toFixed(2)} BOLTs)
                    </Menu.Item>
                    <Menu.Divider />
                    {user.rootAdmin && (
                        <>
                            <Menu.Item
                                icon={<CpuChipIcon className='w-4 h-4 text-primary-500' />}
                                onClick={() => navigate('/admin')}
                            >
                                {adminLabel}
                            </Menu.Item>
                            <Menu.Divider />
                        </>
                    )}
                    <Menu.Item
                        color='red'
                        icon={<ArrowLeftOnRectangleIcon className='w-4 h-4' />}
                        onClick={logout}
                    >
                        {signOutLabel}
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </div>
    )
}

export default UserDropdown
