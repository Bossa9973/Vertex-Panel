import React from 'react'
import { Sparkles } from '@/components/ui/sparkles'
import { useStoreState } from '@/state'

export const GlobalBackground: React.FC = () => {
    const theme = useStoreState(state => state.settings.data?.theme)
    const isDark = theme !== 'light'

    return (
        <div className='fixed inset-0 pointer-events-none z-0 overflow-hidden select-none transition-colors duration-500 bg-slate-50 dark:bg-black'>
            {/* 1. Canvas Star Particles Background (Keeping Star Particles) */}
            <div className='absolute inset-0 w-full h-full [mask-image:radial-gradient(75%_75%_at_50%_40%,white,transparent)] z-0'>
                <Sparkles
                    id='global-star-sparkles'
                    density={1400}
                    direction='bottom'
                    speed={0.8}
                    color={isDark ? '#FFFFFF' : '#3b82f6'}
                    className='w-full h-full'
                />
            </div>
        </div>
    )
}

export default GlobalBackground
