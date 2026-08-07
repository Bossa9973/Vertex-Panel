import { useStoreState } from '@/state'
import { ReactNode, useEffect } from 'react'
import { Link, useMatch, useNavigate } from 'react-router-dom'

import ContentContainer from '@/components/elements/ContentContainer'

interface LinkProps {
    children: ReactNode
    onClick: () => void
    to: string
}
const NavLink = ({ children, onClick, to }: LinkProps) => {
    return (
        <Link
            className='flex items-center h-12 border-b border-accent-200 bg-transparent active:bg-accent-100 transition-colors'
            to={to}
            onClick={onClick}
        >
            <span>{children}</span>
        </Link>
    )
}

export interface RouteDefinition {
    name: string
    path: string
    end?: boolean
}

interface Props {
    logout: () => void
    onClose: () => void
    visible?: boolean
    routes?: RouteDefinition[]
}

const NavigationDropdown = ({ logout, onClose, visible, routes = [] }: Props) => {
    const user = useStoreState(state => state.user.data)
    const isAdminArea = useMatch('/admin/*')

    useEffect(() => {
        if (visible) {
            document.body.classList.add('fixed', 'w-full')
        } else {
            document.body.classList.remove('fixed', 'w-full')
        }
    }, [visible])

    return (
        <>
            {visible && (
                <div
                    className={`inset-x-0 ${
                        isAdminArea ? 'top-[80px]' : 'top-[56px]'
                    } pt-1.5 bottom-0 block fixed bg-[#0a0c14]/95 backdrop-blur-2xl z-[3000] overflow-y-auto`}
                >
                    <ContentContainer>
                        <div className='flex flex-col w-full py-3 divide-y divide-white/10'>
                            {routes.map(route => (
                                <NavLink key={route.path} to={route.path} onClick={onClose}>
                                    <span className='font-semibold text-sm text-gray-200 hover:text-white'>{route.name}</span>
                                </NavLink>
                            ))}
                            {user?.rootAdmin ? (
                                <NavLink to={isAdminArea ? '/' : '/admin'} onClick={onClose}>
                                    <span className='font-bold text-sm text-amber-400'>
                                        {isAdminArea ? '← Client Panel' : '🛡 Admin Center'}
                                    </span>
                                </NavLink>
                            ) : null}
                            <button
                                className='flex items-center h-12 text-rose-400 font-semibold text-sm bg-transparent active:bg-white/5 transition-colors'
                                onClick={() => {
                                    onClose()
                                    logout()
                                }}
                            >
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </ContentContainer>
                </div>
            )}
        </>
    )
}

export default NavigationDropdown
