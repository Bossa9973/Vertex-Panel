import router from '@/routers/router'
import { store, useStoreActions } from '@/state'
import { NavigationProgress } from '@mantine/nprogress'
import { StoreProvider } from 'easy-peasy'
import { RouterProvider } from 'react-router-dom'
import { useEffect } from 'react'
import { getCredits } from '@/api/credits'

import Spinner from '@/components/elements/Spinner'
import ThemeProvider from '@/components/ThemeProvider'

interface ExtendedWindow extends Window {
    ConvoyUser?: {
        name: string
        email: string
        credits?: number
        root_admin: boolean
        created_at: string
        updated_at: string
    }
    SiteConfiguration?: {
        version: string
    }
}

const UserBalanceFetcher = () => {
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)

    useEffect(() => {
        getCredits()
            .then(res => {
                if (typeof res.credits === 'number') {
                    updateCredits(res.credits)
                }
            })
            .catch(() => {})
    }, [updateCredits])

    return null
}

const App = () => {
    const { ConvoyUser, SiteConfiguration } = window as ExtendedWindow

    if (ConvoyUser && !store.getState().user.data) {
        store.getActions().user.setUserData({
            name: ConvoyUser.name,
            email: ConvoyUser.email,
            credits: ConvoyUser.credits ?? 0,
            rootAdmin: ConvoyUser.root_admin,
            createdAt: ConvoyUser.created_at,
            updatedAt: ConvoyUser.updated_at,
            adminPermissions: ConvoyUser.admin_permissions ?? null,
            adminRoleId: ConvoyUser.admin_role_id ?? null,
            adminRoleName: ConvoyUser.admin_role_name ?? null,
            adminRoleColor: ConvoyUser.admin_role_color ?? null,
        })
    }

    if (!store.getState().settings.data && SiteConfiguration) {
        store.getActions().settings.setSettings({
            theme:
                localStorage.theme === 'dark' ||
                (!('theme' in localStorage) &&
                    window.matchMedia('(prefers-color-scheme: dark)').matches)
                    ? 'dark'
                    : 'light',
            version: SiteConfiguration.version,
        })
    }

    return (
        <StoreProvider store={store}>
            <ThemeProvider>
                <NavigationProgress />
                <UserBalanceFetcher />
                <Spinner.Suspense>
                    <RouterProvider router={router} />
                </Spinner.Suspense>
            </ThemeProvider>
        </StoreProvider>
    )
}

export default App