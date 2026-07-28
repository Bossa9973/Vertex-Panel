import { TicketIcon, CpuChipIcon, ServerIcon, CircleStackIcon } from '@heroicons/react/24/outline'

interface Props {
    onDeploy: () => void
}

const QuickServicesGrid = ({ onDeploy }: Props) => {
    return (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
            {/* Support Tickets Card */}
            <div className='bg-[#141619] border border-stone-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between'>
                <div>
                    <div className='flex items-center justify-between mb-3'>
                        <h3 className='text-sm font-bold text-white flex items-center gap-2'>
                            <TicketIcon className='w-4 h-4 text-blue-400' /> Support Tickets
                        </h3>
                        <button className='text-[10px] font-semibold text-stone-400 hover:text-white px-2 py-1 rounded-md bg-stone-800 transition'>
                            View All
                        </button>
                    </div>
                    <div className='space-y-2 mt-3'>
                        <div className='p-3 bg-[#1c1e22] rounded-xl border border-stone-800/80 flex items-center justify-between text-xs'>
                            <span className='text-stone-200 truncate font-medium'>Server downtime issue</span>
                            <span className='px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>Open</span>
                        </div>
                        <div className='p-3 bg-[#1c1e22] rounded-xl border border-stone-800/80 flex items-center justify-between text-xs'>
                            <span className='text-stone-300 truncate font-medium'>Billing - incorrect charge</span>
                            <span className='px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-800 text-stone-400 border border-stone-700'>Closed</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cloud Server Quick Deploy */}
            <div className='bg-[#141619] border border-stone-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-blue-500/40 transition group'>
                <div>
                    <CpuChipIcon className='w-7 h-7 text-blue-400 mb-2' />
                    <h3 className='text-sm font-bold text-white'>Cloud Server</h3>
                    <p className='text-xs text-stone-400 mt-1 leading-relaxed'>
                        Scalable virtual machines in different datacenter locations.
                    </p>
                </div>
                <button
                    onClick={onDeploy}
                    className='mt-4 text-xs font-bold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 cursor-pointer transition bg-transparent border-0 p-0 shadow-none w-fit'
                >
                    Deploy Cloud Server &rarr;
                </button>
            </div>

            {/* Dedicated Server Quick Deploy */}
            <div className='bg-[#141619] border border-stone-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-indigo-500/40 transition group'>
                <div>
                    <ServerIcon className='w-7 h-7 text-indigo-400 mb-2' />
                    <h3 className='text-sm font-bold text-white'>Dedicated Server</h3>
                    <p className='text-xs text-stone-400 mt-1 leading-relaxed'>
                        Offers superior performance, control, and security for hosting.
                    </p>
                </div>
                <button
                    onClick={onDeploy}
                    className='mt-4 text-xs font-bold text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 cursor-pointer transition bg-transparent border-0 p-0 shadow-none w-fit'
                >
                    Deploy Dedicated &rarr;
                </button>
            </div>

            {/* Storage Server Quick Deploy */}
            <div className='bg-[#141619] border border-stone-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-emerald-500/40 transition group'>
                <div>
                    <CircleStackIcon className='w-7 h-7 text-emerald-400 mb-2' />
                    <h3 className='text-sm font-bold text-white'>Storage Server</h3>
                    <p className='text-xs text-stone-400 mt-1 leading-relaxed'>
                        Provides secure, scalable storage for large data management.
                    </p>
                </div>
                <button
                    onClick={onDeploy}
                    className='mt-4 text-xs font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer transition bg-transparent border-0 p-0 shadow-none w-fit'
                >
                    Deploy Storage &rarr;
                </button>
            </div>
        </div>
    )
}

export default QuickServicesGrid
