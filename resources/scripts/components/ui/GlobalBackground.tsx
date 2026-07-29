import React from 'react'
import { Sparkles } from '@/components/ui/sparkles'
import { useStoreState } from '@/state'

export const GlobalBackground: React.FC = () => {
    const theme = useStoreState(state => state.settings.data?.theme)
    const isDark = theme !== 'light'

    return (
        <div className='fixed inset-0 pointer-events-none z-0 overflow-hidden select-none transition-colors duration-500 bg-slate-50 dark:bg-black'>
            {/* 1. Canvas Falling Stars / Particles Background */}
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

            {/* 2. Dual Ellipses Background Glow Layer */}
            <div className='absolute left-0 top-[-150px] w-full h-full flex flex-col items-start justify-start overflow-hidden p-0 z-0 opacity-40'>
                <div className='w-full relative'>
                    <div
                        className='absolute left-[-500px] right-[-500px] top-0 h-[1800px] flex-none rounded-full transition-all duration-500'
                        style={{
                            border: isDark ? '180px solid #3131f5' : '180px solid #38bdf8',
                            filter: 'blur(110px)',
                            WebkitFilter: 'blur(110px)',
                            opacity: isDark ? 0.2 : 0.15,
                        }}
                    />
                </div>
            </div>

            {/* 3. Radial Ambient Layer */}
            <div
                className='absolute top-0 left-0 right-0 h-full w-full z-0 transition-opacity duration-500'
                style={{
                    backgroundImage: isDark
                        ? `radial-gradient(circle at 50% 30%, rgba(32, 108, 232, 0.25) 0%, transparent 65%)`
                        : `radial-gradient(circle at 50% 20%, rgba(186, 230, 253, 0.4) 0%, transparent 70%)`,
                    mixBlendMode: isDark ? 'screen' : 'normal',
                }}
            />
        </div>
    )
}

export default GlobalBackground
