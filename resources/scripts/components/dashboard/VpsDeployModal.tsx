import { useStoreActions, useStoreState } from '@/state'
import { Modal, LoadingOverlay } from '@mantine/core'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import http from '@/api/http'
import NumberFlow from '@number-flow/react'
import {
    CpuChipIcon,
    CircleStackIcon,
    ServerIcon,
    CheckCircleIcon,
    SparklesIcon,
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
    XMarkIcon,
    ExclamationTriangleIcon,
    CubeTransparentIcon,
} from '@heroicons/react/24/outline'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import { Sparkles as SparklesComp } from '@/components/ui/sparkles'
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import OnboardCard from '@/components/ui/onboard-card'
import { cn } from '@/lib/utils'

const PasswordIcon = ({ className = 'w-4 h-4 text-amber-400' }: { className?: string }) => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className={className}>
        <path fillRule='evenodd' d='M12 3.75a6.715 6.715 0 0 0-3.722 1.118.75.75 0 1 1-.828-1.25 8.25 8.25 0 0 1 12.8 6.883c0 3.014-.574 5.897-1.62 8.543a.75.75 0 0 1-1.395-.551A21.69 21.69 0 0 0 18.75 10.5 6.75 6.75 0 0 0 12 3.75ZM6.157 5.739a.75.75 0 0 1 .21 1.04A6.715 6.715 0 0 0 5.25 10.5c0 1.613-.463 3.12-1.265 4.393a.75.75 0 0 1-1.27-.8A6.715 6.715 0 0 0 3.75 10.5c0-1.68.503-3.246 1.367-4.55a.75.75 0 0 1 1.04-.211ZM12 7.5a3 3 0 0 0-3 3c0 3.1-1.176 5.927-3.105 8.056a.75.75 0 1 1-1.112-1.008A10.459 10.459 0 0 0 7.5 10.5a4.5 4.5 0 1 1 9 0c0 .547-.022 1.09-.067 1.626a.75.75 0 0 1-1.495-.123c.041-.495.062-.996.062-1.503a3 3 0 0 0-3-3Zm0 2.25a.75.75 0 0 1 .75.75c0 3.908-1.424 7.485-3.781 10.238a.75.75 0 0 1-1.14-.975A14.19 14.19 0 0 0 11.25 10.5a.75.75 0 0 1 .75-.75Zm3.239 5.183a.75.75 0 0 1 .515.927 19.417 19.417 0 0 1-2.585 5.544.75.75 0 0 1-1.243-.84 17.915 17.915 0 0 0 2.386-5.116.75.75 0 0 1 .927-.515Z' clipRule='evenodd' />
    </svg>
)

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
    { num: 3, label: '3. Apps' },
    { num: 4, label: '4. Credentials' },
    { num: 5, label: '5. Review & Launch' },
]

const stepVariants = {
    enter: (dir: number) => ({
        x: dir > 0 ? 35 : -35,
        opacity: 0,
        scale: 0.98,
    }),
    center: {
        x: 0,
        opacity: 1,
        scale: 1,
        transition: {
            duration: 0.38,
            ease: [0.16, 1, 0.3, 1],
        },
    },
    exit: (dir: number) => ({
        x: dir > 0 ? -35 : 35,
        opacity: 0,
        scale: 0.98,
        transition: {
            duration: 0.22,
            ease: [0.7, 0, 0.84, 0],
        },
    }),
}

const StepPillSwitch = ({
    currentStep,
    onSelectStep,
    appInstallEnabled = true,
}: {
    currentStep: number
    onSelectStep: (step: number) => void
    appInstallEnabled?: boolean
}) => {
    const titles = appInstallEnabled
        ? [
            { num: 1, label: '1. Plan & Billing' },
            { num: 2, label: '2. OS & Node' },
            { num: 3, label: '3. Apps' },
            { num: 4, label: '4. Credentials' },
            { num: 5, label: '5. Review & Launch' },
        ]
        : [
            { num: 1, label: '1. Plan & Billing' },
            { num: 2, label: '2. OS & Node' },
            { num: 4, label: '3. Credentials' },
            { num: 5, label: '4. Review & Launch' },
        ]

    return (
        <div className='flex justify-center my-3'>
            <div className='relative z-10 mx-auto flex w-fit rounded-full bg-neutral-900/90 border border-gray-700/80 p-1 backdrop-blur-md'>
                {titles.map(s => {
                    const isActive = currentStep === s.num
                    return (
                        <button
                            key={s.num}
                            type='button'
                            onClick={() => onSelectStep(s.num)}
                            className={cn(
                                'relative z-10 w-fit h-9 rounded-full sm:px-5 px-3 py-1 text-xs font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5',
                                isActive ? 'text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                            )}
                        >
                            {isActive && (
                                <motion.span
                                    layoutId='stepSwitch'
                                    className='absolute top-0 left-0 h-9 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-500 bg-gradient-to-t from-blue-600 to-blue-500'
                                    transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
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
                        'relative z-10 w-fit h-8 rounded-full sm:px-5 px-3 text-xs font-medium transition-all duration-200 cursor-pointer',
                        selected === '0' ? 'text-white font-bold' : 'text-gray-400'
                    )}
                >
                    {selected === '0' && (
                        <motion.span
                            layoutId='pricingPeriodSwitch'
                            className='absolute top-0 left-0 h-8 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-600 bg-gradient-to-t from-blue-500 to-blue-600'
                            transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                        />
                    )}
                    <span className='relative'>Monthly</span>
                </button>

                <button
                    type='button'
                    onClick={() => onToggle(true)}
                    className={cn(
                        'relative z-10 w-fit h-8 flex-shrink-0 rounded-full sm:px-5 px-3 text-xs font-medium transition-all duration-200 cursor-pointer',
                        selected === '1' ? 'text-white font-bold' : 'text-gray-400'
                    )}
                >
                    {selected === '1' && (
                        <motion.span
                            layoutId='pricingPeriodSwitch'
                            className='absolute top-0 left-0 h-8 w-full rounded-full border-2 shadow-sm shadow-blue-600 border-blue-600 bg-gradient-to-t from-blue-500 to-blue-600'
                            transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
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

    const [serverName, setServerName] = useState('')
    const [hostnamePrefix, setHostnamePrefix] = useState('')
    const [rootPassword, setRootPassword] = useState(generateSecurePassword)
    const [showPassword, setShowPassword] = useState(false)
    const [startOnCompletion, setStartOnCompletion] = useState(true)

    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [createdServer, setCreatedServer] = useState<{ id: string; name: string } | null>(null)
    const [provisionStep, setProvisionStep] = useState<number>(0)
    const [isProvisioned, setIsProvisioned] = useState<boolean>(false)

    // ── Pterodactyl app installer state ──────────────────────────────────────
    const [appInstallEnabled, setAppInstallEnabled] = useState<boolean>(true)
    const [installPterodactyl, setInstallPterodactyl] = useState(false)
    const [pteroOsWarningAccepted, setPteroOsWarningAccepted] = useState(false)
    const [pteroCfToken, setPteroCfToken] = useState('')
    const [pteroPanelFqdn, setPteroPanelFqdn] = useState('')
    const [pteroWingsFqdn, setPteroWingsFqdn] = useState('')
    const [pteroAdminEmail, setPteroAdminEmail] = useState('')
    const [pteroAdminUsername, setPteroAdminUsername] = useState('')
    const [pteroAdminFirstname, setPteroAdminFirstname] = useState('')
    const [pteroAdminLastname, setPteroAdminLastname] = useState('')
    const [pteroShowToken, setPteroShowToken] = useState(false)

    // Node-filtered templates & Ubuntu 22.04 template detection for selected node
    const nodeTemplates = templates.filter(t => t.node_id === null || t.node_id === selectedNodeId)
    const selectedTemplate = nodeTemplates.find(t => t.id === selectedTemplateId) || nodeTemplates[0] || templates[0]

    const isUbuntu2204Name = (name: string) => /(ubuntu|ubutnu).?22.?04|22\.04|ubuntu-22/i.test(name || '')
    const ubuntu2204Template = nodeTemplates.find(t => isUbuntu2204Name(t.name)) || nodeTemplates[0] || templates[0]
    const selectedTemplateIsUbuntu2204 = selectedTemplate ? isUbuntu2204Name(selectedTemplate.name) : false
    const pteroNeedsOsSwitch = installPterodactyl && !selectedTemplateIsUbuntu2204

    const pterodactylFormComplete = !installPterodactyl || (
        pteroCfToken.trim().length >= 20 &&
        pteroPanelFqdn.trim().length > 0 &&
        pteroWingsFqdn.trim().length > 0 &&
        pteroAdminEmail.trim().length > 0 &&
        pteroAdminUsername.trim().length > 0 &&
        pteroAdminFirstname.trim().length > 0 &&
        pteroAdminLastname.trim().length > 0 &&
        (!pteroNeedsOsSwitch || pteroOsWarningAccepted)
    )

    const navigate = useNavigate()
    const modalRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (opened) {
            setStep(1)
            setDir(1)
            setError(null)
            setLoading(true)
            http.get('/api/client/plans')
                .then(res => {
                    const data = res.data?.data || res.data || {}
                    const fetchedPlans: VpsPlan[] = Array.isArray(data.plans) ? data.plans : []
                    const fetchedNodes: NodeOption[] = Array.isArray(data.nodes) ? data.nodes : []
                    const fetchedTemplates: TemplateOption[] = Array.isArray(data.templates) ? data.templates : []

                    setPlans(fetchedPlans)
                    if (fetchedPlans.length > 0) setSelectedPlanId(fetchedPlans[0].id)

                    setNodes(fetchedNodes)
                    if (fetchedNodes.length > 0) setSelectedNodeId(fetchedNodes[0].id)

                    setTemplates(fetchedTemplates)
                    if (fetchedTemplates.length > 0) setSelectedTemplateId(fetchedTemplates[0].id)

                    if (data.app_installation_enabled !== undefined) {
                        setAppInstallEnabled(Boolean(data.app_installation_enabled))
                    }
                })
                .catch(err => {
                    console.error('Failed to load deployment options:', err)
                    setError('Failed to fetch deployment plans and nodes from server.')
                })
                .finally(() => setLoading(false))
        }
    }, [opened])

    const goToStep = (next: number) => {
        setDir(next > step ? 1 : -1)
        setStep(next)
    }

    useEffect(() => {
        if (!submitting || !createdServer?.id || isProvisioned) return

        let currentStepIdx = 0
        let backendReady = false

        const stepTimer = setInterval(() => {
            currentStepIdx += 1
            if (currentStepIdx <= 5) {
                setProvisionStep(currentStepIdx)
            }

            if (currentStepIdx >= 5 && backendReady) {
                clearInterval(stepTimer)
                setIsProvisioned(true)
            }
        }, 3200)

        const pollInterval = setInterval(async () => {
            try {
                const res = await http.get(`/api/client/servers/${createdServer.id}`)
                const serverData = res.data?.data || res.data
                const status = serverData?.status

                if (status === null || status === '' || status === 'active') {
                    backendReady = true
                    clearInterval(pollInterval)

                    if (currentStepIdx >= 5) {
                        clearInterval(stepTimer)
                        setIsProvisioned(true)
                    }
                } else if (status === 'install_failed') {
                    clearInterval(pollInterval)
                    clearInterval(stepTimer)
                    setError('Server provision job failed on target hypervisor. Please contact support.')
                    setSubmitting(false)
                }
            } catch (e) {
            }
        }, 2000)

        return () => {
            clearInterval(stepTimer)
            clearInterval(pollInterval)
        }
    }, [submitting, createdServer?.id, isProvisioned])

    const computedServerName = serverName.trim() || 'vps-instance-1'
    const rawPrefix = (hostnamePrefix.trim() || serverName.trim() || 'vps-instance-1').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const computedFullHostname = `${rawPrefix}.vertex-vms.host`

    const selectedPlan = plans.find(p => p.id === selectedPlanId)
    const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[0]
    const userCredits = user?.credits ?? 0
    const rawPrice = selectedPlan?.price ?? 0
    const finalPrice = isYearly ? Math.round(rawPrice * 12 * 0.85) : rawPrice

    const handleDeploy = async () => {
        if (!selectedPlan || !selectedNode) {
            setError('Please select a hardware plan and target node.')
            return
        }
        if (userCredits < finalPrice) {
            setError(`Insufficient BOLTs balance. Required: ${finalPrice.toFixed(2)}, Available: ${userCredits.toFixed(2)}.`)
            return
        }
        if (!rootPassword || rootPassword.length < 8) {
            setError('Root password must be at least 8 characters.')
            return
        }

        const effectiveTemplate = installPterodactyl && ubuntu2204Template ? ubuntu2204Template : selectedTemplate
        if (!effectiveTemplate) {
            setError('No suitable OS template found. Please select an OS or contact support.')
            return
        }

        setSubmitting(true)
        setError(null)
        setProvisionStep(0)
        setIsProvisioned(false)

        try {
            const res = await http.post('/api/client/deploy', {
                plan_id: selectedPlan.id,
                node_id: selectedNode.id,
                template_uuid: effectiveTemplate.uuid,
                name: computedServerName,
                hostname: computedFullHostname,
                account_password: rootPassword,
                start_on_completion: startOnCompletion,
                ...(installPterodactyl && appInstallEnabled ? {
                    install_pterodactyl: true,
                    cf_tunnel_token: pteroCfToken.trim(),
                    panel_fqdn: pteroPanelFqdn.trim().replace(/^https?:\/\//, ''),
                    wings_fqdn: pteroWingsFqdn.trim().replace(/^https?:\/\//, ''),
                    admin_email: pteroAdminEmail.trim(),
                    admin_username: pteroAdminUsername.trim(),
                    admin_firstname: pteroAdminFirstname.trim(),
                    admin_lastname: pteroAdminLastname.trim(),
                } : {}),
            })

            if (res.data.user_credits !== undefined) updateCredits(res.data.user_credits)

            // If Pterodactyl was requested, navigate to the install status tracker
            if (installPterodactyl && appInstallEnabled && res.data.ptero_deploy_id) {
                onClose()
                navigate(`/deploy/pterodactyl/${res.data.ptero_deploy_id}`)
                return
            }

            if (res.data.server) {
                setCreatedServer({
                    id: res.data.server.id,
                    name: res.data.server.name,
                })
            }
            onSuccess()
        } catch (e: any) {
            setError(e.response?.data?.message || 'Failed to deploy server instance.')
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
                modal: {
                    backgroundColor: '#000000',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0px 0px 80px 0px rgba(9, 0, 255, 0.3)',
                    overflow: 'hidden',
                },
                inner: {
                    overflow: 'hidden',
                    padding: 0,
                },
                body: {
                    overflow: 'hidden',
                    padding: 0,
                },
                overlay: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(16px)',
                },
            }}
        >
            <div className='relative bg-black min-h-[620px] overflow-hidden text-white rounded-[24px]' ref={modalRef}>
                <style>{`
                    .custom-vps-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .custom-vps-scrollbar::-webkit-scrollbar-track {
                        background: rgba(0, 0, 0, 0.25);
                        border-radius: 9999px;
                    }
                    .custom-vps-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(59, 130, 246, 0.4);
                        border-radius: 9999px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    .custom-vps-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(59, 130, 246, 0.75);
                    }
                `}</style>

                <div className='absolute top-0 left-0 right-0 h-96 w-full overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] pointer-events-none z-0'>
                    <SparklesComp
                        id='vps-modal-sparkles'
                        density={1800}
                        direction='bottom'
                        speed={1}
                        color='#FFFFFF'
                        className='absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]'
                    />
                </div>

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

                <div
                    className='absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none'
                    style={{
                        backgroundImage: `radial-gradient(circle at center, #206ce8 0%, transparent 70%)`,
                        opacity: 0.5,
                        mixBlendMode: 'multiply',
                    }}
                />

                <div className='relative z-10 px-5 pt-3 pb-6 sm:px-7 sm:pt-4 sm:pb-6 flex flex-col justify-between min-h-[620px]'>
                    <div>
                        <div className='flex items-center justify-end mb-1'>
                            <button
                                type='button'
                                onClick={onClose}
                                className='group w-8 h-8 rounded-full bg-neutral-900/60 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 text-gray-400 hover:text-white backdrop-blur-md shadow-md transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95'
                                aria-label='Close modal'
                            >
                                <XMarkIcon className='w-4 h-4 text-gray-300 group-hover:text-white transition-transform duration-200 group-hover:rotate-90' />
                            </button>
                        </div>

                        <div className='text-center max-w-xl mx-auto mt-0 mb-2 space-y-1'>
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

                        <StepPillSwitch currentStep={step} onSelectStep={goToStep} appInstallEnabled={appInstallEnabled} />
                    </div>

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

                    <div className='relative mt-2 mb-3 flex-1 flex flex-col justify-center'>
                        <LoadingOverlay visible={loading} radius='lg' />

                        <AnimatePresence>
                            {submitting && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    className='absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-blue-950/90 via-neutral-950/80 to-blue-950/90 backdrop-blur-xl px-6 py-6 text-center rounded-2xl border border-blue-500/20 shadow-xl'
                                >
                                    {!isProvisioned ? (
                                        <div className='flex flex-col items-center justify-center gap-4 w-full my-auto'>
                                            <div className='space-y-1.5 max-w-sm'>
                                                <h3 className='text-lg sm:text-xl font-bold text-white tracking-wide flex items-center justify-center gap-2'>
                                                    <SparklesIcon className='w-5 h-5 text-blue-400 animate-pulse' />
                                                    Provisioning VPS Instance...
                                                </h3>
                                                <p className='text-xs text-gray-400'>
                                                    Executing Horizon jobs on <span className='text-blue-400 font-semibold'>{selectedNode?.name}</span>
                                                </p>
                                            </div>

                                            <OnboardCard
                                                duration={2500}
                                                currentStep={provisionStep}
                                                isCompletedAll={isProvisioned}
                                            />
                                        </div>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0, y: 15 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4 }}
                                            className='flex flex-col items-center justify-center h-full max-w-md w-full my-auto py-1 space-y-3'
                                        >
                                            <div className='space-y-1 text-center shrink-0'>
                                                <div className='w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-500/30'>
                                                    <CheckCircleIcon className='w-5 h-5' />
                                                </div>
                                                <h3 className='text-lg font-bold text-white tracking-tight'>
                                                    Server Instance Online!
                                                </h3>
                                                <p className='text-xs text-gray-300 max-w-xs mx-auto leading-relaxed'>
                                                    <span className='font-bold text-emerald-400'>{serverName}</span> has been successfully provisioned and booted on <span className='text-blue-400 font-semibold'>{selectedNode?.name}</span>.
                                                </p>
                                            </div>

                                            <div className='w-full shrink-0'>
                                                <OnboardCard isCompletedAll={true} />
                                            </div>

                                            <div className='flex items-center justify-center gap-3 pt-1 shrink-0'>
                                                <button
                                                    type='button'
                                                    onClick={() => {
                                                        setSubmitting(false)
                                                        setIsProvisioned(false)
                                                        onClose()
                                                    }}
                                                    className='py-2.5 px-6 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 text-gray-300 hover:text-white font-bold text-xs cursor-pointer transition shadow-md'
                                                >
                                                    OK
                                                </button>
                                                <button
                                                    type='button'
                                                    onClick={() => {
                                                        const targetId = createdServer?.id
                                                        setSubmitting(false)
                                                        setIsProvisioned(false)
                                                        onClose()
                                                        if (targetId) {
                                                            navigate(`/servers/${targetId}`)
                                                        }
                                                    }}
                                                    className='py-2.5 px-7 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-800/50 border border-blue-400 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95'
                                                >
                                                    Manage Server <ArrowRightIcon className='w-4 h-4' />
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

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
                                {step === 1 && (
                                    <div className='space-y-4 max-w-4xl mx-auto'>
                                        <div>
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
                                                                        <BoltSvgIcon className='w-5 h-5 text-amber-400 shrink-0' />
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
                                        </div>

                                        <div className='flex justify-end pt-2 pb-4'>
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

                                {step === 2 && (
                                    <div className='space-y-5 max-w-3xl mx-auto'>
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
                                                            onClick={() => {
                                                                setSelectedNodeId(node.id)
                                                                // Switch to valid template for new node if current selection belongs elsewhere
                                                                const validForNode = templates.filter(t => t.node_id === null || t.node_id === node.id)
                                                                if (validForNode.length > 0 && !validForNode.some(t => t.id === selectedTemplateId)) {
                                                                    setSelectedTemplateId(validForNode[0].id)
                                                                }
                                                            }}
                                                            className={cn(
                                                                'p-4 cursor-pointer transition-all duration-200 text-white border-neutral-800 flex items-center justify-between',
                                                                isSelected
                                                                    ? 'bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border-blue-500 shadow-[0px_0px_20px_0px_#0900ff] ring-1 ring-blue-500/50'
                                                                    : 'bg-neutral-900/60 hover:bg-neutral-800/80 hover:border-neutral-700'
                                                            )}
                                                        >
                                                            <div className='flex items-center gap-3'>
                                                                <img src={node.flag} alt={node.name} className='w-6 h-4 rounded-sm object-cover shrink-0' />
                                                                <div className='text-xs font-bold text-white flex items-center gap-2'>
                                                                    {node.name}
                                                                    <span className='text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/30 font-semibold'>
                                                                        Online
                                                                    </span>
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
                                                onClick={() => goToStep(appInstallEnabled ? 3 : 4)}
                                                className='py-2.5 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95'
                                            >
                                                {appInstallEnabled ? 'Next: Apps' : 'Next: Credentials'} <ArrowRightIcon className='w-4 h-4' />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 3 && (
                                    <div className='space-y-5 max-w-3xl mx-auto'>
                                        <h3 className='text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2'>
                                            <CubeTransparentIcon className='w-4 h-4 text-violet-400' />
                                            Optional Apps to Install
                                        </h3>

                                        <div
                                            onClick={() => {
                                                setInstallPterodactyl(v => !v)
                                                setPteroOsWarningAccepted(false)
                                            }}
                                            className={cn(
                                                'relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 flex items-start gap-4',
                                                installPterodactyl
                                                    ? 'bg-violet-900/20 border-violet-500/60 shadow-[0px_0px_20px_0px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/40'
                                                    : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-600'
                                            )}
                                        >
                                            <div className='w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0'>
                                                <svg viewBox='0 0 40 40' className='w-6 h-6 text-violet-400' fill='currentColor'>
                                                    <path d='M20 4C11.163 4 4 11.163 4 20s7.163 16 16 16 16-7.163 16-16S28.837 4 20 4zm0 6c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4zm0 22.4c-3.333 0-6.293-1.627-8.133-4.133C11.907 25.973 15.787 24 20 24s8.093 1.973 8.133 4.267C26.293 30.773 23.333 32.4 20 32.4z'/>
                                                </svg>
                                            </div>
                                            <div className='flex-1 min-w-0'>
                                                <div className='flex items-center justify-between gap-2'>
                                                    <span className='text-sm font-bold text-white'>Pterodactyl Panel + Wings</span>
                                                    <div className={cn(
                                                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                                                        installPterodactyl ? 'bg-violet-500 border-violet-500' : 'border-neutral-600 bg-transparent'
                                                    )}>
                                                        {installPterodactyl && <CheckCircleIcon className='w-3.5 h-3.5 text-white' />}
                                                    </div>
                                                </div>
                                                <p className='text-xs text-gray-400 mt-1 leading-relaxed'>
                                                    Full auto-install of Pterodactyl Panel, Wings daemon, Docker, MariaDB, PHP 8.3 and cloudflared.
                                                    Requires a Cloudflare Tunnel token. No IPv4 needed.
                                                </p>
                                                <div className='flex items-center gap-2 mt-2'>
                                                    <span className='text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/30 font-semibold'>Free</span>
                                                    <span className='text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/30 font-semibold'>Requires Ubuntu 22.04</span>
                                                    <span className='text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30 font-semibold'>~15 min setup</span>
                                                </div>
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {installPterodactyl && pteroNeedsOsSwitch && !pteroOsWarningAccepted && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -8 }}
                                                    className='flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4'
                                                >
                                                    <ExclamationTriangleIcon className='w-5 h-5 text-amber-400 shrink-0 mt-0.5' />
                                                    <div className='flex-1 min-w-0'>
                                                        <p className='text-xs font-bold text-amber-300 mb-1'>OS will be switched to Ubuntu 22.04</p>
                                                        <p className='text-xs text-amber-200/80 leading-relaxed'>
                                                            You selected <strong className='text-white'>{selectedTemplate?.name ?? 'a different OS'}</strong>.
                                                            The Pterodactyl installer requires <strong className='text-white'>Ubuntu 22.04</strong>.
                                                            Your VM will be deployed with Ubuntu 22.04 instead.
                                                        </p>
                                                        <div className='flex gap-2 mt-3'>
                                                            <button
                                                                type='button'
                                                                onClick={e => { e.stopPropagation(); setPteroOsWarningAccepted(true) }}
                                                                className='text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 transition cursor-pointer'
                                                            >
                                                                Yes, switch to Ubuntu 22.04
                                                            </button>
                                                            <button
                                                                type='button'
                                                                onClick={e => { e.stopPropagation(); setInstallPterodactyl(false) }}
                                                                className='text-xs font-bold px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-gray-300 transition cursor-pointer'
                                                            >
                                                                No, deselect Pterodactyl
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <AnimatePresence>
                                            {installPterodactyl && (!pteroNeedsOsSwitch || pteroOsWarningAccepted) && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className='overflow-hidden'
                                                >
                                                    <div className='rounded-xl border border-violet-500/20 bg-violet-950/20 p-4 space-y-4'>
                                                        <h4 className='text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-2'>
                                                            <CubeTransparentIcon className='w-3.5 h-3.5' />
                                                            Pterodactyl Configuration
                                                            <span className='text-[10px] text-rose-400 font-semibold normal-case tracking-normal ml-auto'>All fields required</span>
                                                        </h4>

                                                        <div className='space-y-1'>
                                                            <label className='block text-[10px] font-bold uppercase tracking-wider text-gray-400'>
                                                                Cloudflare Tunnel Token <span className='text-rose-400'>*</span>
                                                            </label>
                                                            <div className='relative'>
                                                                <input
                                                                    type={pteroShowToken ? 'text' : 'password'}
                                                                    value={pteroCfToken}
                                                                    onChange={e => setPteroCfToken(e.target.value)}
                                                                    placeholder='eyJhIjoiY...'
                                                                    className='w-full px-4 pr-12 py-2.5 rounded-xl border border-neutral-700 bg-black/60 text-white font-mono text-xs focus:outline-none focus:border-violet-500 transition'
                                                                />
                                                                <button
                                                                    type='button'
                                                                    onClick={() => setPteroShowToken(v => !v)}
                                                                    className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition cursor-pointer'
                                                                >
                                                                    {pteroShowToken ? <EyeSlashIcon className='w-4 h-4' /> : <EyeIcon className='w-4 h-4' />}
                                                                </button>
                                                            </div>
                                                            <p className='text-[10px] text-gray-500'>Zero Trust → Tunnels → Create tunnel → copy the token</p>
                                                        </div>

                                                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                                                            {[
                                                                { label: 'Panel Domain', value: pteroPanelFqdn, onChange: setPteroPanelFqdn, placeholder: 'panel.yourdomain.com', hint: 'No https://' },
                                                                { label: 'Wings Domain', value: pteroWingsFqdn, onChange: setPteroWingsFqdn, placeholder: 'wings.yourdomain.com', hint: 'Separate subdomain for Wings' },
                                                                { label: 'Admin Email', value: pteroAdminEmail, onChange: setPteroAdminEmail, placeholder: 'admin@example.com', hint: '' },
                                                                { label: 'Admin Username', value: pteroAdminUsername, onChange: setPteroAdminUsername, placeholder: 'admin', hint: 'Alphanumeric only' },
                                                                { label: 'First Name', value: pteroAdminFirstname, onChange: setPteroAdminFirstname, placeholder: 'Alex', hint: '' },
                                                                { label: 'Last Name', value: pteroAdminLastname, onChange: setPteroAdminLastname, placeholder: 'Smith', hint: '' },
                                                            ].map(field => (
                                                                <div key={field.label} className='space-y-1'>
                                                                    <label className='block text-[10px] font-bold uppercase tracking-wider text-gray-400'>
                                                                        {field.label} <span className='text-rose-400'>*</span>
                                                                    </label>
                                                                    <input
                                                                        type='text'
                                                                        value={field.value}
                                                                        onChange={e => field.onChange(e.target.value)}
                                                                        placeholder={field.placeholder}
                                                                        className='w-full px-4 py-2.5 rounded-xl border border-neutral-700 bg-black/60 text-white text-xs focus:outline-none focus:border-violet-500 transition'
                                                                    />
                                                                    {field.hint && <p className='text-[10px] text-gray-500'>{field.hint}</p>}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className={cn(
                                                            'flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors',
                                                            pterodactylFormComplete
                                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                                        )}>
                                                            {pterodactylFormComplete
                                                                ? <><CheckCircleIcon className='w-4 h-4 shrink-0' /> All fields complete — ready to proceed</>  
                                                                : <><ExclamationTriangleIcon className='w-4 h-4 shrink-0' /> Fill all fields above before proceeding</>}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

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
                                                disabled={!pterodactylFormComplete}
                                                title={!pterodactylFormComplete ? 'Complete or deselect Pterodactyl to proceed' : undefined}
                                                className='py-2.5 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
                                            >
                                                Next: Credentials <ArrowRightIcon className='w-4 h-4' />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── STEP 4: Credentials ── */}
                                {step === 4 && (
                                    <div className='space-y-5 max-w-2xl mx-auto'>
                                        <h3 className='text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2'>
                                            <PasswordIcon className='w-4 h-4 text-amber-400' />
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
                                                        placeholder='vps-instance-1'
                                                    />
                                                </div>
                                                <div>
                                                    <label className='block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5'>Hostname FQDN</label>
                                                    <div className='flex items-center w-full'>
                                                        <input
                                                            type='text'
                                                            value={hostnamePrefix}
                                                            onChange={e => setHostnamePrefix(e.target.value)}
                                                            className='w-full px-3.5 py-2.5 rounded-l-xl border border-r-0 border-neutral-700 bg-black/60 text-white font-mono text-[11px] focus:outline-none focus:border-blue-500 transition'
                                                            placeholder='vps-instance-1'
                                                        />
                                                        <div className='px-3.5 py-2.5 rounded-r-xl border border-neutral-700 bg-neutral-800/90 text-blue-400 font-mono text-[11px] font-bold shrink-0 select-none flex items-center shadow-inner tracking-tight'>
                                                            .vertex-vms.host
                                                        </div>
                                                    </div>
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
                                                onClick={() => goToStep(appInstallEnabled ? 3 : 2)}
                                                className='py-2.5 px-5 rounded-xl bg-neutral-900 border border-neutral-800 text-gray-300 hover:text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition'
                                            >
                                                <ArrowLeftIcon className='w-4 h-4' /> Back
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => goToStep(5)}
                                                className='py-2.5 px-6 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95'
                                            >
                                                Review & Confirm <ArrowRightIcon className='w-4 h-4' />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── STEP 5: Review & Deploy ── */}
                                {step === 5 && selectedPlan && (
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
                                                    <h3 className='text-xl font-bold text-white'>{computedServerName}</h3>
                                                    <p className='text-xs text-gray-400 font-mono mt-0.5'>{computedFullHostname}</p>
                                                </div>
                                                <div className='ml-auto flex flex-col items-end gap-1'>
                                                    <span className='px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30'>
                                                        {selectedTemplate?.name}
                                                    </span>
                                                    {installPterodactyl && appInstallEnabled && (
                                                        <span className='px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1'>
                                                            <ServerStackIcon className='w-3 h-3' /> Pterodactyl
                                                        </span>
                                                    )}
                                                </div>
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
                                            {installPterodactyl && appInstallEnabled && (
                                                <div className='flex items-center justify-between border-t border-neutral-800/80 pt-2 text-violet-400'>
                                                    <span className='text-xs flex items-center gap-1.5 font-semibold'>
                                                        <CubeTransparentIcon className='w-4 h-4' />
                                                        Pterodactyl Panel + Wings
                                                    </span>
                                                    <span className='text-xs font-mono font-bold text-violet-300'>Included</span>
                                                </div>
                                            )}

                                            <div className='flex items-center justify-between bg-black/50 border border-neutral-800 rounded-xl p-3 text-xs'>
                                                <span className='text-gray-400 font-medium'>Calculated Cost</span>
                                                <span className='font-bold text-amber-400 flex items-center gap-1 text-sm'>
                                                    <BoltSvgIcon className='w-4 h-4 text-amber-400 shrink-0' />
                                                    <NumberFlow value={finalPrice} /> BOLTs/{isYearly ? 'year' : 'month'}
                                                </span>
                                            </div>
                                        </Card>

                                        {/* Deployment Action Bar */}
                                        <div className='flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800'>
                                            <div>
                                                <span className='text-[10px] text-gray-400 font-bold uppercase block'>Available Credits</span>
                                                <span className='text-sm font-bold text-white flex items-center gap-1 mt-0.5'>
                                                    <BoltSvgIcon className='w-4 h-4 text-amber-400 shrink-0' />
                                                    {userCredits.toFixed(2)} BOLTs
                                                </span>
                                            </div>

                                            <div className='flex items-center gap-3'>
                                                <button
                                                    type='button'
                                                    onClick={() => goToStep(4)}
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
