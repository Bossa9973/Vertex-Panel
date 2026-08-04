import React from 'react'

export const GlobalBackground: React.FC = () => {
    return (
        <div className='fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-[#0d0d0f]'>
            {/* Single Subtle Radial Gradient Bloom (muted blue-violet, ~8% opacity) anchored top-left only */}
            <div
                className='absolute top-0 left-0 w-full h-full'
                style={{
                    background: 'radial-gradient(ellipse at 0% 0%, rgba(99, 102, 241, 0.08) 0%, rgba(13, 13, 15, 0) 65%)',
                }}
            />

            {/* Grain Texture Overlay at 3.5% Opacity */}
            <div
                className='absolute inset-0 opacity-[0.035] mix-blend-overlay'
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
            />
        </div>
    )
}

export default GlobalBackground
