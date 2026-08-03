import { routes as adminCotermRoutes } from '@/routers/AdminCotermRouter'
import { routes as adminIpamRoutes } from '@/routers/AdminIpamRouter'
import { routes as adminNodeRoutes } from '@/routers/AdminNodeRouter'
import { routes as adminServerRoutes } from '@/routers/AdminServerRouter'
import { routes as adminUserRoutes } from '@/routers/AdminUserRouter'
import { lazyLoad } from '@/routers/helpers'
import AuthenticatedRoutes from '@/routers/middleware/AuthenticatedRoutes'
import { Route } from '@/routers/router'
import { HomeIcon } from '@heroicons/react/20/solid'
import { lazy, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useMatch } from 'react-router-dom'

import ContentContainer from '@/components/elements/ContentContainer'
import { NavigationBarContext } from '@/components/elements/navigation/NavigationBar'

export const routes: Route[] = [
    {
        path: '/admin',
        element: (
            <AuthenticatedRoutes requireRootAdmin>
                {lazyLoad(lazy(() => import('@/routers/AdminDashboardRouter')))}
            </AuthenticatedRoutes>
        ),
        handle: {
            crumb: () => ({
                to: '/admin',
                element: (
                    <HomeIcon
                        className={
                            'w-4 h-4 text-blue-400 hover:text-blue-300 transition'
                        }
                    />
                ),
            }),
        },
        children: [
            {
                index: true,
                element: lazyLoad(
                    lazy(
                        () =>
                            import(
                                '@/components/admin/overview/OverviewContainer'
                            )
                    )
                ),
            },
            {
                path: 'locations',
                element: lazyLoad(
                    lazy(
                        () =>
                            import(
                                '@/components/admin/locations/LocationsContainer'
                            )
                    )
                ),
            },
            ...adminNodeRoutes,
            ...adminServerRoutes,
            ...adminIpamRoutes,
            ...adminUserRoutes,
            ...adminCotermRoutes,
            {
                path: 'plans',
                element: lazyLoad(
                    lazy(
                        () =>
                            import('@/components/admin/plans/AdminVpsPlansContainer')
                    )
                ),
            },
            {
                path: 'user-balances',
                element: lazyLoad(
                    lazy(
                        () =>
                            import('@/components/admin/users/AdminUserBalanceContainer')
                    )
                ),
            },
            {
                path: 'tokens',
                element: lazyLoad(
                    lazy(
                        () =>
                            import('@/components/admin/tokens/TokensContainer')
                    )
                ),
            },
            {
                path: 'maintenance',
                element: lazyLoad(
                    lazy(
                        () =>
                            import('@/components/admin/maintenance/AdminMaintenanceContainer')
                    )
                ),
            },
        ],
    },
]

export const AdminBanner = () => (
    <div className='bg-[#0c0f18] border-b border-blue-500/20 py-2'>
        <ContentContainer className='flex items-center justify-between'>
            <span className='text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2'>
                <span className='w-2 h-2 rounded-full bg-amber-400 animate-ping' /> Vertex Administration Control Panel
            </span>
            <Link to='/' className='text-xs font-bold text-blue-400 hover:text-blue-300 transition flex items-center gap-1 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20'>
                &larr; Exit Administration
            </Link>
        </ContentContainer>
    </div>
)

const AdminDashboardRouter = () => {
    const { setRoutes } = useContext(NavigationBarContext)
    const isDashboardArea = useMatch('/admin/:id/')
    const isDashboardArea2 = useMatch('/admin')
    const { t: tStrings } = useTranslation('strings')

    const getLabel = (key: string, fallback: string) => {
        const val = tStrings(key)
        return val && !val.includes('_') ? val : fallback
    }

    const navRoutes = [
        {
            name: getLabel('overview', 'Overview'),
            path: '/admin',
            end: true,
        },
        {
            name: getLabel('location_other', 'Locations'),
            path: '/admin/locations',
        },
        {
            name: getLabel('node_other', 'Nodes'),
            path: '/admin/nodes',
        },
        {
            name: getLabel('server_other', 'Servers'),
            path: '/admin/servers',
        },
        {
            name: 'VPS Plans',
            path: '/admin/plans',
        },
        {
            name: 'User Balances',
            path: '/admin/user-balances',
        },
        {
            name: getLabel('ipam', 'IPAM'),
            path: '/admin/ipam',
        },
        {
            name: getLabel('user_other', 'Users'),
            path: '/admin/users',
        },
        {
            name: 'Coterms',
            path: '/admin/coterms',
        },
        {
            name: getLabel('token_other', 'API Tokens'),
            path: '/admin/tokens',
        },
        {
            name: 'Maintenance',
            path: '/admin/maintenance',
        },
    ]

    useEffect(() => {
        if (Boolean(isDashboardArea) || Boolean(isDashboardArea2)) {
            setRoutes(navRoutes)
        }
    }, [isDashboardArea, isDashboardArea2])

    return (
        <>
            <Outlet />
        </>
    )
}

export default AdminDashboardRouter