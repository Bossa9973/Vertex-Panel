import { NavLinkProps, NavLink as RouterLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface Props extends Omit<NavLinkProps, 'className'> {}

const NavLink = ({ children, ...props }: Props) => {
    const isEarn = typeof children === 'string' && children.toLowerCase().includes('earn')

    return (
        <RouterLink
            {...props}
            className={({ isActive }) =>
                cn(
                    'relative inline-flex items-center justify-center py-3 px-4 font-sans transition-all duration-150 whitespace-nowrap outline-none border-b-2 border-transparent',
                    isEarn
                        ? 'text-xs text-gray-500 hover:text-gray-300 font-medium'
                        : 'text-sm font-medium text-gray-400 hover:text-gray-200',
                    isActive && !isEarn && 'text-white font-bold border-blue-500',
                    isActive && isEarn && 'text-gray-300 font-semibold border-gray-600'
                )
            }
        >
            {children}
        </RouterLink>
    )
}

export default NavLink
