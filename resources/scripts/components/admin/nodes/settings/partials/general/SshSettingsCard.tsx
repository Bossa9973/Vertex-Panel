import { useFlashKey } from '@/util/useFlash'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import { z } from 'zod'

import updateNode from '@/api/admin/nodes/updateNode'
import useNodeSWR from '@/api/admin/nodes/useNodeSWR'

import Button from '@/components/elements/Button'
import FlashMessageRender from '@/components/elements/FlashMessageRenderer'
import FormCard from '@/components/elements/FormCard'
import TextInputForm from '@/components/elements/forms/TextInputForm'

/**
 * SshSettingsCard — admin Node Settings panel for configuring the SSH
 * credentials that UploadBackupToCloudJob uses to SFTP into the node
 * and stream backup archives to Google Drive.
 *
 * The SSH private key is write-only: the API never returns it in GET
 * responses. A "key configured" indicator tells admins whether a key
 * has been saved without exposing the secret.
 */
const SshSettingsCard = () => {
    const { data: node, mutate } = useNodeSWR()
    const { clearFlashes, clearAndAddHttpError } = useFlashKey(
        `admin.nodes.${node?.id}.settings.ssh`
    )

    const schema = z.object({
        sshHost: z.string().max(191).optional().nullable(),
        sshPort: z.preprocess(Number, z.number().int().min(1).max(65535)),
        sshUsername: z.string().max(191),
        sshPrivateKey: z.string().optional().nullable(),
        backupPath: z.string().max(500).optional().nullable(),
    })

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            sshHost: node?.sshHost ?? '',
            sshPort: node?.sshPort ?? 22,
            sshUsername: node?.sshUsername ?? 'root',
            sshPrivateKey: '',
            backupPath: node?.backupPath ?? '',
        },
    })

    const submit = async (data: z.infer<typeof schema>) => {
        if (!node) return
        clearFlashes()
        try {
            const updatedNode = await updateNode(node.id, {
                // Pass-through existing node values so the PUT endpoint doesn't lose data
                locationId: node.locationId,
                name: node.name,
                cluster: node.cluster,
                verifyTls: node.verifyTls,
                hidden: node.hidden,
                fqdn: node.fqdn,
                port: node.port,
                memory: node.memory,
                memoryOverallocate: node.memoryOverallocate,
                disk: node.disk,
                diskOverallocate: node.diskOverallocate,
                vmStorage: node.vmStorage,
                backupStorage: node.backupStorage,
                isoStorage: node.isoStorage,
                network: node.network,
                // SSH fields
                sshHost: data.sshHost || null,
                sshPort: data.sshPort,
                sshUsername: data.sshUsername,
                sshPrivateKey: data.sshPrivateKey || null,
                backupPath: data.backupPath || null,
            })

            mutate(() => updatedNode, false)

            // Clear the private key field after save (write-only UX)
            form.reset({ ...data, sshPrivateKey: '' })
        } catch (error) {
            clearAndAddHttpError(error as Error)
        }
    }

    return (
        <FormCard className='w-full'>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(submit)}>
                    <FormCard.Body>
                        <FormCard.Title>SSH &amp; Backup Upload Settings</FormCard.Title>
                        <p className='text-sm text-foreground-muted mt-1 mb-4'>
                            These credentials allow Convoy to connect to this Proxmox node via SFTP
                            and stream backup archives to Google Drive. Generate an SSH key pair on
                            your Convoy server and paste the public key into the node&apos;s
                            <code className='mx-1 font-mono text-xs bg-black/20 rounded px-1'>authorized_keys</code>.
                        </p>

                        {node?.sshKeyConfigured && (
                            <div className='mb-3 flex items-center gap-2 text-sm text-green-400'>
                                <span className='inline-block w-2 h-2 rounded-full bg-green-400'></span>
                                SSH private key is configured
                            </div>
                        )}

                        <FlashMessageRender
                            byKey={`admin.nodes.${node?.id}.settings.ssh`}
                            className='mb-3'
                        />

                        <div className='space-y-3'>
                            <TextInputForm
                                name='sshHost'
                                label='SSH Host / IP'
                                placeholder='51.162.178.199 (leave blank to use node FQDN)'
                            />
                            <div className='grid gap-3 grid-cols-2'>
                                <TextInputForm
                                    name='sshPort'
                                    label='SSH Port'
                                    placeholder='22'
                                />
                                <TextInputForm
                                    name='sshUsername'
                                    label='SSH Username'
                                    placeholder='root'
                                />
                            </div>
                            <TextInputForm
                                name='sshPrivateKey'
                                label='SSH Private Key (PEM / OpenSSH format)'
                                placeholder={
                                    node?.sshKeyConfigured
                                        ? 'Leave blank to keep existing key'
                                        : 'Paste your private key here (-----BEGIN OPENSSH PRIVATE KEY-----)'
                                }
                            />
                            <TextInputForm
                                name='backupPath'
                                label='Backup Archive Path on Node'
                                placeholder='/var/lib/vz/dump (default for Proxmox dir storage)'
                            />
                        </div>
                    </FormCard.Body>
                    <FormCard.Footer>
                        <Button
                            loading={form.formState.isSubmitting}
                            disabled={!form.formState.isDirty}
                            type='submit'
                            variant='filled'
                            color='success'
                            size='sm'
                        >
                            Save SSH Settings
                        </Button>
                    </FormCard.Footer>
                </form>
            </FormProvider>
        </FormCard>
    )
}

export default SshSettingsCard

