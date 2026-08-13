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
    { num: 3, label: '3. Credentials' },
    { num: 4, label: '4. Review & Launch' },
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
                    const fetchedPlans = (res.data.plans && res.data.plans.length > 0) ? res.data.plans : [
                        { id: 1, name: 'KVM Starter', ram: 1024, cpu: 1, disk: 25, price: 5.00, description: 'Ideal for micro services, web hosting, and lightweight bots.' },
                        { id: 2, name: 'KVM Pro', ram: 4096, cpu: 2, disk: 50, price: 15.00, description: 'High performance dual-core server for production applications.' },
                        { id: 3, name: 'KVM Enterprise', ram: 8192, cpu: 4, disk: 100, price: 30.00, description: 'Dedicated quad-core performance for resource intensive workloads.' }
                    ]
                    setPlans(fetchedPlans)
                    if (fetchedPlans.length > 0) setSelectedPlanId(fetchedPlans[0].id)

                    const fetchedNodes = (res.data.nodes && res.data.nodes.length > 0) ? res.data.nodes : [
                        { id: 1, name: 'Node 1 (US-East)', fqdn: 'node1.vertexnodes.net', cluster: 'cluster-1', location_id: 1, location_code: 'US', location_name: 'North America (US East)', flag: 'https://flagcdn.com/w40/us.png' }
                    ]
                    setNodes(fetchedNodes)
                    if (fetchedNodes.length > 0) setSelectedNodeId(fetchedNodes[0].id)

                    const fetchedTemplates = (res.data.templates && res.data.templates.length > 0) ? res.data.templates : [
                        { id: 1, uuid: 'ubuntu-22-04-lts', name: 'Ubuntu 22.04 LTS', node_id: null, category: 'Linux', icon_svg: 'data:image/svg+xml;utf8,%3Csvg%20role%3D%22img%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ctitle%3EUbuntu%3C%2Ftitle%3E%3Cpath%20d%3D%22M17.61.455a3.41%203.41%200%200%200-3.41%203.41%203.41%203.41%200%200%200%203.41%203.41%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41zM12.92.8C8.923.777%205.137%202.941%203.148%206.451a4.5%204.5%200%200%201%20.26-.007%204.92%204.92%200%200%201%202.585.737A8.316%208.316%200%200%201%2012.688%203.6%204.944%204.944%200%200%201%2013.723.834%2011.008%2011.008%200%200%200%2012.92.8zm9.226%204.994a4.915%204.915%200%200%201-1.918%202.246%208.36%208.36%200%200%201-.273%208.303%204.89%204.89%200%200%201%201.632%202.54%2011.156%2011.156%200%200%200%20.559-13.089zM3.41%207.932A3.41%203.41%200%200%200%200%2011.342a3.41%203.41%200%200%200%203.41%203.409%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41zm2.027%207.866a4.908%204.908%200%200%201-2.915.358%2011.1%2011.1%200%200%200%207.991%206.698%2011.234%2011.234%200%200%200%202.422.249%204.879%204.879%200%200%201-.999-2.85%208.484%208.484%200%200%201-.836-.136%208.304%208.304%200%200%201-5.663-4.32zm11.405.928a3.41%203.41%200%200%200-3.41%203.41%203.41%203.41%200%200%200%203.41%203.41%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41z%22%20fill%3D%22%23E95420%22%2F%3E%3C%2Fsvg%3E', description: 'Ubuntu 22.04 LTS' },
                        { id: 2, uuid: 'debian-12', name: 'Debian 12 (Bookworm)', node_id: null, category: 'Linux', icon_svg: 'data:image/svg+xml;utf8,%3Csvg%20role%3D%22img%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ctitle%3EDebian%3C%2Ftitle%3E%3Cpath%20d%3D%22M13.88%2012.685c-.4%200%20.08.2.601.28.14-.1.27-.22.39-.33a3.001%203.001%200%2001-.99.05m2.14-.53c.23-.33.4-.69.47-1.06-.06.27-.2.5-.33.73-.75.47-.07-.27%200-.56-.8%201.01-.11.6-.14.89m.781-2.05c.05-.721-.14-.501-.2-.221.07.04.13.5.2.22M12.38.31c.2.04.45.07.42.12.23-.05.28-.1-.43-.12m.43.12l-.15.03.14-.01V.43m6.633%209.944c.02.64-.2.95-.38%201.5l-.35.181c-.28.54.03.35-.17.78-.44.39-1.34%201.22-1.62%201.301-.201%200%20.14-.25.19-.34-.591.4-.481.6-1.371.85l-.03-.06c-2.221%201.04-5.303-1.02-5.253-3.842-.03.17-.07.13-.12.2a3.551%203.552%200%20012.001-3.501%203.361%203.362%200%20013.732.48%203.341%203.342%200%2000-2.721-1.3c-1.18.01-2.281.76-2.651%201.57-.6.38-.67%201.47-.93%201.661-.361%202.601.66%203.722%202.38%205.042.27.19.08.21.12.35a4.702%204.702%200%2001-1.53-1.16c.23.33.47.66.8.91-.55-.18-1.27-1.3-1.48-1.35.93%201.66%203.78%202.921%205.261%202.3a6.203%206.203%200%2001-2.33-.28c-.33-.16-.77-.51-.7-.57a5.802%205.803%200%20005.902-.84c.44-.35.93-.94%201.07-.95-.2.32.04.16-.12.44.44-.72-.2-.3.46-1.24l.24.33c-.09-.6.74-1.321.66-2.262.19-.3.2.3%200%20.97.29-.74.08-.85.15-1.46.08.2.18.42.23.63-.18-.7.2-1.2.28-1.6-.09-.05-.28.3-.32-.53%200-.37.1-.2.14-.28-.08-.05-.26-.32-.38-.861.08-.13.22.33.34.34-.08-.42-.2-.75-.2-1.08-.34-.68-.12.1-.4-.3-.34-1.091.3-.25.34-.74.54.77.84%201.96.981%202.46-.1-.6-.28-1.2-.49-1.76.16.07-.26-1.241.21-.37A7.823%207.824%200%200017.702%201.6c.18.17.42.39.33.42-.75-.45-.62-.48-.73-.67-.61-.25-.65.02-1.06%200C15.082.73%2014.862.8%2013.8.4l.05.23c-.77-.25-.9.1-1.73%200-.05-.04.27-.14.53-.18-.741.1-.701-.14-1.431.03.17-.13.36-.21.55-.32-.6.04-1.44.35-1.18.07C9.6.68%207.847%201.3%206.867%202.22L6.838%202c-.45.54-1.96%201.611-2.08%202.311l-.131.03c-.23.4-.38.85-.57%201.261-.3.52-.45.2-.4.28-.6%201.22-.9%202.251-1.16%203.102.18.27%200%201.65.07%202.76-.3%205.463%203.84%2010.776%208.363%2012.006.67.23%201.65.23%202.49.25-.99-.28-1.12-.15-2.08-.49-.7-.32-.85-.7-1.34-1.13l.2.35c-.971-.34-.57-.42-1.361-.67l.21-.27c-.31-.03-.83-.53-.97-.81l-.34.01c-.41-.501-.63-.871-.61-1.161l-.111.2c-.13-.21-1.52-1.901-.8-1.511-.13-.12-.31-.2-.5-.55l.14-.17c-.35-.44-.64-1.02-.62-1.2.2.24.32.3.45.33-.88-2.172-.93-.12-1.601-2.202l.15-.02c-.1-.16-.18-.34-.26-.51l.06-.6c-.63-.74-.18-3.102-.09-4.402.07-.54.53-1.1.88-1.981l-.21-.04c.4-.71%202.341-2.872%203.241-2.761.43-.55-.09%200-.18-.14.96-.991%201.26-.7%201.901-.88.7-.401-.6.16-.27-.151%201.2-.3.85-.7%202.421-.85.16.1-.39.14-.52.26%201-.49%203.151-.37%204.562.27%201.63.77%203.461%203.011%203.531%205.132l.08.02c-.04.85.13%201.821-.17%202.711l.2-.42M9.54%2013.236l-.05.28c.26.35.47.73.8%201.01-.24-.47-.42-.66-.75-1.3m.62-.02c-.14-.15-.22-.34-.31-.52.08.32.26.6.43.88l-.12-.36m10.945-2.382l-.07.15c-.1.76-.34%201.511-.69%202.212.4-.73.65-1.541.75-2.362M12.45.12c.27-.1.66-.05.95-.12-.37.03-.74.05-1.1.1l.15.02M3.006%205.142c.07.57-.43.8.11.42.3-.66-.11-.18-.1-.42m-.64%202.661c.12-.39.15-.62.2-.84-.35.44-.17.53-.2.83%22%20fill%3D%22%23A80030%22%2F%3E%3C%2Fsvg%3E', description: 'Debian 12 (Bookworm)' },
                        { id: 3, uuid: 'almalinux-9', name: 'AlmaLinux 9', node_id: null, category: 'Linux', icon_svg: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/centos/centos-original.svg', description: 'AlmaLinux 9' }
                    ]
                    setTemplates(fetchedTemplates)
                    if (fetchedTemplates.length > 0) setSelectedTemplateId(fetchedTemplates[0].id)
                })
                .catch(err => {
                    console.error(err)
                    setPlans([
                        { id: 1, name: 'KVM Starter', ram: 1024, cpu: 1, disk: 25, price: 5.00, description: 'Ideal for micro services, web hosting, and lightweight bots.' },
                        { id: 2, name: 'KVM Pro', ram: 4096, cpu: 2, disk: 50, price: 15.00, description: 'High performance dual-core server for production applications.' },
                        { id: 3, name: 'KVM Enterprise', ram: 8192, cpu: 4, disk: 100, price: 30.00, description: 'Dedicated quad-core performance for resource intensive workloads.' }
                    ])
                    setSelectedPlanId(1)

                    setNodes([
                        { id: 1, name: 'Node 1 (US-East)', fqdn: 'node1.vertexnodes.net', cluster: 'cluster-1', location_id: 1, location_code: 'US', location_name: 'North America (US East)', flag: 'https://flagcdn.com/w40/us.png' }
                    ])
                    setSelectedNodeId(1)

                    setTemplates([
                        { id: 1, uuid: 'ubuntu-22-04-lts', name: 'Ubuntu 22.04 LTS', node_id: null, category: 'Linux', icon_svg: 'data:image/svg+xml;utf8,%3Csvg%20role%3D%22img%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ctitle%3EUbuntu%3C%2Ftitle%3E%3Cpath%20d%3D%22M17.61.455a3.41%203.41%200%200%200-3.41%203.41%203.41%203.41%200%200%200%203.41%203.41%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41zM12.92.8C8.923.777%205.137%202.941%203.148%206.451a4.5%204.5%200%200%201%20.26-.007%204.92%204.92%200%200%201%202.585.737A8.316%208.316%200%200%201%2012.688%203.6%204.944%204.944%200%200%201%2013.723.834%2011.008%2011.008%200%200%200%2012.92.8zm9.226%204.994a4.915%204.915%200%200%201-1.918%202.246%208.36%208.36%200%200%201-.273%208.303%204.89%204.89%200%200%201%201.632%202.54%2011.156%2011.156%200%200%200%20.559-13.089zM3.41%207.932A3.41%203.41%200%200%200%200%2011.342a3.41%203.41%200%200%200%203.41%203.409%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41zm2.027%207.866a4.908%204.908%200%200%201-2.915.358%2011.1%2011.1%200%200%200%207.991%206.698%2011.234%2011.234%200%200%200%202.422.249%204.879%204.879%200%200%201-.999-2.85%208.484%208.484%200%200%201-.836-.136%208.304%208.304%200%200%201-5.663-4.32zm11.405.928a3.41%203.41%200%200%200-3.41%203.41%203.41%203.41%200%200%200%203.41%203.41%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41z%22%20fill%3D%22%23E95420%22%2F%3E%3C%2Fsvg%3E', description: 'Ubuntu 22.04 LTS' }
                    ])
                    setSelectedTemplateId(1)
                })
                .finally(() => setLoading(false))
        }
    }, [opened])

    const goToStep = (next: number) => {
        setDir(next > step ? 1 : -1)
        setStep(next)
    }

    // Real backend Horizon job polling with steady step progression
    useEffect(() => {
        if (!submitting || !createdServer?.id || isProvisioned) return

        let currentStepIdx = 0
        let backendReady = false

        // Ticks steps smoothly every 3.2 seconds so progress is unhurried and clear
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

        // Polls backend status to confirm hypervisor completion
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
                // Ignore transient network poll errors
            }
        }, 2000)

        return () => {
            clearInterval(stepTimer)
            clearInterval(pollInterval)
        }
    }, [submitting, createdServer?.id, isProvisioned])

    const handleServerNameChange = (val: string) => {
        setServerName(val)
    }

    const computedServerName = serverName.trim() || 'vps-instance-1'
    const rawPrefix = (hostnamePrefix.trim() || serverName.trim() || 'vps-instance-1').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const computedFullHostname = `${rawPrefix}.vertex-vms.host`

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
        if (!rootPassword || rootPassword.length < 8) {
            setError('Root password must be at least 8 characters.')
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
                template_uuid: selectedTemplate.uuid,
                name: computedServerName,
                hostname: computedFullHostname,
                account_password: rootPassword,
                start_on_completion: startOnCompletion,
            })

            if (res.data.user_credits !== undefined) updateCredits(res.data.user_credits)
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
            {/* ── Outer wrapper with 100% pricing-section-4 background & atmospheric elements ── */}
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

                {/* 1. Sparkles Top Layer */}
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
                <div className='relative z-10 px-5 pt-3 pb-6 sm:px-7 sm:pt-4 sm:pb-6 flex flex-col justify-between min-h-[620px]'>

                    {/* Modal Close Button & Title Section */}
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

                        {/* Title using VerticalCutReveal */}
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

                                {/* ── STEP 1: Hardware Plans ── */}
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
                                                    <h3 className='text-xl font-bold text-white'>{computedServerName}</h3>
                                                    <p className='text-xs text-gray-400 font-mono mt-0.5'>{computedFullHostname}</p>
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
