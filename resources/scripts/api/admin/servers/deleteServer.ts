import http from '@/api/http'

const deleteServer = (serverUuid: string, noPurge?: boolean, force?: boolean) => {
    return http.delete(`/api/admin/servers/${serverUuid}`, {
        data: {
            no_purge: noPurge,
            force: force,
        },
    })
}

export default deleteServer