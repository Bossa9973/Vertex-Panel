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
                    'relative inline-flex items-center justify-center py-3 px-4 font-sans transition-all duration-150 whitespace-nowrap outline-none border-b-2',
                    isEarn
                        ? 'text-xs text-neutral-400 hover:text-neutral-200 font-normal border-transparent'
                        : 'text-sm font-medium text-neutral-400 hover:text-neutral-200 border-transparent',
                    isActive && !isEarn && 'text-white font-bold border-white',
                    isActive && isEarn && 'text-neutral-200 font-semibold border-neutral-400'
                )
            }
        >
            {children}
        </RouterLink>
    )
}

export default NavLink
