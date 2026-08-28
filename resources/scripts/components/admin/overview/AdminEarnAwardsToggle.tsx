import React, { useEffect, useState } from 'react'
import {
    GiftIcon,
    CheckCircleIcon,
    XCircleIcon,
    ChatBubbleLeftRightIcon,
    UserGroupIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline'
import DiscordBoostIcon from '@/components/elements/DiscordBoostIcon'
import { BoltSvgIcon } from '@/components/elements/BoltSvgIcon'
import { Switch } from '@mantine/core'
import http from '@/api/http'

interface AwardTask {
    key: string
    title: string
    category: 'invites' | 'boosts' | 'messages'
    requirement_text: string
    target_count: number
    reward_bolts: number
}

interface EarnAwardsSettings {
    invites_enabled: boolean
    boosts_enabled: boolean
    messages_enabled: boolean
    disabled_tasks: string[]
    available_tasks: AwardTask[]
}

export const AdminEarnAwardsToggle: React.FC = () => {
    const [settings, setSettings] = useState<EarnAwardsSettings>({
        invites_enabled: true,
        boosts_enabled: true,
        messages_enabled: true,
        disabled_tasks: [],
        available_tasks: [],
    })
    const [loading, setLoading] = useState<boolean>(true)
    const [saving, setSaving] = useState<boolean>(false)
    const [savedNotice, setSavedNotice] = useState<boolean>(false)

    const fetchSettings = async () => {
        setLoading(true)
        try {
            const res = await http.get('/api/admin/settings/earn-awards')
            if (res.data?.data) {
                setSettings(res.data.data)
            }
        } catch (err) {
            console.error('Failed to fetch earn awards settings:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    const handleCategoryToggle = async (category: 'invites' | 'boosts' | 'messages', value: boolean) => {
        const nextState = {
            ...settings,
            [`${category}_enabled`]: value,
        }
        setSettings(nextState)
        await persistSettings(nextState)
    }

    const handleTaskToggle = async (taskKey: string, isEnabled: boolean) => {
        let updatedDisabled = [...settings.disabled_tasks]
        if (isEnabled) {
            // Remove from disabled list
            updatedDisabled = updatedDisabled.filter(k => k !== taskKey)
        } else {
            // Add to disabled list
            if (!updatedDisabled.includes(taskKey)) {
                updatedDisabled.push(taskKey)
            }
        }

        const nextState = {
            ...settings,
            disabled_tasks: updatedDisabled,
        }
        setSettings(nextState)
        await persistSettings(nextState)
    }

    const persistSettings = async (stateToSave: EarnAwardsSettings) => {
        setSaving(true)
        try {
            const res = await http.post('/api/admin/settings/earn-awards', {
                invites_enabled: stateToSave.invites_enabled,
                boosts_enabled: stateToSave.boosts_enabled,
                messages_enabled: stateToSave.messages_enabled,
                disabled_tasks: stateToSave.disabled_tasks,
            })
            if (res.data?.success && res.data?.data) {
                setSettings(prev => ({
                    ...prev,
                    ...res.data.data,
                }))
                setSavedNotice(true)
                setTimeout(() => setSavedNotice(false), 2500)
            }
        } catch (err) {
            alert('Failed to save earn awards configuration.')
        } finally {
            setSaving(false)
        }
    }

    const categories = [
        {
            id: 'messages' as const,
            key: 'messages_enabled' as const,
            title: 'Chat Activity Awards',
            desc: 'Discord message volume & chat channel activity challenges',
            icon: <ChatBubbleLeftRightIcon className='w-5 h-5 text-indigo-400' />,
            badgeColor: 'indigo',
        },
        {
            id: 'boosts' as const,
            key: 'boosts_enabled' as const,
            title: 'Server Boost Awards',
            desc: 'Discord server nitro boosting rewards & badges',
            icon: <DiscordBoostIcon className='w-5 h-5 text-pink-400' />,
            badgeColor: 'pink',
        },
        {
            id: 'invites' as const,
            key: 'invites_enabled' as const,
            title: 'Discord Invites Awards',
            desc: 'Member recruitment & server invite verification challenges',
            icon: <UserGroupIcon className='w-5 h-5 text-blue-400' />,
            badgeColor: 'blue',
        },
    ]

    return (
        <div className='col-span-12 bg-neutral-900/70 border border-white/10 rounded-2xl p-6 shadow-xl shadow-blue-950/20 backdrop-blur-xl hover:border-white/20 transition-all font-sans mb-2'>
            {/* Header section */}
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10'>
                <div className='flex items-start gap-4'>
                    <div className='w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner'>
                        <GiftIcon className='w-6 h-6' />
                    </div>
                    <div>
                        <div className='flex items-center gap-3'>
                            <h3 className='text-lg font-bold text-white tracking-tight'>
                                /earn Community Awards & Challenges Control
                            </h3>
                            {savedNotice && (
                                <span className='px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 backdrop-blur-md animate-pulse'>
                                    <CheckCircleIcon className='w-4 h-4' /> Saved Changes!
                                </span>
                            )}
                        </div>
                        <p className='text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed'>
                            Control which award categories and individual tasks appear on the user <strong>/earn</strong> tab. Disabling a category or task instantly removes it from the user interface and blocks new claims.
                        </p>
                    </div>
                </div>
            </div>

            {/* Categories and granular tasks grid */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-5'>
                {categories.map(cat => {
                    const isCatEnabled = settings[cat.key]
                    const categoryTasks = settings.available_tasks.filter(t => t.category === cat.id)

                    return (
                        <div
                            key={cat.id}
                            className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                                isCatEnabled
                                    ? 'bg-neutral-900/80 border-white/10 hover:border-white/20'
                                    : 'bg-rose-950/15 border-rose-500/30 opacity-75'
                            }`}
                        >
                            <div>
                                {/* Category Header */}
                                <div className='flex items-start justify-between gap-3 mb-3'>
                                    <div className='flex items-center gap-2.5'>
                                        <div className='p-2 rounded-xl bg-black/40 border border-white/5'>
                                            {cat.icon}
                                        </div>
                                        <div>
                                            <h4 className='text-sm font-bold text-white'>{cat.title}</h4>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.2 rounded-full inline-block mt-0.5 ${
                                                isCatEnabled
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                            }`}>
                                                {isCatEnabled ? 'Category Active' : 'Category Disabled'}
                                            </span>
                                        </div>
                                    </div>

                                    <Switch
                                        checked={isCatEnabled}
                                        onChange={e => handleCategoryToggle(cat.id, e.currentTarget.checked)}
                                        disabled={loading || saving}
                                        color='blue'
                                        size='md'
                                    />
                                </div>

                                <p className='text-[11px] text-gray-400 mb-4 leading-relaxed'>
                                    {cat.desc}
                                </p>

                                {/* Granular Tasks list */}
                                <div className='space-y-2 pt-3 border-t border-white/5'>
                                    <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5'>
                                        Individual Award Challenges:
                                    </span>
                                    {categoryTasks.map(task => {
                                        const isTaskDisabled = settings.disabled_tasks.includes(task.key)
                                        const isTaskActive = isCatEnabled && !isTaskDisabled

                                        return (
                                            <div
                                                key={task.key}
                                                className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                                                    isTaskActive
                                                        ? 'bg-black/40 border-white/5 text-gray-200'
                                                        : 'bg-black/20 border-white/5 text-gray-500 opacity-60 line-through'
                                                }`}
                                            >
                                                <div className='min-w-0 flex-1'>
                                                    <div className='font-semibold text-white truncate text-[11px] flex items-center gap-1.5'>
                                                        <span>{task.title}</span>
                                                    </div>
                                                    <span className='text-[10px] text-amber-400 font-mono flex items-center gap-1 mt-0.5'>
                                                        <BoltSvgIcon className='w-3 h-3 text-amber-400 shrink-0' />
                                                        +{task.reward_bolts.toLocaleString()} BOLTs
                                                    </span>
                                                </div>

                                                <label className='relative inline-flex items-center cursor-pointer'>
                                                    <input
                                                        type='checkbox'
                                                        checked={!isTaskDisabled}
                                                        disabled={!isCatEnabled || loading || saving}
                                                        onChange={e => handleTaskToggle(task.key, e.target.checked)}
                                                        className='sr-only peer'
                                                    />
                                                    <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-30"></div>
                                                </label>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default AdminEarnAwardsToggle
