import { useStoreActions, useStoreState } from '@/state'
import { useEffect } from 'react'
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline'

const ThemeSwitch = () => {
    const theme = useStoreState(state => state.settings.data?.theme ?? 'dark')
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

    const isDark = theme === 'dark'

    return (
        <button
            type='button'
            onClick={toggleTheme}
            className='bg-neutral-800 border border-neutral-700 hover:border-neutral-600 rounded-xl p-1.5 w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer shrink-0'
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        >
            {isDark ? <MoonIcon className='w-4 h-4' /> : <SunIcon className='w-4 h-4' />}
        </button>
    )
}

export default ThemeSwitch
