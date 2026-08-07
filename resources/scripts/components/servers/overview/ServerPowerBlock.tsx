import { useEffect, useState } from 'react'
import { ServerContext } from '@/state/server'
import useNotify from '@/util/useNotify'
import { useTranslation } from 'react-i18next'
import { LockClosedIcon } from '@heroicons/react/24/outline'

import updateStatus, { PowerAction } from '@/api/server/updateState'

import Button from '@/components/elements/Button'

const ServerPowerBlock = () => {
    const { t } = useTranslation('server.overview')
    const serverData = ServerContext.useStoreState(state => state.server.data)
    const uuid = serverData?.uuid
    const rawCreatedAt = (serverData as any)?.createdAt || (serverData as any)?.created_at
    const statusData = ServerContext.useStoreState(state => state.status.data)
    const state = statusData?.state
    const serverLockdown = statusData?.lockdownSecondsRemaining || 0
    const notify = useNotify()

    const [secondsLeft, setSecondsLeft] = useState<number>(0)
    const [powerLockSeconds, setPowerLockSeconds] = useState<number>(0)

    // 5-minute initial deploy boot lock
    useEffect(() => {
        if (!rawCreatedAt) return

        const calculateRemaining = () => {
            const createdMs = rawCreatedAt instanceof Date ? rawCreatedAt.getTime() : new Date(rawCreatedAt).getTime()
            if (isNaN(createdMs)) return 0
            const elapsedSeconds = Math.floor((Date.now() - createdMs) / 1000)
            return Math.max(0, 300 - elapsedSeconds)
        }

        const initial = calculateRemaining()
        setSecondsLeft(initial)

        if (initial <= 0) return

        const timer = setInterval(() => {
            const remaining = calculateRemaining()
            setSecondsLeft(remaining)
            if (remaining <= 0) {
                clearInterval(timer)
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [rawCreatedAt])

    // 30-second power action lockdown timer
    useEffect(() => {
        if (!uuid) return

        const updateLockRemaining = () => {
            const lockUntilStr = localStorage.getItem(`power_lock_until_${uuid}`)
            let localRemaining = 0
            if (lockUntilStr) {
                const lockUntil = parseInt(lockUntilStr, 10)
                if (!isNaN(lockUntil)) {
                    localRemaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000))
                }
            }

            const activeLock = Math.max(localRemaining, serverLockdown)
            setPowerLockSeconds(activeLock)
        }

        updateLockRemaining()

        const timer = setInterval(() => {
            updateLockRemaining()
        }, 1000)

        return () => clearInterval(timer)
    }, [uuid, serverLockdown])

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60)
        const s = secs % 60
        return `${m}:${s < 10 ? '0' : ''}${s}`
    }

    const triggerPowerLockout = (seconds: number = 30) => {
        if (!uuid) return
        const lockUntil = Date.now() + seconds * 1000
        localStorage.setItem(`power_lock_until_${uuid}`, String(lockUntil))
        setPowerLockSeconds(seconds)
    }

    const update = (actionState: PowerAction) => {
        const totalLock = Math.max(secondsLeft, powerLockSeconds)

        if (totalLock > 0) {
            notify({
                message: `Power actions are locked for ${totalLock} second(s) after initiating a server boot/state change to ensure system stability and proper tmate initialization.`,
                color: 'yellow',
            })
            return
        }

        // Trigger local 30s lockout immediately on initiating any power action
        triggerPowerLockout(30)

        updateStatus(uuid!, actionState)
            .then(() => {
                notify({
                    message: t('notices.power_action_sent_success'),
                    color: 'green',
                })
            })
            .catch((err: any) => {
                const backendMsg = err?.response?.data?.errors?.[0]?.detail || err?.response?.data?.message || t('notices.power_action_sent_fail')
                notify({
                    message: backendMsg,
                    color: 'red',
                })
            })
    }

    const totalLockRemaining = Math.max(secondsLeft, powerLockSeconds)
    const lockMsg = totalLockRemaining > 0 ? `Locked during boot / power state change (${formatTime(totalLockRemaining)} remaining)` : ''

    return (
        <div className='flex flex-wrap items-center justify-end gap-2 mb-3'>
            {totalLockRemaining > 0 && (
                <div
                    className='flex items-center gap-1.5 text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg shrink-0 animate-pulse'
                    title='All boot and power actions are locked for 30 seconds post-command to ensure guest agent stability and clean tmate setup.'
                >
                    <LockClosedIcon className='w-3.5 h-3.5 text-amber-400' />
                    <span>Boot Lock ({formatTime(totalLockRemaining)})</span>
                </div>
            )}
            <Button
                className='transition-colors'
                disabled={totalLockRemaining > 0 || !state || state === 'running'}
                onClick={() => update('start')}
                title={lockMsg}
            >
                {t('power_actions.start')}
            </Button>
            <Button
                className='transition-colors'
                disabled={totalLockRemaining > 0 || state !== 'running'}
                onClick={() => update('restart')}
                title={lockMsg}
            >
                {t('power_actions.restart')}
            </Button>
            <Button
                className='transition-colors'
                color='danger'
                variant='outline'
                disabled={totalLockRemaining > 0 || !state || state === 'stopped'}
                onClick={() => update('kill')}
                title={lockMsg}
            >
                {t('power_actions.kill')}
            </Button>
            <Button
                className='transition-colors'
                color='danger'
                variant='filled'
                disabled={totalLockRemaining > 0 || state !== 'running'}
                onClick={() => update('shutdown')}
                title={lockMsg}
            >
                {t('power_actions.shutdown')}
            </Button>
        </div>
    )
}

export default ServerPowerBlock