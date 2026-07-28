import { routes as serverRoutes } from '@/routers/ServerRouter'
import TransitionRouter from '@/routers/TransitionRouter'
import { lazyLoad } from '@/routers/helpers'
import { Route } from '@/routers/router'
import { lazy, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { NavigationBarContext } from '@/components/elements/navigation/NavigationBar'

import DashboardContainer from '@/components/dashboard/DashboardContainer'


export const routes: Route[] = [
    {
        index: true,
        element: lazyLoad(lazy(() => import('@/routers/DashboardRouter'))),
    },
    {
        path: 'credits',
        element: lazyLoad(lazy(() => import('@/components/dashboard/CreditsContainer'))),
    },
    ...serverRoutes,
]

const DashboardRouter = () => {
    const { setRoutes } = useContext(NavigationBarContext)
    const { t: tStrings } = useTranslation('strings')

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
    ]

    useEffect(() => {
        setRoutes(navRoutes)
    }, [])

    return (
        <>
            <TransitionRouter>
                <DashboardContainer />
            </TransitionRouter>
        </>
    )
}

export default DashboardRouter