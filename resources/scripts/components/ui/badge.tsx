import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
    const variantStyles = {
        default: 'border-transparent bg-blue-600 text-white shadow hover:bg-blue-500',
        secondary: 'border-transparent bg-white/10 text-white hover:bg-white/20',
        destructive: 'border-transparent bg-rose-500/20 text-rose-300 border-rose-500/30',
        outline: 'border-white/10 text-slate-300 bg-white/5',
    }

    return (
        <div
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                variantStyles[variant],
                className
            )}
            {...props}
        />
    )
}

export { Badge }
