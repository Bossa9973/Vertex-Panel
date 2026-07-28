import { useStoreActions, useStoreState } from '@/state'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import http from '@/api/http'
import NumberFlow from '@number-flow/react'
import {
    CpuChipIcon,
    CircleStackIcon,
    ServerIcon,
    CheckCircleIcon,
    SparklesIcon,
    BoltIcon,
    KeyIcon,
    EyeIcon,
    EyeSlashIcon,
    ArrowPathIcon,
    ArrowRightIcon,
    ArrowLeftIcon,
    ComputerDesktopIcon,
    ShieldCheckIcon,
    ServerStackIcon,
    RocketLaunchIcon,
} from '@heroicons/react/24/outline'
import { Sparkles as SparklesComp } from '@/components/ui/sparkles'
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface VpsPlan {
    id: number
    name: string
    ram: number
    cpu: number
    disk: number
    price: number
    description: string
}

interface NodeOption {
    id: number
    name: string
    fqdn: string
    cluster: string
    location_id: number
    location_code: string
    location_name: string
    flag: string
}

interface TemplateOption {
    id: number
    uuid: string
    name: string
    node_id: number | null
    category: string
    icon_svg: string
    description?: string
}

interface Props {
    opened: boolean
    onClose: () => void
    onSuccess: () => void
}

const generateSecurePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    let pwd = ''
    for (let i = 0; i < 14; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return pwd
}

const stepTitles = [
    { num: 1, label: '1. Plan & Billing' },
    { num: 2, label: '2. OS & Node' },
    { num: 3, label: '3. Credentials' },
    { num: 4, label: '4. Review & Launch' },
]

const stepVariants = {
    enter: (dir: number) => ({
        x: dir > 0 ? 50 : -50,
        opacity: 0,
        filter: 'blur(8px)',
    }),
    center: {
        x: 0,
        opacity: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
    },
    exit: (dir: number) => ({
        x: dir > 0 ? -50 : 50,
        opacity: 0,
        filter: 'blur(8px)',
        transition: { duration: 0.25, ease: [0.55, 0, 1, 0.45] },
    }),
}

const StepPillSwitch = ({
    currentStep,
    onSelectStep,
}: {
    currentStep: number
    onSelectStep: (step: number) => void
}) => {
    return (
        <div className='flex justify-center my-3'>
            <div className='relative z-10 mx-auto flex w-fit rounded-full bg-neutral-900/90 border border-gray-700/80 p-1 backdrop-blur-md'>
                {stepTitles.map(s => {
                    const isActive = currentStep === s.num
                    return (
                        <button
                            key={s.num}
                            type='button'
                            onClick={() => onSelectStep(s.num)}
                            className={cn(
                                'relative z-10 w-fit h-9 rounded-full sm:px-5 px-3 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5',
                                isActive ? 'text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                            )}
                        >
                            {isActive && (
                                <motion.span
                                    layoutId='stepSwitch'
                                    className='absolute top-0 left-0 h-9 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-500 bg-gradient-to-t from-blue-600 to-blue-500'
                                    transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                                />
                            )}
                            <span className='relative flex items-center gap-1.5'>
                                {s.label}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

const PricingSwitch = ({ isYearly, onToggle }: { isYearly: boolean; onToggle: (yearly: boolean) => void }) => {
    const selected = isYearly ? '1' : '0'
    return (
        <div className='flex justify-center my-2'>
            <div className='relative z-10 mx-auto flex w-fit rounded-full bg-neutral-900 border border-gray-700 p-1'>
                <button
                    type='button'
                    onClick={() => onToggle(false)}
                    className={cn(
                        'relative z-10 w-fit h-8 rounded-full sm:px-5 px-3 text-xs font-medium transition-colors cursor-pointer',
                        selected === '0' ? 'text-white font-bold' : 'text-gray-400'
                    )}
                >
                    {selected === '0' && (
                        <motion.span
                            layoutId='pricingPeriodSwitch'
                            className='absolute top-0 left-0 h-8 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-600 bg-gradient-to-t from-blue-500 to-blue-600'
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                    )}
                    <span className='relative'>Monthly</span>
                </button>

                <button
                    type='button'
                    onClick={() => onToggle(true)}
                    className={cn(
                        'relative z-10 w-fit h-8 flex-shrink-0 rounded-full sm:px-5 px-3 text-xs font-medium transition-colors cursor-pointer',
                        selected === '1' ? 'text-white font-bold' : 'text-gray-400'
                    )}
                >
                    {selected === '1' && (
                        <motion.span
                            layoutId='pricingPeriodSwitch'
                            className='absolute top-0 left-0 h-8 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-600 bg-gradient-to-t from-blue-500 to-blue-600'
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                    )}
                    <span className='relative flex items-center gap-1.5'>
                        Yearly <span className='text-[9px] bg-emerald-400/20 text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-400/30'>-15%</span>
                    </span>
                </button>
            </div>
        </div>
    )
}

const VpsDeployModal = ({ opened, onClose, onSuccess }: Props) => {
    const user = useStoreState(state => state.user.data)
    const updateCredits = useStoreActions(actions => actions.user.updateCredits)

    const [step, setStep] = useState<number>(1)
    const [dir, setDir] = useState<number>(1)

    const [plans, setPlans] = useState<VpsPlan[]>([])
    const [nodes, setNodes] = useState<NodeOption[]>([])
    const [templates, setTemplates] = useState<TemplateOption[]>([])

    const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
    const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
    const [isYearly, setIsYearly] = useState(false)

    const [serverName, setServerName] = useState('vps-instance-1')
    const [hostname, setHostname] = useState('vps-instance-1.vertexnodes.net')
    const [rootPassword, setRootPassword] = useState(generateSecurePassword)
    const [showPassword, setShowPassword] = useState(false)
    const [startOnCompletion, setStartOnCompletion] = useState(true)

    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const modalRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (opened) {
            setStep(1)
            setDir(1)
            setError(null)
            setLoading(true)
            http.get('/api/client/plans')
                .then(res => {
                    const fetchedPlans = res.data.plans || []
                    setPlans(fetchedPlans)
                    if (fetchedPlans.length > 0) setSelectedPlanId(fetchedPlans[0].id)

                    const fetchedNodes = res.data.nodes || []
                    setNodes(fetchedNodes)
                    if (fetchedNodes.length > 0) setSelectedNodeId(fetchedNodes[0].id)

                    const fetchedTemplates = res.data.templates || []
                    setTemplates(fetchedTemplates)
                    if (fetchedTemplates.length > 0) setSelectedTemplateId(fetchedTemplates[0].id)
                })
                .catch(err => console.error(err))
                .finally(() => setLoading(false))
        }
    }, [opened])

    const goToStep = (next: number) => {
        setDir(next > step ? 1 : -1)
        setStep(next)
    }

    const handleServerNameChange = (val: string) => {
        setServerName(val)
        const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-')
        setHostname(`${slug || 'vps-node'}.vertexnodes.net`)
    }

    const selectedPlan = plans.find(p => p.id === selectedPlanId)
    const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[0]
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0]
    const userCredits = user?.credits ?? 0
    const rawPrice = selectedPlan?.price ?? 0
    const finalPrice = isYearly ? Math.round(rawPrice * 12 * 0.85) : rawPrice
    const nodeTemplates = templates.filter(t => t.node_id === null || t.node_id === selectedNodeId)

    const handleDeploy = async () => {
        if (!selectedPlan || !selectedNode || !selectedTemplate) {
            setError('Please select a hardware plan, target node, and OS template.')
            return
        }
        if (userCredits < finalPrice) {
            setError(`Insufficient BOLTs balance. Required: ${finalPrice.toFixed(2)}, Available: ${userCredits.toFixed(2)}.`)
            return
        }
        if (!serverName.trim()) {
            setError('Please enter a valid server name.')
            return
        }
        if (!rootPassword || rootPassword.length < 8) {
            setError('Root password must be at least 8 characters.')
            return
        }

        setSubmitting(true)
        setError(null)

        try {
            const res = await http.post('/api/client/deploy', {
                plan_id: selectedPlan.id,
                node_id: selectedNode.id,
                template_uuid: selectedTemplate.uuid,
                name: serverName,
                hostname,
                account_password: rootPassword,
                start_on_completion: startOnCompletion,
            })
            if (res.data.user_credits !== undefined) updateCredits(res.data.user_credits)
            onSuccess()
            onClose()
        } catch (e: any) {
            setError(e.response?.data?.message || 'Failed to deploy server instance.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={null}
            size='xl'
            centered
            withCloseButton={false}
            padding={0}
            radius={24}
            styles={{
                content: {
                    backgroundColor: '#000000',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0px 0px 80px 0px rgba(9, 0, 255, 0.3)',
                    overflow: 'hidden',
                },
                overlay: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(16px)',
                },
            }}
        >
            {/* ── Outer wrapper with 100% pricing-section-4 background & atmospheric elements ── */}
            <div className='relative bg-black min-h-[620px] overflow-x-hidden text-white rounded-[24px]' ref={modalRef}>

                {/* 1. Sparkles & Grid Mask Top Layer */}
                <div className='absolute top-0 left-0 right-0 h-96 w-full overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] pointer-events-none z-0'>
                    <div className='absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#ffffff2c_1px,transparent_1px),linear-gradient(to_bottom,#3a3a3a01_1px,transparent_1px)] bg-[size:70px_80px]' />
                    <SparklesComp
                        density={1800}
                        direction='bottom'
                        speed={1}
                        color='#FFFFFF'
                        className='absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]'
                    />
                </div>

                {/* 2. Framer Dual Ellipses Background Glow Layer */}
                <div className='absolute left-0 top-[-114px] w-full h-full flex flex-col items-start justify-start overflow-hidden p-0 z-0 pointer-events-none'>
                    <div className='framer-1i5axl2 w-full'>
                        <div
                            className='absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full'
                            style={{
                                border: '200px solid #3131f5',
                                filter: 'blur(92px)',
                                WebkitFilter: 'blur(92px)',
                                opacity: 0.25,
                            }}
                        />
                        <div
                            className='absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full'
                            style={{
                                border: '200px solid #3131f5',
                                filter: 'blur(92px)',
                                WebkitFilter: 'blur(92px)',
                                opacity: 0.25,
                            }}
                        />
                    </div>
                </div>

                {/* 3. Radial Gradient Multiply Background Layer */}
                <div
                    className='absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none'
                    style={{
                        backgroundImage: `radial-gradient(circle at center, #206ce8 0%, transparent 70%)`,
                        opacity: 0.5,
                        mixBlendMode: 'multiply',
                    }}
                />

                {/* ── Content Container (z-10) ── */}
                <div className='relative z-10 p-6 sm:p-8 flex flex-col justify-between min-h-[620px]'>

                    {/* Modal Close Button & Title Section */}
                    <div>
                        <div className='flex items-center justify-between mb-2'>
                            <div className='flex items-center gap-2'>
                                <div className='w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]'>
                                    <RocketLaunchIcon className='w-4 h-4' />
                                </div>
                                <span className='text-xs font-bold text-blue-400 uppercase tracking-widest'>Deploy Instance</span>
                            </div>
                            <button
                                type='button'
                                onClick={onClose}
                                className='w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-stone-400 hover:text-white transition flex items-center justify-center text-lg font-light cursor-pointer'
                            >
                                ×
                            </button>
                        </div>

                        {/* Title using VerticalCutReveal */}
                        <div className='text-center max-w-xl mx-auto my-2 space-y-1'>
                            <h2 className='text-2xl sm:text-3xl font-medium text-white flex justify-center'>
                                <VerticalCutReveal
                                    splitBy='words'
                                    staggerDuration={0.12}
                                    staggerFrom='first'
                                    reverse={true}
                                    containerClassName='justify-center gap-1.5'
                                    transition={{
                                        type: 'spring',
                                        stiffness: 250,
                                        damping: 40,
                                        delay: 0,
                                    }}
                                >
                                    Deploy High Performance VPS
                                </VerticalCutReveal>
                            </h2>
                            <p className='text-xs text-gray-300 font-normal'>
                                Instant automated provisioning backed by NVMe storage and dedicated resources.
                            </p>
                        </div>

                        {/* Step Pill Switcher */}
                        <StepPillSwitch currentStep={step} onSelectStep={goToStep} />
                    </div>

                    {/* Error Banner */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className='mx-auto my-2 p-3 max-w-lg bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-semibold text-center'
                            >
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Step Body */}
                    <div className='relative my-4 flex-1 flex flex-col justify-center'>
                        <LoadingOverlay visible={loading || submitting} radius='lg' />

                        <AnimatePresence mode='wait' custom={dir}>
                            <motion.div
                                key={step}
                                custom={dir}
                                variants={stepVariants}
                                initial='enter'
                                animate='center'
                                exit='exit'
                                className='w-full'
                            >

                                {/* ── STEP 1: Hardware Plans ── */}
                                {step === 1 && (
                                    <div className='space-y-4 max-w-4xl mx-auto'>
                                        <PricingSwitch isYearly={isYearly} onToggle={setIsYearly} />

                                        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 py-2'>
                                            {plans.map((plan) => {
                                                const isSelected = selectedPlanId === plan.id
                                                const planPriceValue = isYearly ? Math.round(plan.price * 12 * 0.85) : plan.price

                                                return (
                                                    <Card
                                                        key={plan.id}
                                                        onClick={() => setSelectedPlanId(plan.id)}
                                                        className={cn(
                                                            'relative cursor-pointer transition-all duration-300 text-white border-neutral-800 flex flex-col justify-between',
                                                            isSelected
                                                                ? 'bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 shadow-[0px_-13px_300px_0px_#0900ff] z-20 border-blue-500 ring-2 ring-blue-500/40'
                                                                : 'bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 z-10 hover:border-neutral-700'
                                                        )}
                                                    >
                                                        <CardHeader className='text-left p-5 pb-3'>
                                                            <div className='flex justify-between items-center mb-1'>
                                                                <h3 className='text-xl font-bold text-white'>{plan.name}</h3>
                                                                {isSelected && (
                                                                    <CheckCircleIcon className='w-5 h-5 text-blue-400 shrink-0' />
                                                                )}
                                                            </div>
                                                            <div className='flex items-baseline my-2'>
                                                                <span className='text-3xl font-semibold flex items-center gap-1 text-amber-400'>
                                                                    <BoltIcon className='w-5 h-5 fill-amber-400/20 text-amber-400 shrink-0' />
                                                                    <NumberFlow
                                                                        value={planPriceValue}
                                                                        className='text-3xl font-semibold text-amber-400'
                                                                    />
                                                                </span>
                                                                <span className='text-gray-300 text-xs ml-1.5 font-medium'>
                                                                    BOLTs/{isYearly ? 'yr' : 'mo'}
                                                                </span>
                                                            </div>
                                                            <p className='text-xs text-gray-400 line-clamp-2 min-h-[32px]'>
                                                                {plan.description || 'Optimized cloud instance for high concurrency workloads.'}
                                                            </p>
                                                        </CardHeader>

                                                        <CardContent className='p-5 pt-0 mt-auto'>
                                                            <button
                                                                type='button'
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setSelectedPlanId(plan.id)
                                                                    goToStep(2)
                                                                }}
                                                                className={cn(
                                                                    'w-full py-2.5 px-4 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2',
                                                                    isSelected
                                                                        ? 'bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white'
                                                                        : 'bg-gradient-to-t from-neutral-950 to-neutral-700 shadow-lg shadow-neutral-900 border border-neutral-800 text-white hover:border-neutral-600'
                                                                )}
                                                            >
                                                                {isSelected ? 'Selected' : 'Select Plan'}
                                                            </button>

                                                            <div className='space-y-2 pt-4 border-t border-neutral-700/80 mt-4 text-xs'>
                                                                <div className='flex items-center gap-2 text-gray-300'>
                                                                    <span className='h-2 w-2 bg-blue-500 rounded-full shrink-0' />
                                                                    <CpuChipIcon className='w-3.5 h-3.5 text-blue-400 shrink-0' />
                                                                    <span>{plan.cpu} vCPU Cores</span>
                                                                </div>
                                                                <div className='flex items-center gap-2 text-gray-300'>
                                                                    <span className='h-2 w-2 bg-emerald-500 rounded-full shrink-0' />
                                                                    <ServerIcon className='w-3.5 h-3.5 text-emerald-400 shrink-0' />
                                                                    <span>
                                                                        {plan.ram >= 1024 ? `${(plan.ram / 1024).toFixed(0)} GB` : `${plan.ram} MB`} RAM
                                                                    </span>
                                                                </div>
                                                                <div className='flex items-center gap-2 text-gray-300'>
                                                                    <span className='h-2 w-2 bg-indigo-500 rounded-full shrink-0' />
                                                                    <CircleStackIcon className='w-3.5 h-3.5 text-indigo-400 shrink-0' />
                                                                    <span>{plan.disk} GB NVMe SSD</span>
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                )
                                            })}
                                        </div>

                                        <div className='flex justify-end pt-2'>
                                            <button
                                                type='button'
                                                onClick={() => goToStep(2)}
                                                disabled={!selectedPlanId}
                                                className='py-3 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-40'
                                            >
                                                Next: OS & Node <ArrowRightIcon className='w-4 h-4' />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── STEP 2: OS & Node selection ── */}
                                {step === 2 && (
                                    <div className='space-y-5 max-w-3xl mx-auto'>
                                        {/* OS Images */}
                                        <div>
                                            <h3 className='text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2'>
                                                <ComputerDesktopIcon className='w-4 h-4 text-blue-400' />
                                                Choose Operating System
                                            </h3>
                                            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                                                {(nodeTemplates.length > 0 ? nodeTemplates : templates).map((tpl) => {
                                                    const isSelected = selectedTemplateId === tpl.id
                                                    return (
                                                        <Card
                                                            key={tpl.id}
                                                            onClick={() => setSelectedTemplateId(tpl.id)}
                                                            className={cn(
                                                                'p-4 cursor-pointer transition-all duration-200 text-white border-neutral-800 flex items-center gap-3',
                                                                isSelected
                                                                    ? 'bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border-blue-500 shadow-[0px_0px_20px_0px_#0900ff] ring-1 ring-blue-500/50'
                                                                    : 'bg-neutral-900/60 hover:bg-neutral-800/80 hover:border-neutral-700'
                                                            )}
                                                        >
                                                            <img src={tpl.icon_svg} alt={tpl.name} className='w-8 h-8 object-contain shrink-0' />
                                                            <div className='min-w-0 flex-1'>
                                                                <span className='text-xs font-bold block truncate text-white'>{tpl.name}</span>
                                                                <span className='text-[10px] text-gray-400 block truncate'>{tpl.category}</span>
                                                            </div>
                                                            {isSelected && <CheckCircleIcon className='w-4 h-4 text-blue-400 shrink-0' />}
                                                        </Card>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* Hypervisor Node */}
                                        <div>
                                            <h3 className='text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2'>
                                                <ServerStackIcon className='w-4 h-4 text-blue-400' />
                                                Choose Datacenter Node
                                            </h3>
                                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                                                {nodes.map((node) => {
                                                    const isSelected = selectedNodeId === node.id
                                                    return (
                                                        <Card
                                                            key={node.id}
                                                            onClick={() => setSelectedNodeId(node.id)}
                                                            className={cn(
                                                                'p-4 cursor-pointer transition-all duration-200 text-white border-neutral-800 flex items-center justify-between',
                                                                isSelected
                                                                    ? 'bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border-blue-500 shadow-[0px_0px_20px_0px_#0900ff] ring-1 ring-blue-500/50'
                                                                    : 'bg-neutral-900/60 hover:bg-neutral-800/80 hover:border-neutral-700'
                                                            )}
                                                        >
                                                            <div className='flex items-center gap-3'>
                                                                <img src={node.flag} alt={node.name} className='w-6 h-4 rounded-sm object-cover shrink-0' />
                                                                <div>
                                                                    <div className='text-xs font-bold text-white flex items-center gap-2'>
                                                                        {node.name}
                                                                        <span className='text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/30 font-semibold'>
                                                                            Online
                                                                        </span>
                                                                    </div>
                                                                    <div className='text-[10px] text-gray-400 font-mono mt-0.5'>{node.fqdn}</div>
                                                                </div>
                                                            </div>
                                                            {isSelected && <CheckCircleIcon className='w-4 h-4 text-blue-400 shrink-0' />}
                                                        </Card>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        <div className='flex justify-between items-center pt-3 border-t border-neutral-800'>
                                            <button
                                                type='button'
                                                onClick={() => goToStep(1)}
                                                className='py-2.5 px-5 rounded-xl bg-neutral-900 border border-neutral-800 text-gray-300 hover:text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition'
                                            >
                                                <ArrowLeftIcon className='w-4 h-4' /> Back
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => goToStep(3)}
                                                className='py-2.5 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95'
                                            >
                                                Next: Credentials <ArrowRightIcon className='w-4 h-4' />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── STEP 3: Credentials ── */}
                                {step === 3 && (
                                    <div className='space-y-5 max-w-2xl mx-auto'>
                                        <h3 className='text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2'>
                                            <KeyIcon className='w-4 h-4 text-amber-400' />
                                            Instance Credentials & Identification
                                        </h3>

                                        <Card className='p-5 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border-neutral-800 space-y-4 text-white'>
                                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                                                <div>
                                                    <label className='block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5'>Server Label</label>
                                                    <input
                                                        type='text'
                                                        value={serverName}
                                                        onChange={e => handleServerNameChange(e.target.value)}
                                                        className='w-full px-4 py-2.5 rounded-xl border border-neutral-700 bg-black/60 text-white font-semibold text-xs focus:outline-none focus:border-blue-500 transition'
                                                        placeholder='e.g. web-app-vps'
                                                    />
                                                </div>
                                                <div>
                                                    <label className='block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5'>Hostname FQDN</label>
                                                    <input
                                                        type='text'
                                                        value={hostname}
                                                        onChange={e => setHostname(e.target.value)}
                                                        className='w-full px-4 py-2.5 rounded-xl border border-neutral-700 bg-black/60 text-gray-300 font-mono text-[11px] focus:outline-none focus:border-blue-500 transition'
                                                    />
                                                </div>
                                            </div>

                                            <div className='space-y-2 pt-2 border-t border-neutral-800'>
                                                <div className='flex items-center justify-between'>
                                                    <label className='text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5'>
                                                        Root Password
                                                    </label>
                                                    <span className='text-[9px] text-emerald-400 flex items-center gap-1 font-semibold'>
                                                        <ShieldCheckIcon className='w-3 h-3' /> Encrypted
                                                    </span>
                                                </div>
                                                <div className='relative'>
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        value={rootPassword}
                                                        onChange={e => setRootPassword(e.target.value)}
                                                        className='w-full pl-4 pr-24 py-2.5 rounded-xl border border-neutral-700 bg-black/80 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition'
                                                    />
                                                    <div className='absolute right-2 top-2 flex items-center gap-1.5'>
                                                        <button
                                                            type='button'
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            className='p-1.5 rounded-lg text-gray-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition cursor-pointer'
                                                        >
                                                            {showPassword ? <EyeSlashIcon className='w-3.5 h-3.5' /> : <EyeIcon className='w-3.5 h-3.5' />}
                                                        </button>
                                                        <button
                                                            type='button'
                                                            onClick={() => setRootPassword(generateSecurePassword())}
                                                            className='px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-[10px] font-bold flex items-center gap-1 transition border border-neutral-700 cursor-pointer'
                                                        >
                                                            <ArrowPathIcon className='w-3 h-3' /> Gen
                                                        </button>
                                                    </div>
                                                </div>
                                                <label className='inline-flex items-center gap-2 text-xs text-gray-400 font-medium cursor-pointer pt-2'>
                                                    <input
                                                        type='checkbox'
                                                        checked={startOnCompletion}
                                                        onChange={e => setStartOnCompletion(e.target.checked)}
                                                        className='rounded border-neutral-700 text-blue-600 focus:ring-blue-500 bg-black'
                                                    />
                                                    Auto-boot server instance immediately after setup
                                                </label>
                                            </div>
                                        </Card>

                                        <div className='flex justify-between items-center pt-3 border-t border-neutral-800'>
                                            <button
                                                type='button'
                                                onClick={() => goToStep(2)}
                                                className='py-2.5 px-5 rounded-xl bg-neutral-900 border border-neutral-800 text-gray-300 hover:text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition'
                                            >
                                                <ArrowLeftIcon className='w-4 h-4' /> Back
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => goToStep(4)}
                                                className='py-2.5 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95'
                                            >
                                                Review & Confirm <ArrowRightIcon className='w-4 h-4' />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── STEP 4: Review & Deploy ── */}
                                {step === 4 && selectedPlan && (
                                    <div className='space-y-5 max-w-2xl mx-auto'>
                                        <h3 className='text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2'>
                                            <SparklesIcon className='w-4 h-4 text-blue-400' />
                                            Final Confirmation & Provisioning
                                        </h3>

                                        <Card className='p-6 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border-neutral-800 shadow-[0px_-13px_300px_0px_#0900ff] text-white relative overflow-hidden'>
                                            <div className='flex items-center gap-4 pb-4 border-b border-neutral-700 mb-4'>
                                                {selectedTemplate && (
                                                    <img src={selectedTemplate.icon_svg} alt={selectedTemplate.name} className='w-10 h-10 object-contain shrink-0' />
                                                )}
                                                <div>
                                                    <h3 className='text-xl font-bold text-white'>{serverName}</h3>
                                                    <p className='text-xs text-gray-400 font-mono mt-0.5'>{hostname}</p>
                                                </div>
                                                <span className='ml-auto px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30'>
                                                    {selectedTemplate?.name}
                                                </span>
                                            </div>

                                            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4'>
                                                {[
                                                    { label: 'Plan', val: selectedPlan.name },
                                                    { label: 'vCPU', val: `${selectedPlan.cpu} Cores` },
                                                    { label: 'RAM', val: selectedPlan.ram >= 1024 ? `${(selectedPlan.ram / 1024).toFixed(0)} GB` : `${selectedPlan.ram} MB` },
                                                    { label: 'Node', val: selectedNode?.name ?? '—' },
                                                ].map(item => (
                                                    <div key={item.label} className='bg-black/50 border border-neutral-800 rounded-xl p-3'>
                                                        <span className='text-gray-400 text-[10px] font-bold uppercase block'>{item.label}</span>
                                                        <span className='font-bold text-white block mt-0.5 truncate'>{item.val}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className='flex items-center justify-between bg-black/50 border border-neutral-800 rounded-xl p-3 text-xs'>
                                                <span className='text-gray-400 font-medium'>Calculated Cost</span>
                                                <span className='font-bold text-amber-400 flex items-center gap-1 text-sm'>
                                                    <BoltIcon className='w-4 h-4 fill-amber-400/20 text-amber-400 shrink-0' />
                                                    <NumberFlow value={finalPrice} /> BOLTs/{isYearly ? 'year' : 'month'}
                                                </span>
                                            </div>
                                        </Card>

                                        {/* Deployment Action Bar */}
                                        <div className='flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800'>
                                            <div>
                                                <span className='text-[10px] text-gray-400 font-bold uppercase block'>Available Credits</span>
                                                <span className='text-sm font-bold text-white flex items-center gap-1 mt-0.5'>
                                                    <BoltIcon className='w-4 h-4 fill-amber-400/20 text-amber-400 shrink-0' />
                                                    {userCredits.toFixed(2)} BOLTs
                                                </span>
                                            </div>

                                            <div className='flex items-center gap-3'>
                                                <button
                                                    type='button'
                                                    onClick={() => goToStep(3)}
                                                    className='py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-gray-300 font-bold text-xs cursor-pointer transition'
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type='button'
                                                    onClick={handleDeploy}
                                                    disabled={userCredits < finalPrice || submitting}
                                                    className='py-3 px-7 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-40'
                                                >
                                                    <RocketLaunchIcon className='w-4 h-4' />
                                                    {submitting ? 'Deploying Instance…' : 'Launch Instance'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </Modal>
    )
}

export default VpsDeployModal
