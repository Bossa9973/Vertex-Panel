import PageContentBlock from '@/components/elements/PageContentBlock'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useState, useEffect } from 'react'
import http from '@/api/http'
import { PlusIcon, TrashIcon, PencilIcon, CpuChipIcon, CircleStackIcon, ServerIcon } from '@heroicons/react/24/outline'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'

interface VpsPlan {
    id: number
    name: string
    ram: number
    cpu: number
    disk: number
    price: number
    description: string
}

const AdminVpsPlansContainer = () => {
    const [plans, setPlans] = useState<VpsPlan[]>([])
    const [loading, setLoading] = useState(true)
    const [opened, setOpened] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Form fields
    const [editingId, setEditingId] = useState<number | null>(null)
    const [name, setName] = useState('')
    const [ram, setRam] = useState(2048)
    const [cpu, setCpu] = useState(2)
    const [disk, setDisk] = useState(40)
    const [price, setPrice] = useState(10.0)
    const [description, setDescription] = useState('')

    const fetchPlans = () => {
        setLoading(true)
        http.get('/api/admin/plans')
            .then(res => setPlans(res.data.plans || []))
            .catch(err => console.error(err))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        fetchPlans()
    }, [])

    const handleOpenCreate = () => {
        setEditingId(null)
        setName('')
        setRam(2048)
        setCpu(2)
        setDisk(40)
        setPrice(10.0)
        setDescription('')
        setOpened(true)
    }

    const handleOpenEdit = (plan: VpsPlan) => {
        setEditingId(plan.id)
        setName(plan.name)
        setRam(plan.ram)
        setCpu(plan.cpu)
        setDisk(plan.disk)
        setPrice(plan.price)
        setDescription(plan.description || '')
        setOpened(true)
    }

    const handleSave = async () => {
        setSubmitting(true)
        try {
            await http.post('/api/admin/plans', {
                id: editingId,
                name,
                ram,
                cpu,
                disk,
                price,
                description,
            })
            fetchPlans()
            setOpened(false)
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to save VPS plan.')
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this VPS plan?')) return
        try {
            await http.delete(`/api/admin/plans/${id}`)
            fetchPlans()
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <PageContentBlock title='Admin > VPS Plans Management'>
            <div className='flex items-center justify-between mb-6 border-b border-gray-800 pb-4'>
                <div>
                    <h1 className='text-2xl font-extrabold text-white'>VPS Plans Management</h1>
                    <p className='text-xs text-gray-400 mt-1'>
                        Create, edit hardware specifications, and set monthly BOLT pricing for VPS plans available to clients.
                    </p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className='px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/20 transition active:scale-95 cursor-pointer'
                >
                    <PlusIcon className='w-4 h-4' /> Create New VPS Plan
                </button>
            </div>

            {loading ? (
                <div className='py-12 text-center text-xs text-gray-500'>Loading VPS plans...</div>
            ) : (
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    {plans.map(plan => (
                        <div key={plan.id} className='bg-[#141619] border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between relative'>
                            <div>
                                <div className='flex items-center justify-between mb-2'>
                                    <h3 className='text-lg font-bold text-white'>{plan.name}</h3>
                                    <span className='text-xl font-extrabold text-amber-400 flex items-center gap-1'>
                                        <BoltSvgIcon className='w-4 h-4 text-amber-400' />
                                        {(plan.price ?? 0).toFixed(2)} <span className='text-xs text-gray-400 font-normal'>BOLTs/mo</span>
                                    </span>
                                </div>
                                <p className='text-xs text-gray-400 mb-4'>{plan.description || 'Standard KVM Instance'}</p>

                                <div className='space-y-2 text-xs font-semibold text-gray-300 border-t border-gray-800 pt-3'>
                                    <div className='flex items-center gap-2'>
                                        <CpuChipIcon className='w-4 h-4 text-blue-400' /> {plan.cpu} vCPU Core{plan.cpu > 1 ? 's' : ''}
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <ServerIcon className='w-4 h-4 text-emerald-400' /> {plan.ram >= 1024 ? `${(plan.ram / 1024).toFixed(0)} GB` : `${plan.ram} MB`} RAM
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <CircleStackIcon className='w-4 h-4 text-indigo-400' /> {plan.disk} GB NVMe SSD
                                    </div>
                                </div>
                            </div>

                            <div className='flex items-center gap-2 mt-6 pt-4 border-t border-gray-800'>
                                <button
                                    onClick={() => handleOpenEdit(plan)}
                                    className='flex-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer'
                                >
                                    <PencilIcon className='w-3.5 h-3.5' /> Edit Plan
                                </button>
                                <button
                                    onClick={() => handleDelete(plan.id)}
                                    className='p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer'
                                >
                                    <TrashIcon className='w-4 h-4' />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                opened={opened}
                onClose={() => setOpened(false)}
                title={<div className='font-bold text-lg text-white'>{editingId ? 'Edit VPS Plan' : 'Create VPS Plan'}</div>}
                centered
                styles={{
                    content: { backgroundColor: '#141619', color: '#fff', border: '1px solid #2a2d34', borderRadius: '16px' },
                    header: { backgroundColor: '#141619', color: '#fff', borderBottom: '1px solid #2a2d34' },
                    close: { color: '#9ca3af', '&:hover': { backgroundColor: '#1c1e22', color: '#fff' } }
                }}
            >
                <div className='relative pt-1 space-y-4'>
                    <LoadingOverlay visible={submitting} radius='md' />
                    <div>
                        <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>Plan Name</label>
                        <input type='text' value={name} onChange={e => setName(e.target.value)} className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-medium focus:outline-none focus:border-blue-500' placeholder='e.g. KVM Pro' />
                    </div>
                    <div className='grid grid-cols-3 gap-3'>
                        <div>
                            <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>vCPU Cores</label>
                            <input type='number' value={cpu} onChange={e => setCpu(Number(e.target.value))} className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-medium focus:outline-none focus:border-blue-500' />
                        </div>
                        <div>
                            <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>RAM (MB)</label>
                            <input type='number' value={ram} onChange={e => setRam(Number(e.target.value))} className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-medium focus:outline-none focus:border-blue-500' />
                        </div>
                        <div>
                            <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>Disk (GB)</label>
                            <input type='number' value={disk} onChange={e => setDisk(Number(e.target.value))} className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-medium focus:outline-none focus:border-blue-500' />
                        </div>
                    </div>
                    <div>
                        <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>Monthly Price (BOLTs)</label>
                        <input type='number' step='0.01' value={price} onChange={e => setPrice(Number(e.target.value))} className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-medium focus:outline-none focus:border-blue-500' />
                    </div>
                    <div>
                        <label className='block text-xs font-bold uppercase text-gray-400 mb-1'>Description</label>
                        <input type='text' value={description} onChange={e => setDescription(e.target.value)} className='w-full px-3 py-2 rounded-xl border border-gray-800 bg-[#1c1e22] text-white text-sm font-medium focus:outline-none focus:border-blue-500' placeholder='Short description' />
                    </div>

                    <button onClick={handleSave} className='w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-600/20 transition cursor-pointer active:scale-95'>
                        Save Plan
                    </button>
                </div>
            </Modal>
        </PageContentBlock>
    )
}

export default AdminVpsPlansContainer

