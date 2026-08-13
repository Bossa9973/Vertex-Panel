import { useParams } from 'react-router-dom'
import useSWR from 'swr'

import getAttachedNodes, {
    QueryParams,
} from '@/api/admin/addressPools/getAttachedNodes'
import { NodeResponse } from '@/api/admin/nodes/getNodes'

const useAddressPoolNodesSWR = (
    poolId: number,
    { page, query, ...params }: QueryParams
) => {
    return useSWR<NodeResponse>(
        poolId && poolId > 0 ? ['admin.address-pools.nodes', poolId, page, query] : null,
        () =>
            getAttachedNodes(poolId, {
                page,
                query,
                ...params,
            })
    )
}

export default useAddressPoolNodesSWR
