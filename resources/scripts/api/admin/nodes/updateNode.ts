import { rawDataToNode } from '@/api/admin/nodes/getNodes'
import http from '@/api/http'

interface UpdateNodeParameters {
    locationId: number
    name: string
    cluster: string
    verifyTls: boolean
    hidden?: boolean
    allowRelocation?: boolean
    fqdn: string
    port: number
    tokenId?: string | null
    secret?: string | null
    memory: number
    memoryOverallocate: number
    disk: number
    diskOverallocate: number
    vmStorage: string
    backupStorage: string
    isoStorage: string
    network: string
    // SSH / backup upload fields (all optional — can be set separately)
    sshHost?: string | null
    sshPort?: number
    sshUsername?: string
    sshPrivateKey?: string | null
    backupPath?: string | null
}

const updateNode = async (nodeId: number, payload: UpdateNodeParameters) => {
    const {
        data: { data },
    } = await http.put(`/api/admin/nodes/${nodeId}`, {
        location_id: payload.locationId,
        name: payload.name,
        cluster: payload.cluster,
        verify_tls: payload.verifyTls,
        hidden: payload.hidden,
        allow_relocation: payload.allowRelocation,
        fqdn: payload.fqdn,
        port: payload.port,
        token_id: payload.tokenId ? payload.tokenId : undefined,
        secret: payload.secret ? payload.secret : undefined,
        memory: payload.memory,
        memory_overallocate: payload.memoryOverallocate,
        disk: payload.disk,
        disk_overallocate: payload.diskOverallocate,
        vm_storage: payload.vmStorage,
        backup_storage: payload.backupStorage,
        iso_storage: payload.isoStorage,
        network: payload.network,
        ssh_host: payload.sshHost ?? undefined,
        ssh_port: payload.sshPort ?? undefined,
        ssh_username: payload.sshUsername ?? undefined,
        // Only send the private key if a value was actually entered (it's write-only)
        ssh_private_key: payload.sshPrivateKey ? payload.sshPrivateKey : undefined,
        backup_path: payload.backupPath ?? undefined,
    })

    return rawDataToNode(data)
}

export default updateNode

