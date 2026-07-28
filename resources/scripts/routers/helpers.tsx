import React, { Component, LazyExoticComponent, ReactNode } from 'react'
import { BareFetcher, Key, MutatorOptions, mutate } from 'swr'

import Spinner from '@/components/elements/Spinner'

interface ErrorBoundaryState {
    hasError: boolean
    isChunkError: boolean
    errorMessage?: string
}

class ChunkErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: ReactNode }) {
        super(props)
        this.state = { hasError: false, isChunkError: false }
    }

    static getDerivedStateFromError(error: any) {
        const isChunkError =
            error?.name === 'ChunkLoadError' ||
            error?.message?.includes('Failed to fetch dynamically imported module') ||
            error?.message?.includes('Importing a module script failed') ||
            error?.message?.includes('dynamically imported module')

        if (isChunkError) {
            const reloadedKey = 'chunk_reload_attempts'
            const attempts = parseInt(sessionStorage.getItem(reloadedKey) || '0', 10)
            if (attempts < 2) {
                sessionStorage.setItem(reloadedKey, String(attempts + 1))
                window.location.href = window.location.pathname + '?v=' + Date.now()
            }
        }

        return {
            hasError: true,
            isChunkError,
            errorMessage: error?.message || 'An unexpected rendering error occurred.',
        }
    }

    render() {
        if (this.state.hasError) {
            if (this.state.isChunkError) {
                return (
                    <div className='p-8 text-center bg-[#141619] rounded-2xl border border-stone-800 text-stone-200 my-4'>
                        <h3 className='text-base font-bold text-white mb-1'>New Application Version Available</h3>
                        <p className='text-xs text-stone-400 mb-4'>The application was recently updated. Please refresh your page to load the latest version.</p>
                        <button
                            onClick={() => {
                                sessionStorage.removeItem('chunk_reload_attempts')
                                window.location.href = window.location.pathname + '?v=' + Date.now()
                            }}
                            className='px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition cursor-pointer'
                        >
                            Reload Application Now
                        </button>
                    </div>
                )
            }

            return (
                <div className='p-6 bg-red-950/40 border border-red-900/50 rounded-2xl text-stone-200 my-4 text-center'>
                    <h3 className='text-sm font-bold text-red-400 mb-1'>Application Error</h3>
                    <p className='text-xs text-stone-400 mb-4'>{this.state.errorMessage}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className='px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-semibold text-xs shadow-sm transition'
                    >
                        Try Again
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

export const lazyLoad = (
    LazyElement: LazyExoticComponent<() => JSX.Element>
) => {
    return (
        <ChunkErrorBoundary>
            <Spinner.Suspense>
                <LazyElement />
            </Spinner.Suspense>
        </ChunkErrorBoundary>
    )
}

export const query = async <T,>(
    key: Key,
    fetcher: BareFetcher<T>,
    options: MutatorOptions | false = false
): Promise<T> => {
    const data = await fetcher(key)

    await mutate(key, data, options)

    return data
}
