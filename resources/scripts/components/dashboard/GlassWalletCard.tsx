import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
    ArrowDownLeft,
    ArrowUpRight,
    CreditCard,
    TrendingUp,
    ShieldCheck,
} from 'lucide-react'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import { useNavigate } from 'react-router-dom'

export interface GlassWalletCardProps {
    balance?: string | number
    currency?: string
    address?: string
    trend?: string
    trendUp?: boolean
    cardHolder?: string
    expiry?: string
    cardNumber?: string
    onTopUp?: () => void
    onEarn?: () => void
    className?: string
}

export function GlassWalletCard({
    balance = '0.00',
    currency = 'BOLTs',
    address = 'Account Active',
    trend = 'Active',
    trendUp = true,
    cardHolder = 'Account User',
    expiry = 'Instant',
    cardNumber = '•••• •••• •••• 4242',
    onTopUp,
    onEarn,
    className,
}: GlassWalletCardProps) {
    const navigate = useNavigate()

    const formattedBalance =
        typeof balance === 'number'
            ? balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : balance

    const handlePrimaryClick = () => {
        if (onTopUp) {
            onTopUp()
        } else {
            navigate('/credits')
        }
    }

    const handleSecondaryClick = () => {
        if (onEarn) {
            onEarn()
        } else {
            navigate('/earn')
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn('w-full max-w-[420px]', className)}
        >
            <Card className='group relative h-56 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 via-blue-950/40 to-neutral-950/90 backdrop-blur-xl shadow-2xl transition-all duration-300 hover:border-blue-500/40 hover:shadow-blue-500/10'>
                {/* Abstract Background Glow Shapes */}
                <div className='absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-600/15 blur-3xl transition-all duration-500 group-hover:bg-blue-600/25' />
                <div className='absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl transition-all duration-500 group-hover:bg-amber-500/20' />

                <div className='relative flex h-full flex-col justify-between p-6 z-10'>
                    {/* Header */}
                    <div className='flex items-start justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 backdrop-blur-sm shadow-sm'>
                                <BoltSvgIcon className='h-5 w-5 text-amber-400' />
                            </div>
                            <div>
                                <p className='text-xs font-medium text-slate-400 font-sans uppercase tracking-wider'>
                                    Available Balance
                                </p>
                                <div className='flex items-baseline gap-1.5 mt-0.5'>
                                    <h3 className='text-2xl font-bold tracking-tight text-white font-mono'>
                                        {formattedBalance}
                                    </h3>
                                    <span className='text-xs font-bold text-amber-400 font-sans'>
                                        {currency}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <Badge
                            variant='outline'
                            className={cn(
                                'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 backdrop-blur-sm flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5',
                                !trendUp && 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                            )}
                        >
                            <ShieldCheck className='h-3.5 w-3.5' />
                            {trend}
                        </Badge>
                    </div>

                    {/* Card Details */}
                    <div className='space-y-3 pt-2'>
                        <div className='flex items-center justify-between text-xs'>
                            <div className='flex items-center gap-2 text-slate-400 font-sans'>
                                <CreditCard className='h-4 w-4 text-blue-400' />
                                <span>{cardNumber}</span>
                            </div>
                            <span className='font-sans text-xs font-medium text-slate-400'>
                                Billing: {expiry}
                            </span>
                        </div>

                        <div className='flex items-center justify-between pt-1'>
                            <span className='text-sm font-bold text-white tracking-tight truncate max-w-[180px]'>
                                {cardHolder}
                            </span>
                            <span className='rounded-full bg-white/10 px-3 py-1 font-sans text-xs font-semibold text-stone-200 backdrop-blur-sm border border-white/10'>
                                {address}
                            </span>
                        </div>
                    </div>

                    {/* Hover Actions Overlay */}
                    <div className='absolute inset-0 flex items-center justify-center gap-8 bg-blue-950/30 backdrop-blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-2xl z-20'>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handlePrimaryClick}
                            className='bg-transparent border-none p-0 outline-none flex flex-col items-center gap-2 cursor-pointer group/btn shadow-none focus:outline-none'
                        >
                            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)] border border-blue-400/50 group-hover/btn:bg-blue-500 transition-all'>
                                <ArrowUpRight className='h-6 w-6' />
                            </div>
                            <span className='text-xs font-bold text-white font-sans bg-transparent tracking-wide drop-shadow-md'>Top Up</span>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSecondaryClick}
                            className='bg-transparent border-none p-0 outline-none flex flex-col items-center gap-2 cursor-pointer group/btn shadow-none focus:outline-none'
                        >
                            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] border border-amber-400/50 group-hover/btn:bg-amber-400 transition-all'>
                                <ArrowDownLeft className='h-6 w-6' />
                            </div>
                            <span className='text-xs font-bold text-white font-sans bg-transparent tracking-wide drop-shadow-md'>Earn Free</span>
                        </motion.button>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

export default GlassWalletCard
