import DeleteNodeCard from '@/components/admin/nodes/settings/partials/general/DeleteNodeCard'
import NodeInformationCard from '@/components/admin/nodes/settings/partials/general/NodeInformationCard'
import ResetPveRootPasswordCard from '@/components/admin/nodes/settings/partials/general/ResetPveRootPasswordCard'
import SshSettingsCard from '@/components/admin/nodes/settings/partials/general/SshSettingsCard'

const GeneralContainer = () => {
    return (
        <>
            <NodeInformationCard />
            <SshSettingsCard />
            <ResetPveRootPasswordCard />
            <DeleteNodeCard />
        </>
    )
}

export default GeneralContainer

