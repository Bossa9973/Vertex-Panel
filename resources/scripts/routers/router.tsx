import { routes as adminRoutes } from '@/routers/AdminDashboardRouter'
import { routes as clientRoutes } from '@/routers/DashboardRouter'
import { lazyLoad } from '@/routers/helpers'
import AuthenticatedRoutes from '@/routers/middleware/AuthenticatedRoutes'
import GuestRoutes from '@/routers/middleware/GuestRoutes'
import { ReactNode, lazy } from 'react'
import { Outlet, RouteObject, createBrowserRouter } from 'react-router-dom'

import { NotFound } from '@/components/elements/ScreenBlock'
import NavigationBar from '@/components/elements/navigation/NavigationBar'

import NavigationBarProvider from '@/components/NavigationBarProvider'


import GlobalBackground from '@/components/ui/GlobalBackground'
import AudioStreamPlayer from '@/components/ui/AudioStreamPlayer'

export type Route = {
    handle?: Handle
    children?: Route[]
} & Omit<RouteObject, 'handle' | 'children'>

export interface Handle {
    crumb: (data: any) => {
        to: string
        element: ReactNode
    }
}

const router = createBrowserRouter([
    {
        path: '/auth',
        element: (
            <GuestRoutes>
                <GlobalBackground />
                <div className='relative z-10 min-h-screen'>
                    <Outlet />
                </div>
            </GuestRoutes>
        ),
        children: [
            {
                path: 'login',
                element: lazyLoad(
                    lazy(() => import('@/components/auth/LoginContainer'))
                ),
            },
            {
                path: 'register',
                element: lazyLoad(
                    lazy(() => import('@/components/auth/RegisterContainer'))
                ),
            },
        ],
    },
    {
        path: '/login',
        element: (
            <GuestRoutes>
                <GlobalBackground />
                <div className='relative z-10 min-h-screen'>
                    {lazyLoad(lazy(() => import('@/components/auth/LoginContainer')))}
                </div>
            </GuestRoutes>
        ),
    },
    {
        path: '/register',
        element: (
            <GuestRoutes>
                <GlobalBackground />
                <div className='relative z-10 min-h-screen'>
                    {lazyLoad(lazy(() => import('@/components/auth/RegisterContainer')))}
                </div>
            </GuestRoutes>
        ),
    },
    {
        path: '/',
        element: (
            <AuthenticatedRoutes>
                <NavigationBarProvider>
                    <GlobalBackground />
                    <div className='relative z-10 min-h-screen text-slate-900 dark:text-stone-100 selection:bg-blue-500/30'>
                        <NavigationBar />
                        <Outlet />
                        <AudioStreamPlayer />
                    </div>
                </NavigationBarProvider>
            </AuthenticatedRoutes>
        ),
        children: [...clientRoutes, ...adminRoutes] as RouteObject[],
    },
    {
        path: '*',
        element: <NotFound full />,
    },
])

export default router