import { useStoreActions, useStoreState } from '@/state'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'
import { useEffect } from 'react'

const ThemeSwitch = () => {
    const theme = useStoreState(state => state.settings.data!.theme)
    const setTheme = useStoreActions(actions => actions.settings.setTheme)

    useEffect(() => {
        const root = document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
    }, [theme])

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light')
    }

    return (
        <button
            type='button'
            onClick={toggleTheme}
            className='p-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-875 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-850 transition active:scale-95 cursor-pointer flex items-center justify-center'
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
            {theme === 'dark' ? (
                <SunIcon className='w-4 h-4 text-amber-400' />
            ) : (
                <MoonIcon className='w-4 h-4 text-indigo-500' />
            )}
        </button>
    )
}

export default ThemeSwitch
