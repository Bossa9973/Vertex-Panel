"use client"

import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IoMdCheckmark as RawIoMdCheckmark } from 'react-icons/io'
import { LuLoader as RawLuLoader } from 'react-icons/lu'

const IoMdCheckmark = RawIoMdCheckmark as React.FC<any>
const LuLoader = RawLuLoader as React.FC<any>

export interface StepItem {
    id: string
    title: string
}

interface OnboardCardProps {
    duration?: number
    steps?: StepItem[]
    currentStep?: number
    isCompletedAll?: boolean
}

const defaultSteps: StepItem[] = [
    { id: 'validate', title: '1. Validating Order & Authorizing Credits' },
    { id: 'build', title: '2. Cloning System Template' },
    { id: 'vm_create', title: '3. Allocating Hypervisor Storage' },
    { id: 'sync', title: '4. Syncing Network & Hardware Specs' },
    { id: 'cloud_init', title: '5. Injecting Cloud-Init Credentials' },
    { id: 'power_on', title: '6. Auto-Booting Server Instance' },
]

const OnboardCard = ({
    duration = 2500,
    steps = defaultSteps,
    currentStep = 0,
    isCompletedAll = false,
}: OnboardCardProps) => {
    const [progress, setProgress] = useState(0)
    const [animateKey, setAnimateKey] = useState(0)

    const activeStepIndex = isCompletedAll ? steps.length : currentStep

    useEffect(() => {
        if (isCompletedAll) return

        setProgress(0)
        const forwardTimer = setTimeout(() => setProgress(100), 50)
        setAnimateKey((k) => k + 1)

        return () => clearTimeout(forwardTimer)
    }, [currentStep, isCompletedAll])

    const isAllDone = isCompletedAll || activeStepIndex >= steps.length

    // Center 3 visible cards window on active step
    let visibleStartIndex = 0
    if (isAllDone) {
        visibleStartIndex = Math.max(0, steps.length - 3)
    } else if (activeStepIndex === 0) {
        visibleStartIndex = 0
    } else {
        visibleStartIndex = Math.min(activeStepIndex - 1, Math.max(0, steps.length - 3))
    }

    const visibleSteps = steps.slice(visibleStartIndex, visibleStartIndex + 3)

    return (
        <div
            className={cn(
                'relative flex flex-col items-center justify-center gap-1.5 p-1 overflow-hidden min-h-[190px] w-full max-w-[380px] mx-auto'
            )}
        >
            <AnimatePresence mode='popLayout'>
                {visibleSteps.map((stepItem) => {
                    const actualIndex = steps.findIndex((s) => s.id === stepItem.id)
                    const isCompleted = isAllDone || actualIndex < activeStepIndex
                    const isActive = !isAllDone && actualIndex === activeStepIndex

                    return (
                        <motion.div
                            key={stepItem.id}
                            layout
                            initial={{ opacity: 0, y: 20, scale: 0.88 }}
                            animate={{
                                opacity: isActive ? 1 : 0.75,
                                scale: isActive ? 1 : 0.9,
                                y: 0,
                            }}
                            exit={{ opacity: 0, y: -20, scale: 0.88 }}
                            transition={{ duration: 0.45, ease: 'easeInOut' }}
                            className={cn(
                                'flex min-w-[260px] sm:min-w-[340px] w-full flex-col justify-center gap-2 rounded-xl border py-2.5 pl-3.5 pr-8 transition-all duration-300 backdrop-blur-md',
                                isActive
                                    ? 'scale-100 opacity-100 border-blue-500/50 bg-gradient-to-br from-neutral-900/90 via-blue-950/40 to-neutral-950/90 shadow-lg shadow-blue-950/50 ring-1 ring-blue-500/40'
                                    : 'scale-[0.9] opacity-75 border-neutral-800/80 bg-neutral-900/40'
                            )}
                        >
                            <div className='flex items-center justify-start gap-2 text-xs text-primary font-medium'>
                                {isCompleted ? (
                                    <div className='relative shrink-0 flex items-center justify-center'>
                                        <svg width='20' height='20'>
                                            <circle cx='10' cy='10' r='5' fill='#22c55e' />
                                        </svg>
                                        <div className='absolute inset-0 flex items-center justify-center text-white'>
                                            <IoMdCheckmark className='h-2.5 w-2.5' />
                                        </div>
                                    </div>
                                ) : isActive ? (
                                    <div className='animate-spin text-blue-400 shrink-0'>
                                        <LuLoader className='h-4 w-4' />
                                    </div>
                                ) : (
                                    <div className='text-neutral-500 shrink-0 opacity-60'>
                                        <LuLoader className='h-4 w-4' />
                                    </div>
                                )}
                                <div
                                    className={cn(
                                        'truncate',
                                        isActive ? 'text-white font-bold' : isCompleted ? 'text-emerald-400 font-semibold' : 'text-neutral-400'
                                    )}
                                >
                                    {stepItem.title}
                                </div>
                            </div>

                            <div className='ml-5 h-1.5 w-[calc(100%-1.25rem)] overflow-hidden rounded-full bg-neutral-800/90'>
                                {isCompleted ? (
                                    <div className='h-full w-full bg-emerald-500' />
                                ) : isActive ? (
                                    <motion.div
                                        key={animateKey}
                                        className='h-full bg-gradient-to-r from-blue-500 to-emerald-400'
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: duration / 1000, ease: 'easeInOut' }}
                                    />
                                ) : null}
                            </div>
                        </motion.div>
                    )
                })}
            </AnimatePresence>

            {/* Liquid Glass Depth Fades */}
            <div className='pointer-events-none absolute top-0 h-8 w-full bg-gradient-to-b from-blue-950/40 to-transparent' />
            <div className='pointer-events-none absolute bottom-0 h-8 w-full bg-gradient-to-t from-blue-950/40 to-transparent' />
        </div>
    )
}

export default OnboardCard
