import { ReactNode, Suspense } from 'react'
import { SpiralAnimation } from '@/components/ui/spiral-animation'

interface Props {
    screen?: boolean
    flat?: boolean
}

interface Spinner extends React.FC<Props> {
    Suspense: React.FC<{
        children: ReactNode
        screen?: boolean
    }>
}

const Spinner: Spinner = ({ screen, flat }: Props) => {
    const size = screen ? 200 : 90
    const dots = screen ? 400 : 180

    return (
        <div
            className={`grid place-items-center w-full ${
                screen ? 'h-screen fixed inset-0 z-50 bg-black/90 backdrop-blur-md' : 'h-40'
            } ${flat ? 'dark:bg-black' : ''}`}
        >
            <SpiralAnimation
                size={size}
                totalDots={dots}
                dotColor='#3b82f6'
                backgroundColor='transparent'
                duration={2.5}
            />
        </div>
    )
}

Spinner.Suspense = ({ children, screen }) => {
    return (
        <Suspense fallback={<Spinner screen={screen} />}>{children}</Suspense>
    )
}

export default Spinner
