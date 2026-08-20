import DeleteNodeCard from '@/components/admin/nodes/settings/partials/general/DeleteNodeCard'
import NodeInformationCard from '@/components/admin/nodes/settings/partials/general/NodeInformationCard'
import ResetPveRootPasswordCard from '@/components/admin/nodes/settings/partials/general/ResetPveRootPasswordCard'

const GeneralContainer = () => {
    return (
        <>
            <NodeInformationCard />
            <ResetPveRootPasswordCard />
            <DeleteNodeCard />
        </>
    )
}

export default GeneralContainer