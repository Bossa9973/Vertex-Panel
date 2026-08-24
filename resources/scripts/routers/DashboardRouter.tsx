import { routes as serverRoutes } from '@/routers/ServerRouter'
import TransitionRouter from '@/routers/TransitionRouter'
import { lazyLoad } from '@/routers/helpers'
import { Route } from '@/routers/router'
import { lazy, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { NavigationBarContext } from '@/components/elements/navigation/NavigationBar'
import DashboardContainer from '@/components/dashboard/DashboardContainer'
import { useStoreState } from '@/state'

export const routes: Route[] = [
    {
        index: true,
        element: lazyLoad(lazy(() => import('@/routers/DashboardRouter'))),
    },
    {
        path: 'credits',
        element: lazyLoad(lazy(() => import('@/components/dashboard/CreditsContainer'))),
    },
    {
        path: 'earn',
        element: lazyLoad(lazy(() => import('@/components/dashboard/EarnBoltsContainer'))),
    },
    {
        path: 'account',
        element: lazyLoad(lazy(() => import('@/components/dashboard/AccountContainer'))),
    },
    {
        path: 'reseller',
        element: lazyLoad(lazy(() => import('@/components/reseller/ResellerHubContainer'))),
    },
    {
        path: 'pay/:uuid',
        element: lazyLoad(lazy(() => import('@/components/reseller/PublicPaymentCheckoutContainer'))),
    },
    // Pterodactyl one-click deploy page
    {
        path: 'deploy/pterodactyl',
        element: lazyLoad(lazy(() => import('@/pages/deploy/PterodactylDeployPage'))),
    },
    // Pterodactyl deploy status tracker (redirected here after order is placed)
    {
        path: 'deploy/pterodactyl/:deployId',
        element: lazyLoad(lazy(() => import('@/pages/deploy/PterodactylStatusPage'))),
    },
    ...serverRoutes,
]


const DashboardRouter = () => {
    const { setRoutes } = useContext(NavigationBarContext)
    const { t: tStrings } = useTranslation('strings')
    const user = useStoreState(s => s.user.data)
    const isReseller = Boolean(user?.is_reseller || user?.rootAdmin || user?.root_admin)

    useEffect(() => {
        const navRoutes = [
            {
                name: 'Dashboard',
                path: '/',
                end: true,
            },
            {
                name: 'Billing & BOLTs',
                path: '/credits',
            },
            {
                name: 'Earn BOLTs',
                path: '/earn',
            },
            ...(isReseller ? [
                {
                    name: 'Reseller Hub',
                    path: '/reseller',
                },
            ] : []),
        ]

        setRoutes(navRoutes)
    }, [isReseller])

    return (
        <>
            <TransitionRouter>
                <DashboardContainer />
            </TransitionRouter>
        </>
    )
}

export default DashboardRouter