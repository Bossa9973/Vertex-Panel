import { TicketIcon, CpuChipIcon, ServerIcon, CircleStackIcon } from '@heroicons/react/24/outline'

interface Props {
    onDeploy: () => void
}

const QuickServicesGrid = ({ onDeploy }: Props) => {
    return (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 font-sans'>
            {/* Support Tickets Card */}
            <div className='bg-[#12141A] border border-white/[0.08] rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all hover:border-white/[0.12]'>
                <div>
                    <div className='flex items-center justify-between mb-3'>
                        <h3 className='text-sm font-semibold text-white flex items-center gap-2 font-sans'>
                            <TicketIcon className='w-4 h-4 text-blue-400' /> Support Tickets
                        </h3>
                        <span className='text-[10px] font-semibold text-slate-400 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]'>
                            Active
                        </span>
                    </div>
                    <div className='space-y-2 mt-3'>
                        <div className='p-2.5 bg-white/[0.02] rounded-xl border border-white/[0.06] flex items-center justify-between text-xs'>
                            <span className='text-slate-300 truncate font-medium'>Server provisioning check</span>
                            <span className='px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>Open</span>
                        </div>
                        <div className='p-2.5 bg-white/[0.02] rounded-xl border border-white/[0.06] flex items-center justify-between text-xs'>
                            <span className='text-slate-400 truncate font-medium'>Billing inquiry</span>
                            <span className='px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.04] text-slate-400 border border-white/[0.08]'>Closed</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cloud Server Quick Deploy */}
            <div className='bg-[#12141A] border border-white/[0.08] rounded-2xl p-5 shadow-2xl flex flex-col justify-between hover:border-blue-500/30 transition-all group'>
                <div>
                    <CpuChipIcon className='w-6 h-6 text-blue-400 mb-2' />
                    <h3 className='text-sm font-semibold text-white font-sans'>Cloud VPS</h3>
                    <p className='text-xs text-slate-400 mt-1 leading-relaxed font-sans'>
                        Scalable virtual machines provisioned with instant deployment.
                    </p>
                </div>
                <button
                    onClick={onDeploy}
                    className='mt-4 text-xs font-medium text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 cursor-pointer transition bg-transparent border-0 p-0 shadow-none w-fit font-sans group-hover:translate-x-0.5'
                >
                    <span>Deploy Cloud VPS</span>
                    <span>&rarr;</span>
                </button>
            </div>

            {/* Dedicated Server Quick Deploy */}
            <div className='bg-[#12141A] border border-white/[0.08] rounded-2xl p-5 shadow-2xl flex flex-col justify-between hover:border-indigo-500/30 transition-all group'>
                <div>
                    <ServerIcon className='w-6 h-6 text-indigo-400 mb-2' />
                    <h3 className='text-sm font-semibold text-white font-sans'>Dedicated Node</h3>
                    <p className='text-xs text-slate-400 mt-1 leading-relaxed font-sans'>
                        Bare-metal performance for mission-critical infrastructure workloads.
                    </p>
                </div>
                <button
                    onClick={onDeploy}
                    className='mt-4 text-xs font-medium text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 cursor-pointer transition bg-transparent border-0 p-0 shadow-none w-fit font-sans group-hover:translate-x-0.5'
                >
                    <span>Deploy Dedicated</span>
                    <span>&rarr;</span>
                </button>
            </div>

            {/* Storage Server Quick Deploy */}
            <div className='bg-[#12141A] border border-white/[0.08] rounded-2xl p-5 shadow-2xl flex flex-col justify-between hover:border-emerald-500/30 transition-all group'>
                <div>
                    <CircleStackIcon className='w-6 h-6 text-emerald-400 mb-2' />
                    <h3 className='text-sm font-semibold text-white font-sans'>NVMe Storage</h3>
                    <p className='text-xs text-slate-400 mt-1 leading-relaxed font-sans'>
                        High-throughput block storage volumes attached on demand.
                    </p>
                </div>
                <button
                    onClick={onDeploy}
                    className='mt-4 text-xs font-medium text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer transition bg-transparent border-0 p-0 shadow-none w-fit font-sans group-hover:translate-x-0.5'
                >
                    <span>Attach Volume</span>
                    <span>&rarr;</span>
                </button>
            </div>
        </div>
    )
}

export default QuickServicesGrid
