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
import { Link, Outlet, useMatch, Navigate } from 'react-router-dom'
import { useStoreState } from '@/state'

import ContentContainer from '@/components/elements/ContentContainer'
import { NavigationBarContext } from '@/components/elements/navigation/NavigationBar'

// ─── Permission Helpers & Guards ─────────────────────────────────────────────

export function getFirstAllowedAdminPath(user: any): string {
    if (!user) return '/admin/roles'

    const isCeo = user.email === 'ceo@vertexnodes.top'
    const permissions = user.adminPermissions ?? null

    // CEO or null permissions = full access
    if (isCeo || permissions === null) {
        return '/admin'
    }

    const hasPerm = (perm: string) => Array.isArray(permissions) && permissions.includes(perm)

    if (hasPerm('view_overview')) return '/admin'
    if (hasPerm('view_locations')) return '/admin/locations'
    if (hasPerm('view_nodes')) return '/admin/nodes'
    if (hasPerm('view_servers')) return '/admin/servers'
    if (hasPerm('view_plans')) return '/admin/plans'
    if (hasPerm('manage_balances')) return '/admin/user-balances'
    if (hasPerm('view_ipam')) return '/admin/ipam'
    if (hasPerm('view_users')) return '/admin/users'
    if (hasPerm('view_coterms')) return '/admin/coterms'
    if (hasPerm('view_tokens')) return '/admin/tokens'
    if (hasPerm('view_audit_logs')) return '/admin/audit'
    if (hasPerm('view_maintenance')) return '/admin/maintenance'

    return '/admin/roles'
}

export function RequireAdminPermission({ perm, children }: { perm?: string; children: React.ReactNode }) {
    const user = useStoreState(s => s.user.data)
    const isCeo = user?.email === 'ceo@vertexnodes.top'
    const permissions = user?.adminPermissions ?? null

    if (!perm || isCeo || permissions === null) {
        return <>{children}</>
    }

    const hasPerm = Array.isArray(permissions) && permissions.includes(perm)
    if (!hasPerm) {
        const allowedPath = getFirstAllowedAdminPath(user)
        return <Navigate to={allowedPath} replace />
    }

    return <>{children}</>
}

function wrapRoutesWithPerm(routesList: Route[], perm: string): Route[] {
    return routesList.map(r => ({
        ...r,
        element: r.element ? <RequireAdminPermission perm={perm}>{r.element}</RequireAdminPermission> : r.element,
        ...(r.children ? { children: wrapRoutesWithPerm(r.children, perm) } : {}),
    }))
}

const OverviewComponent = lazy(() => import('@/components/admin/overview/OverviewContainer'))
const OverviewRouteWrapper = () => {
    const user = useStoreState(s => s.user.data)
    const isCeo = user?.email === 'ceo@vertexnodes.top'
    const permissions = user?.adminPermissions ?? null

    const hasOverview = isCeo || permissions === null || (Array.isArray(permissions) && permissions.includes('view_overview'))

    if (!hasOverview) {
        const fallback = getFirstAllowedAdminPath(user)
        return <Navigate to={fallback} replace />
    }

    return lazyLoad(OverviewComponent)
}

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
                element: <OverviewRouteWrapper />,
            },
            {
                path: 'locations',
                element: (
                    <RequireAdminPermission perm='view_locations'>
                        {lazyLoad(lazy(() => import('@/components/admin/locations/LocationsContainer')))}
                    </RequireAdminPermission>
                ),
            },
            ...wrapRoutesWithPerm(adminNodeRoutes, 'view_nodes'),
            ...wrapRoutesWithPerm(adminServerRoutes, 'view_servers'),
            ...wrapRoutesWithPerm(adminIpamRoutes, 'view_ipam'),
            ...wrapRoutesWithPerm(adminUserRoutes, 'view_users'),
            ...wrapRoutesWithPerm(adminCotermRoutes, 'view_coterms'),
            {
                path: 'plans',
                element: (
                    <RequireAdminPermission perm='view_plans'>
                        {lazyLoad(lazy(() => import('@/components/admin/plans/AdminVpsPlansContainer')))}
                    </RequireAdminPermission>
                ),
            },
            {
                path: 'user-balances',
                element: (
                    <RequireAdminPermission perm='manage_balances'>
                        {lazyLoad(lazy(() => import('@/components/admin/users/AdminUserBalanceContainer')))}
                    </RequireAdminPermission>
                ),
            },
            {
                path: 'tokens',
                element: (
                    <RequireAdminPermission perm='view_tokens'>
                        {lazyLoad(lazy(() => import('@/components/admin/tokens/TokensContainer')))}
                    </RequireAdminPermission>
                ),
            },
            {
                path: 'audit',
                element: (
                    <RequireAdminPermission perm='view_audit_logs'>
                        {lazyLoad(lazy(() => import('@/components/admin/audit/AdminAuditContainer')))}
                    </RequireAdminPermission>
                ),
            },
            {
                path: 'maintenance',
                element: (
                    <RequireAdminPermission perm='view_maintenance'>
                        {lazyLoad(lazy(() => import('@/components/admin/maintenance/AdminMaintenanceContainer')))}
                    </RequireAdminPermission>
                ),
            },
            {
                path: 'roles',
                element: lazyLoad(lazy(() => import('@/components/admin/roles/AdminRolesContainer'))),
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
    const isDashboardArea = useMatch('/admin/*')
    const isDashboardArea2 = useMatch('/admin')
    const { t: tStrings } = useTranslation('strings')
    const user = useStoreState(s => s.user.data)

    /** null = full access (CEO/no-role), array = restricted */
    const adminPermissions = user?.adminPermissions ?? null
    const isCeo = user?.email === 'ceo@vertexnodes.top'

    const hasPerm = (perm: string) => isCeo || adminPermissions === null || (Array.isArray(adminPermissions) && adminPermissions.includes(perm))

    const getLabel = (key: string, fallback: string) => {
        const val = tStrings(key)
        return val && !val.includes('_') ? val : fallback
    }

    const navRoutes = [
        ...(hasPerm('view_overview') ? [{ name: getLabel('overview', 'Overview'), path: '/admin', end: true }] : []),
        ...(hasPerm('view_locations') ? [{ name: getLabel('location_other', 'Locations'), path: '/admin/locations' }] : []),
        ...(hasPerm('view_nodes') ? [{ name: getLabel('node_other', 'Nodes'), path: '/admin/nodes' }] : []),
        ...(hasPerm('view_servers') ? [{ name: getLabel('server_other', 'Servers'), path: '/admin/servers' }] : []),
        ...(hasPerm('view_plans') ? [{ name: 'VPS Plans', path: '/admin/plans' }] : []),
        ...(hasPerm('manage_balances') ? [{ name: 'User Balances', path: '/admin/user-balances' }] : []),
        ...(hasPerm('view_ipam') ? [{ name: getLabel('ipam', 'IPAM'), path: '/admin/ipam' }] : []),
        ...(hasPerm('view_users') ? [{ name: getLabel('user_other', 'Users'), path: '/admin/users' }] : []),
        ...(hasPerm('view_coterms') ? [{ name: 'Coterms', path: '/admin/coterms' }] : []),
        ...(hasPerm('view_tokens') ? [{ name: getLabel('token_other', 'API Tokens'), path: '/admin/tokens' }] : []),
        ...(hasPerm('view_audit_logs') ? [{ name: '📋 Audit Logs', path: '/admin/audit' }] : []),
        ...(hasPerm('view_maintenance') ? [{ name: 'Maintenance', path: '/admin/maintenance' }] : []),
        { name: '🛡 Roles', path: '/admin/roles' },
    ]

    useEffect(() => {
        if (Boolean(isDashboardArea) || Boolean(isDashboardArea2)) {
            setRoutes(navRoutes)
        }
    }, [isDashboardArea, isDashboardArea2, adminPermissions])

    return (
        <>
            <Outlet />
        </>
    )
}

export default AdminDashboardRouter