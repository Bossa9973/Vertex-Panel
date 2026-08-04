import { useEffect, useState } from 'react'
import { ServerContext } from '@/state/server'
import useNotify from '@/util/useNotify'
import { useTranslation } from 'react-i18next'
import { LockClosedIcon } from '@heroicons/react/24/outline'

import updateStatus, { PowerAction } from '@/api/server/updateState'

import Button from '@/components/elements/Button'


const ServerPowerBlock = () => {
    const { t } = useTranslation('server.overview')
    const { t: tStrings } = useTranslation('strings')
    const serverData = ServerContext.useStoreState(state => state.server.data)
    const uuid = serverData?.uuid
    const rawCreatedAt = (serverData as any)?.createdAt || (serverData as any)?.created_at
    const state = ServerContext.useStoreState(state => state.status.data?.state)
    const notify = useNotify()

    const [secondsLeft, setSecondsLeft] = useState<number>(0)

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

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60)
        const s = secs % 60
        return `${m}:${s < 10 ? '0' : ''}${s}`
    }

    const update = (state: PowerAction) => {
        if (secondsLeft > 0 && (state === 'restart' || state === 'shutdown' || state === 'kill')) {
            notify({
                message: `Power controls are disabled during the first 5 minutes of boot (${formatTime(secondsLeft)} remaining).`,
                color: 'yellow',
            })
            return
        }

        updateStatus(uuid!, state)
            .then(() =>
                notify({
                    message: t('notices.power_action_sent_success'),
                    color: 'green',
                })
            )
            .catch(() =>
                notify({
                    message: t('notices.power_action_sent_fail'),
                    color: 'red',
                })
            )
    }

    const firstBootMsg = secondsLeft > 0 ? `Disabled during first-boot setup (${formatTime(secondsLeft)} remaining)` : ''

    return (
        <div className='flex flex-wrap items-center justify-end gap-2 mb-3'>
            {secondsLeft > 0 && (
                <div
                    className='flex items-center gap-1.5 text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg shrink-0'
                    title='Restart and Stop actions are locked for 5 minutes post-deploy to allow Cloud-Init boot to complete cleanly.'
                >
                    <LockClosedIcon className='w-3.5 h-3.5 text-amber-400' />
                    <span>Boot Lock ({formatTime(secondsLeft)})</span>
                </div>
            )}
            <Button
                className='transition-colors'
                disabled={!state || state === 'running'}
                onClick={() => update('start')}
            >
                {t('power_actions.start')}
            </Button>
            <Button
                className='transition-colors'
                disabled={secondsLeft > 0 || state !== 'running'}
                onClick={() => update('restart')}
                title={firstBootMsg}
            >
                {t('power_actions.restart')}
            </Button>
            <Button
                className='transition-colors'
                color='danger'
                variant='outline'
                disabled={secondsLeft > 0 || !state || state === 'stopped'}
                onClick={() => update('kill')}
                title={firstBootMsg}
            >
                {t('power_actions.kill')}
            </Button>
            <Button
                className='transition-colors'
                color='danger'
                variant='filled'
                disabled={secondsLeft > 0 || state !== 'running'}
                onClick={() => update('shutdown')}
                title={firstBootMsg}
            >
                {t('power_actions.shutdown')}
            </Button>
        </div>
    )
}

export default ServerPowerBlock