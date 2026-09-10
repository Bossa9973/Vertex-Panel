import { AdminServerContext } from '@/state/admin/server'
import { useFlashKey } from '@/util/useFlash'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormEvent, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import deleteServer from '@/api/admin/servers/deleteServer'

import Button from '@/components/elements/Button'
import FlashMessageRender from '@/components/elements/FlashMessageRenderer'
import FormCard from '@/components/elements/FormCard'
import MessageBox from '@/components/elements/MessageBox'
import Modal from '@/components/elements/Modal'
import CheckboxForm from '@/components/elements/forms/CheckboxForm'


const DeleteServerCard = () => {
    const server = AdminServerContext.useStoreState(state => state.server.data!)
    const setServer = AdminServerContext.useStoreActions(
        actions => actions.server.setServer
    )
    const { clearFlashes, clearAndAddHttpError } = useFlashKey(
        `admin.servers.${server.uuid}.settings.general.delete`
    )
    const { t: tStrings } = useTranslation('strings')
    const { t } = useTranslation('admin.servers.settings')
    const [showConfirmation, setShowConfirmation] = useState(false)

    const schema = z.object({
        noPurge: z.boolean(),
        force: z.boolean().optional(),
    })

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            noPurge: false,
            force: false,
        },
    })

    const submit = async ({ noPurge, force }: z.infer<typeof schema>) => {
        clearFlashes()
        try {
            await deleteServer(server.uuid, noPurge, force)

            if (force) {
                window.location.href = '/admin/servers'
                return
            }

            setServer({
                ...server,
                status: 'deleting',
            })
            setShowConfirmation(false)
        } catch (error) {
            clearAndAddHttpError(error as any)
            setShowConfirmation(false)
        }
    }

    const triggerConfirmation = (e: FormEvent) => {
        e.preventDefault()
        setShowConfirmation(true)
    }

    const isForceWipe = form.watch('force')

    return (
        <>
            <FormCard className='w-full border-error'>
                <FormProvider {...form}>
                    <form onSubmit={triggerConfirmation}>
                        <FormCard.Body>
                            <FormCard.Title>
                                {t('deletion.title')}
                            </FormCard.Title>
                            <div className='space-y-3 mt-3'>
                                <FlashMessageRender
                                    byKey={`admin.servers.${server.uuid}.settings.general.delete`}
                                />

                                <p className='description-small !text-foreground'>
                                    {t('deletion.description')}
                                </p>
                                {server.status === 'deleting' && (
                                    <MessageBox title='Warning' type='warning'>
                                        {t('deletion.deleting_status')}
                                    </MessageBox>
                                )}
                                {server.status === 'deletion_failed' && (
                                    <MessageBox title='Uninstallation Failed' type='error'>
                                        Previous uninstallation failed. You can retry deletion or check "Force Wipe" to remove the server immediately from the database.
                                    </MessageBox>
                                )}

                                <CheckboxForm
                                    name={'noPurge'}
                                    label={
                                        t('deletion.no_purge') ??
                                        'Do not purge VM and related files'
                                    }
                                />
                                <CheckboxForm
                                    name={'force'}
                                    label={'Force Wipe from Database (Bypass hypervisor & remove record immediately)'}
                                />
                            </div>
                        </FormCard.Body>
                        <FormCard.Footer>
                            <Button
                                loading={form.formState.isSubmitting}
                                type='submit'
                                variant='filled'
                                color='danger'
                                size='sm'
                            >
                                {isForceWipe ? '⚡ Force Wipe Server' : tStrings('delete')}
                            </Button>
                        </FormCard.Footer>
                    </form>
                </FormProvider>
            </FormCard>

            <Modal
                open={showConfirmation}
                onClose={() => setShowConfirmation(false)}
            >
                <Modal.Header>
                    <Modal.Title>
                        {isForceWipe
                            ? `Force Wipe '${server.name}' from Database`
                            : t('deletion.confirmation.title', { name: server.name })}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Modal.Description>
                        {isForceWipe
                            ? `Are you sure you want to permanently force-wipe '${server.name}'? This directly removes the server record and releases all IPs immediately without contacting Proxmox.`
                            : t('deletion.confirmation.description', { name: server.name })}
                    </Modal.Description>
                </Modal.Body>
                <Modal.Actions>
                    <Modal.Action
                        type='button'
                        onClick={() => setShowConfirmation(false)}
                    >
                        {tStrings('cancel')}
                    </Modal.Action>
                    <Modal.Action
                        type='button'
                        loading={form.formState.isSubmitting}
                        onClick={form.handleSubmit(submit)}
                    >
                        {isForceWipe ? '⚡ Wipe Into Void' : tStrings('delete')}
                    </Modal.Action>
                </Modal.Actions>
            </Modal>
        </>
    )
}

export default DeleteServerCard