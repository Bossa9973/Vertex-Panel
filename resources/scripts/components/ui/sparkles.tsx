import React, { useId, useMemo } from "react"
import { Particles, ParticlesProvider } from "@tsparticles/react"
import { loadSlim } from "@tsparticles/slim"
import type { Engine } from "@tsparticles/engine"

interface SparklesProps {
    id?: string
    className?: string
    size?: number
    minSize?: number | null
    density?: number
    speed?: number
    minSpeed?: number | null
    opacity?: number
    opacitySpeed?: number
    minOpacity?: number | null
    color?: string | string[]
    background?: string
    direction?: string
    options?: Record<string, any>
}

function SparklesInnerComponent({
    id: propId,
    className,
    size = 1,
    minSize = null,
    density = 800,
    speed = 1,
    minSpeed = null,
    opacity = 1,
    opacitySpeed = 3,
    minOpacity = null,
    color = "#22c55e",
    background = "transparent",
    direction = "none",
    options = {},
}: SparklesProps) {
    const generatedId = useId()
    const particlesId = propId || generatedId

    const particleOptions = useMemo(() => ({
        background: {
            color: { value: background },
        },
        fullScreen: {
            enable: false,
            zIndex: 1,
        },
        fpsLimit: 120,
        particles: {
            color: { value: color },
            move: {
                enable: true,
                direction: direction as any,
                speed: {
                    min: minSpeed ?? speed / 10,
                    max: speed,
                },
                straight: false,
            },
            number: { value: density },
            opacity: {
                value: {
                    min: minOpacity ?? opacity / 10,
                    max: opacity,
                },
                animation: {
                    enable: true,
                    sync: false,
                    speed: opacitySpeed,
                },
            },
            size: {
                value: {
                    min: minSize ?? size / 2.5,
                    max: size,
                },
            },
            shadow: {
                enable: true,
                color: typeof color === 'string' ? color : '#22c55e',
                blur: 5,
            },
        },
        detectRetina: true,
        ...options,
    }), [background, color, direction, minSpeed, speed, density, minOpacity, opacity, opacitySpeed, minSize, size, options])

    return (
        <Particles
            id={particlesId}
            options={particleOptions}
            className={className}
        />
    )
}

const SparklesInner = React.memo(SparklesInnerComponent)

async function initEngine(engine: Engine) {
    await loadSlim(engine)
}

export const Sparkles = React.memo(function Sparkles(props: SparklesProps) {
    return (
        <ParticlesProvider init={initEngine}>
            <SparklesInner {...props} />
        </ParticlesProvider>
    )
})

