import useSWR from 'swr'

import getServers, {
    QueryParams,
    ServerResponse,
} from '@/api/admin/servers/getServers'


const useServersSWR = ({
    page,
    nodeId,
    userId,
    addressPoolId,
    query,
    tab,
    status,
    ...params
}: QueryParams) => {
    return useSWR<ServerResponse>(
        ['admin:servers', page, query, nodeId, userId, addressPoolId, tab, status],
        () =>
            getServers({
                page,
                query,
                nodeId,
                userId,
                addressPoolId,
                tab,
                status,
                ...params,
            })
    )
}

export default useServersSWR