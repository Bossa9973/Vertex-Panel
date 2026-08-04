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
            {/* Promo Banner */}
            <div className='lg:col-span-2 bg-[#12141A] border border-white/[0.08] rounded-2xl p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between min-h-[200px] shadow-2xl transition-all hover:border-white/[0.12]'>
                {/* Ambient Glow */}
                <div className='absolute right-0 -top-20 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none' />

                <div className='relative z-10'>
                    <span className='inline-block text-[10px] font-semibold uppercase tracking-widest text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 mb-3'>
                        SPECIAL OFFER
                    </span>
                    <div className='flex flex-wrap items-baseline gap-3'>
                        <h2 className='text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans'>
                            CLOUD INFRASTRUCTURE PROMO
                        </h2>
                        <span className='text-xl font-bold text-blue-400 font-sans'>
                            SAVE UP TO <span className='text-3xl text-white font-sans font-black'>40%</span>
                        </span>
                    </div>
                    <p className='text-xs text-slate-400 mt-2 max-w-md leading-relaxed font-sans'>
                        Scale your cloud instances with high-performance NVMe storage and dedicated gigabit network connectivity.
                    </p>
                </div>
            </div>

            {/* Refer and Earn Card */}
            <div className='bg-[#12141A] border border-white/[0.08] rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between shadow-2xl font-sans transition-all hover:border-white/[0.12]'>
                <div className='text-center relative z-10'>
                    <div className='w-10 h-10 mx-auto rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3 shadow-inner'>
                        <SparklesIcon className='w-5 h-5' />
                    </div>
                    <h3 className='text-base font-bold text-white font-sans'>Referral Program</h3>
                    <p className='text-xs text-slate-400 mt-1.5 max-w-xs mx-auto leading-relaxed font-sans'>
                        Earn 15% recurring BOLT commissions for every active user you refer to Vertex Cloud.
                    </p>
                </div>
                <button className='w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 font-medium text-xs mt-4 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer font-sans'>
                    <span>View Referral Link</span>
                    <span>&rarr;</span>
                </button>
            </div>
        </div>
    )
}

export default PromoBannersRow
