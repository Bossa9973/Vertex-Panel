import { TicketIcon, CpuChipIcon, ServerIcon, CircleStackIcon } from '@heroicons/react/24/outline'

interface Props {
    onDeploy: () => void
}

const QuickServicesGrid = ({ onDeploy }: Props) => {
    const cardClassName = 'bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-white/[0.06] rounded-2xl p-5 shadow-[0px_0px_60px_-20px_rgba(9,0,255,0.2)] flex flex-col justify-between font-sans'

    return (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
            {/* Support Tickets Card */}
            <div className={cardClassName}>
                <div>
                    <div className='flex items-center justify-between mb-3'>
                        <h3 className='text-sm font-bold text-white flex items-center gap-2'>
                            <TicketIcon className='w-4 h-4 text-blue-400' /> Support Tickets
                        </h3>
                        <button className='border border-neutral-700 rounded-lg text-xs text-gray-400 hover:text-white hover:border-neutral-500 px-3 py-1 bg-neutral-900 transition-all cursor-pointer font-bold'>
                            View All
                        </button>
                    </div>
                    <div className='space-y-2 mt-3'>
                        <div className='p-3 bg-neutral-950/60 rounded-xl border border-neutral-800 flex items-center justify-between text-xs'>
                            <span className='text-gray-200 truncate font-medium'>Server downtime issue</span>
                            <span className='bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[9px] px-1.5 py-0.5 font-semibold uppercase font-mono'>Open</span>
                        </div>
                        <div className='p-3 bg-neutral-950/60 rounded-xl border border-neutral-800 flex items-center justify-between text-xs'>
                            <span className='text-gray-400 truncate font-medium'>Billing - incorrect charge</span>
                            <span className='bg-neutral-700/50 text-gray-400 border border-neutral-700 rounded-full text-[9px] px-1.5 py-0.5 font-semibold uppercase font-mono'>Closed</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cloud Server Quick Deploy */}
            <div className={`${cardClassName} hover:border-blue-500/40 transition group`}>
                <div>
                    <CpuChipIcon className='w-7 h-7 text-blue-400 mb-2' />
                    <h3 className='text-sm font-bold text-white'>Cloud Server</h3>
                    <p className='text-xs text-gray-400 mt-1 leading-relaxed'>
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
            <div className={`${cardClassName} hover:border-indigo-500/40 transition group`}>
                <div>
                    <ServerIcon className='w-7 h-7 text-indigo-400 mb-2' />
                    <h3 className='text-sm font-bold text-white'>Dedicated Server</h3>
                    <p className='text-xs text-gray-400 mt-1 leading-relaxed'>
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
            <div className={`${cardClassName} hover:border-emerald-500/40 transition group`}>
                <div>
                    <CircleStackIcon className='w-7 h-7 text-emerald-400 mb-2' />
                    <h3 className='text-sm font-bold text-white'>Storage Server</h3>
                    <p className='text-xs text-gray-400 mt-1 leading-relaxed'>
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
