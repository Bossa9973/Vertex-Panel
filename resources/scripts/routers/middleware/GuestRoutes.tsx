import { useStoreState } from '@/state'
import { Navigate, useLocation } from 'react-router-dom'

interface Props {
    children: React.ReactNode
}

const GuestRoutes: React.FC<Props> = ({ children }) => {
    const isAuthenticated = useStoreState(state => state.user.data?.email)
    const location = useLocation()

    if (isAuthenticated) {
        return <Navigate to='/' state={{ from: location }} replace />
    }

    return <>{children}</>
}

export default GuestRoutes