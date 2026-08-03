import React from 'react'
import boostImg from '@/assets/images/discord-boost.png'

/**
 * Discord Server Boost Icon (using Vite module asset import)
 */
export const DiscordBoostIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <img
        src={boostImg}
        alt='Discord Server Boost'
        className={`object-contain inline-block select-none ${className}`}
    />
)

export default DiscordBoostIcon
