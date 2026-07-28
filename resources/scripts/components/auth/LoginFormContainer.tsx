import { useStoreActions, useStoreState } from '@/state'
import { MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { LoadingOverlay, Switch } from '@mantine/core'
import { ReactNode, useEffect } from 'react'
import Logo from '@/components/elements/Logo'

import FlashMessageRender from '@/components/elements/FlashMessageRenderer'

interface Props {
    title: string
    description: string
    children?: ReactNode
    submitting?: boolean
}

const LoginFormContainer = ({
    title,
    description,
    children,
    submitting,
}: Props) => {
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

    return (
        <div className='min-h-screen flex flex-col sm:justify-center items-center py-10 px-4 bg-gray-100 dark:bg-[#0b0c0e] text-foreground transition-colors duration-200'>
            <div className='w-full sm:max-w-md'>
                <div className='flex justify-center items-center gap-2.5 mb-6'>
                    <Logo className='w-9 h-9 text-accent-500' />
                    <span className='text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white'>
                        Convoy
                    </span>
                </div>

                <FlashMessageRender
                    key={'auth:sign_in'}
                    className='px-1 mb-4'
                />
                <FlashMessageRender
                    key={'auth:sign_up'}
                    className='px-1 mb-4'
                />

                <div className='p-6 sm:p-8 bg-white dark:bg-[#141619] border border-gray-200 dark:border-gray-800 shadow-xl rounded-2xl relative overflow-hidden transition-colors duration-200'>
                    <LoadingOverlay visible={submitting || false} radius='md' />
                    <h1 className='text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight'>
                        {title}
                    </h1>
                    <p className='text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed'>
                        {description}
                    </p>
                    <div className='mt-4'>{children}</div>
                </div>

                <div className='flex justify-between items-center px-2 py-4 w-full text-xs text-gray-500 dark:text-gray-400'>
                    <p>
                        &copy; 2020 - {new Date().getFullYear()}{' '}
                        <a href='https://performave.com' target='_blank' rel='noreferrer' className='hover:text-accent-500 transition font-medium'>
                            Performave
                        </a>
                    </p>
                    <div className='flex items-center gap-2'>
                        <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400'>Theme</span>
                        <Switch
                            size='sm'
                            checked={theme === 'dark'}
                            onChange={() =>
                                setTheme(theme === 'light' ? 'dark' : 'light')
                            }
                            onLabel={<MoonIcon className='w-3.5 h-3.5 text-amber-300' />}
                            offLabel={<SunIcon className='w-3.5 h-3.5 text-amber-500' />}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default LoginFormContainer
