import React from 'react'
import { useStoreState } from '@/state'

export const GlobalBackground: React.FC = () => {
    const theme = useStoreState(state => state.settings.data?.theme)
    const isDark = theme !== 'light'

    return (
        <div className='fixed inset-0 pointer-events-none z-0 overflow-hidden select-none transition-colors duration-500 bg-slate-50 dark:bg-[#08090C]'>
            {/* Subtle Ambient Radial Lighting for Dark Canvas Depth */}
            {isDark && (
                <>
                    <div className='absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-blue-600/[0.04] via-indigo-600/[0.02] to-transparent rounded-full blur-3xl pointer-events-none' />
                    <div className='absolute bottom-0 right-0 w-[600px] h-[400px] bg-gradient-to-tl from-purple-600/[0.02] to-transparent rounded-full blur-3xl pointer-events-none' />
                </>
            )}
        </div>
    )
}

export default GlobalBackground
