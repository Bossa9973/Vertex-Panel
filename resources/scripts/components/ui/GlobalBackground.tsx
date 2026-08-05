import React from 'react'
import { Sparkles as SparklesComp } from '@/components/ui/sparkles'

export const GlobalBackground: React.FC = () => {
    return (
        <div className='fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-[#0a0a0f]'>
            {/* 1. Sparkles / Snowflakes Top Layer */}
            <div className='absolute top-0 left-0 right-0 h-[600px] w-full overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] pointer-events-none z-0 [filter:drop-shadow(0_0_5px_rgba(34,197,94,0.8))]'>
                <SparklesComp
                    id='global-space-sparkles'
                    density={1800}
                    direction='bottom'
                    speed={1}
                    color={['#22c55e', '#10b981', '#4ade80', '#86efac']}
                    className='absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]'
                />
            </div>

            {/* 2. Dual Ellipses Background Glow Layer */}
            <div className='absolute left-0 top-[-114px] w-full h-full flex flex-col items-start justify-start overflow-hidden p-0 z-0 pointer-events-none'>
                <div className='w-full'>
                    <div
                        className='absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full'
                        style={{
                            border: '200px solid #3131f5',
                            filter: 'blur(92px)',
                            WebkitFilter: 'blur(92px)',
                            opacity: 0.25,
                        }}
                    />
                </div>
            </div>

            {/* 3. Radial Gradient Multiply Background Layer */}
            <div
                className='absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none'
                style={{
                    backgroundImage: `radial-gradient(circle at center, #206ce8 0%, transparent 70%)`,
                    opacity: 0.5,
                    mixBlendMode: 'multiply',
                }}
            />
        </div>
    )
}

export default GlobalBackground
