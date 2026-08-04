import React, { useEffect, useState } from 'react'
import { SparklesIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import http from '@/api/http'

const PromoBannersRow = () => {
    const [enabled, setEnabled] = useState<boolean | null>(null)

    useEffect(() => {
        http.get('/api/announcement-status')
            .then(res => {
                if (res.data?.data?.enabled !== undefined) {
                    setEnabled(res.data.data.enabled)
                } else {
                    setEnabled(true)
                }
            })
            .catch(() => setEnabled(true))
    }, [])

    if (enabled === false) {
        return null
    }

    return (
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 font-sans'>
            {/* Promo Sale Banner */}
            <div className='lg:col-span-2 bg-[#0c0f18] border border-blue-500/20 rounded-2xl p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between min-h-[220px] shadow-2xl'>
                {/* Glowing Blue Globe / Mesh Accent */}
                <div className='absolute right-10 -top-16 w-80 h-80 bg-blue-600/25 rounded-full blur-3xl pointer-events-none' />
                <div className='absolute inset-0 bg-[linear-gradient(to_right,#1f293d15_1px,transparent_1px),linear-gradient(to_bottom,#1f293d15_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none' />

                {/* Arrow Controls */}
                <button className='absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-stone-900/60 hover:bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center border border-stone-700/50 transition cursor-pointer z-10'>
                    <ChevronLeftIcon className='w-4 h-4' />
                </button>
                <button className='absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-stone-900/60 hover:bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center border border-stone-700/50 transition cursor-pointer z-10'>
                    <ChevronRightIcon className='w-4 h-4' />
                </button>

                <div className='relative z-10 pl-8 pr-8'>
                    <span className='inline-block text-[10px] font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 mb-3'>
                        BIG SALE
                    </span>
                    <div className='flex flex-wrap items-baseline gap-4'>
                        <h2 className='text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase font-sans'>
                            BLACK FRIDAY
                        </h2>
                        <span className='text-2xl font-black text-blue-400 font-sans'>
                            UP TO <span className='text-4xl text-white font-sans'>40%</span> OFF
                        </span>
                    </div>
                    <p className='text-xs text-stone-300 mt-2 max-w-md leading-relaxed font-sans'>
                        Get up to 40% Discount and take your Social Network and cloud VPS to the next level.
                    </p>
                </div>

                {/* Pagination Dots */}
                <div className='flex items-center justify-center gap-2 mt-6 relative z-10'>
                    <span className='w-2.5 h-2.5 rounded-full bg-blue-500' />
                    <span className='w-2 h-2 rounded-full bg-stone-700' />
                    <span className='w-2 h-2 rounded-full bg-stone-700' />
                    <span className='w-2 h-2 rounded-full bg-stone-700' />
                </div>
            </div>

            {/* Refer and Earn Card */}
            <div className='bg-gradient-to-b from-[#18233c] to-[#0f1422] border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between shadow-2xl font-sans'>
                <div className='text-center relative z-10'>
                    <div className='w-12 h-12 mx-auto rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 mb-3 shadow-inner'>
                        <SparklesIcon className='w-6 h-6' />
                    </div>
                    <h3 className='text-base font-bold text-white font-sans'>Refer and Earn</h3>
                    <p className='text-xs text-stone-300 mt-1.5 max-w-xs mx-auto leading-relaxed font-sans'>
                        Referring clients to Vertex Cloud and earn 15% commission on successful sales.
                    </p>
                </div>
                <button className='w-full py-2.5 rounded-xl bg-[#1c263c] hover:bg-[#25324e] border border-blue-400/20 text-white font-bold text-xs mt-4 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer shadow-md font-sans'>
                    Refer Now &rarr;
                </button>
            </div>
        </div>
    )
}

export default PromoBannersRow
