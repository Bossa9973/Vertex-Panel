import { AdminBanner } from '@/routers/AdminDashboardRouter'
import { bindUrlParams } from '@/util/helpers'
import { Burger, LoadingOverlay } from '@mantine/core'
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { Link, useMatch, useMatches } from 'react-router-dom'
import { useStoreState } from '@/state'

import http from '@/api/http'

import ContentContainer from '@/components/elements/ContentContainer'
import Logo from '@/components/elements/Logo'
import NavLink from '@/components/elements/navigation/NavLink'
import NavigationDropdown from '@/components/elements/navigation/NavigationDropdown'
import UserDropdown from '@/components/elements/navigation/UserDropdown'

export interface RouteDefinition {
    name: string
    path: string
    end?: boolean
}

interface NavigationBarContextInterface {
    routes: RouteDefinition[]
    setRoutes: (routes: RouteDefinition[]) => void
    breadcrumb?: string | null
    setBreadcrumb: (breadcrumb: string | null | undefined) => void
}

export const NavigationBarContext =
    createContext<NavigationBarContextInterface>({
        routes: [],
        setRoutes: () => {},
        breadcrumb: null,
        setBreadcrumb: () => {},
    })

const NavigationBar = () => {
    const { routes, breadcrumb } = useContext(NavigationBarContext)
    const [isVisible, setIsVisible] = useState(true)
    const [menuVisible, setMenuVisible] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const topBar = useRef(null)
    const bottomBar = useRef<HTMLDivElement>(null)
    const placeholder = useRef<HTMLDivElement>(null)
    const logo = useRef<HTMLDivElement>(null)
    const isAdminArea = useMatch('/admin/*')
    const matches = useMatches()
    const isDark = useStoreState(state => state.settings.data?.theme !== 'light')

    const visibilityObserver = useMemo(
        () =>
            new IntersectionObserver(([entry]) =>
                setIsVisible(entry.isIntersecting)
            ),
        []
    )

    useEffect(() => {
        const resizeListener = () => {
            let width =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                document.body.clientWidth

            if (width < 640) {
                setMenuVisible(false)
            }
        }

        //@ts-ignore
        visibilityObserver.observe(topBar.current)

        window.addEventListener('resize', resizeListener)

        return () => {
            visibilityObserver.disconnect()
            window.removeEventListener('resize', resizeListener)
        }
    }, [])

    useEffect(() => {
        if (logo.current && bottomBar.current && placeholder.current) {
            if (!isVisible) {
                bottomBar.current.classList.add(
                    'fixed',
                    'top-0',
                    'left-0',
                    'right-0',
                    '!bg-black/90',
                    '!backdrop-blur-xl',
                    '!border-b',
                    '!border-white/10',
                    '!shadow-2xl'
                )
                logo.current.classList.add('!w-8')
                placeholder.current.classList.remove('hidden')
            } else {
                bottomBar.current.classList.remove(
                    'fixed',
                    'top-0',
                    'left-0',
                    'right-0',
                    '!bg-black/90',
                    '!backdrop-blur-xl',
                    '!border-b',
                    '!border-white/10',
                    '!shadow-2xl'
                )
                logo.current.classList.remove('!w-8')
                placeholder.current.classList.add('hidden')
            }
        }
    }, [isVisible])

    const logout = () => {
        setIsLoggingOut(true)
        http.post('/logout').finally(() => {
            // @ts-expect-error
            window.location = '/'
        })
    }

    return (
        <div className='bg-transparent backdrop-blur-md w-full font-sans border-b border-white/[0.05]'>
            {isAdminArea && <AdminBanner />}
            <LoadingOverlay visible={isLoggingOut} zIndex={4000} />
            <ContentContainer ref={topBar} className='pt-3 pb-1.5 relative'>
                <div className='flex justify-between items-center'>
                    <div className='flex shrink overflow-hidden space-x-5 items-center'>
                        <Link
                            to={isAdminArea ? '/admin' : '/'}
                            className='flex items-center space-x-3 group'
                        >
                            <Logo className='w-6 h-6 text-white group-hover:scale-105 transition-transform' />
                            <h1 className='font-semibold text-lg text-white font-sans tracking-tight'>
                                Vertex
                            </h1>
                        </Link>
                        {breadcrumb && (
                            <>
                                <div className='py-1.5 h-full'>
                                    <div className='rotate-[25deg] w-[2px] h-full bg-[#eaeaea] dark:bg-stone-800 rounded-full' />
                                </div>
                                <p className='shrink font-medium text-sm text-stone-200 truncate text-ellipsis overflow-hidden whitespace-nowrap'>
                                    {breadcrumb}
                                </p>
                            </>
                        )}
                    </div>

                    <UserDropdown logout={logout} />
                    <Burger
                        className='block sm:hidden'
                        opened={menuVisible}
                        onClick={() =>
                            setMenuVisible(visibility => !visibility)
                        }
                    />
                </div>
            </ContentContainer>
            <NavigationDropdown
                onClose={() => setMenuVisible(false)}
                logout={logout}
                visible={menuVisible}
            />
            <div
                ref={bottomBar}
                className='bg-transparent backdrop-blur-md shadow-none transition-shadow w-full border-t border-b border-white/[0.05] z-[2000]'
            >
                <ContentContainer className='flex w-full'>
                    <div
                        className='grid place-items-center transition-all w-0 inset-y-0 overflow-hidden'
                        ref={logo}
                        style={{
                            transition: 'width 0.25s ease',
                        }}
                    >
                        <Logo className='w-5 h-5 text-white' />
                    </div>
                    <div className='flex z-[2000] overflow-x-auto scrollbar-hide font-sans text-xs font-semibold'>
                        {routes.map(route => (
                            <NavLink
                                end={route.end}
                                key={route.path}
                                to={bindUrlParams(
                                    route.path,
                                    matches[matches.length - 1].params
                                )}
                            >
                                {route.name}
                            </NavLink>
                        ))}
                    </div>
                </ContentContainer>
            </div>
            <div
                ref={placeholder}
                className='hidden h-[49px] w-full bg-transparent'
            />
        </div>
    )
}

export default NavigationBar
