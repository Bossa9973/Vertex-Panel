import { NavLinkProps, NavLink as RouterLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface Props extends Omit<NavLinkProps, 'className'> {}

const NavLink = ({ children, ...props }: Props) => {
    const defaultClasses =
        'text-sm font-medium transition-colors leading-4 py-3.5 px-4 sm:hover:text-white relative grid place-items-center nav-link whitespace-nowrap'

    return (
        <RouterLink
            {...props}
            className={({ isActive }) =>
                isActive
                    ? `${defaultClasses} text-white border-b-2 border-white`
                    : `${defaultClasses} text-stone-400`
            }
        >
            {children}
        </RouterLink>
    )
}

export default NavLink
