import React, { useState, useEffect, useRef } from 'react'
import {
    SpeakerWaveIcon,
    SpeakerXMarkIcon,
    PlayIcon,
    PauseIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    RadioIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline'

const YOUTUBE_VIDEO_ID = 'D5GX7NQfNcI'

export const AudioStreamPlayer: React.FC = () => {
    const [isPlaying, setIsPlaying] = useState<boolean>(true)
    const [isMuted, setIsMuted] = useState<boolean>(false)
    const [isExpanded, setIsExpanded] = useState<boolean>(false)
    const [hasInteracted, setHasInteracted] = useState<boolean>(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    // Send postMessage to YouTube IFrame API to toggle play/pause or mute
    const sendCommand = (func: string, args: any[] = []) => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func, args }),
                '*'
            )
        }
    }

    const togglePlay = () => {
        setHasInteracted(true)
        if (isPlaying) {
            sendCommand('pauseVideo')
            setIsPlaying(false)
        } else {
            sendCommand('playVideo')
            setIsPlaying(true)
        }
    }

    const toggleMute = () => {
        setHasInteracted(true)
        if (isMuted) {
            sendCommand('unMute')
            setIsMuted(false)
        } else {
            sendCommand('mute')
            setIsMuted(true)
        }
    }

    // Auto-attempt playback on user click anywhere
    useEffect(() => {
        const handleFirstInteraction = () => {
            if (!hasInteracted) {
                setHasInteracted(true)
                sendCommand('playVideo')
            }
        }
        window.addEventListener('click', handleFirstInteraction, { once: true })
        return () => window.removeEventListener('click', handleFirstInteraction)
    }, [hasInteracted])

    return (
        <div className='fixed bottom-5 right-5 z-50 font-sans select-none print:hidden'>
            {/* Hidden YouTube IFrame Audio Engine */}
            <div className='hidden pointer-events-none w-0 h-0 overflow-hidden'>
                <iframe
                    ref={iframeRef}
                    id='vertex-radio-engine'
                    width='200'
                    height='200'
                    src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?enablejsapi=1&autoplay=1&loop=1&playlist=${YOUTUBE_VIDEO_ID}&controls=0&origin=${window.location.origin}`}
                    title='Vertex Radio Engine'
                    allow='autoplay; encrypted-media'
                />
            </div>

            {/* Floating Glassmorphism Player Widget */}
            <div className={`transition-all duration-300 rounded-2xl border shadow-2xl backdrop-blur-xl ${
                isExpanded ? 'w-80 p-4 bg-neutral-950/90 border-blue-500/30 shadow-blue-950/50' : 'px-4 py-2.5 bg-neutral-900/80 hover:bg-neutral-900 border-white/10 hover:border-blue-500/40'
            }`}>
                {isExpanded ? (
                    /* Expanded Player Card */
                    <div className='space-y-3.5'>
                        <div className='flex items-center justify-between border-b border-white/10 pb-2.5'>
                            <div className='flex items-center gap-2'>
                                <span className='p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30'>
                                    <SparklesIcon className='w-4 h-4 animate-pulse' />
                                </span>
                                <div>
                                    <h6 className='text-xs font-extrabold text-white tracking-wide uppercase flex items-center gap-1.5'>
                                        Vertex Radio <span className='px-1.5 py-0.2 rounded text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 font-mono'>LIVE STREAM</span>
                                    </h6>
                                    <p className='text-[11px] text-gray-400 font-medium truncate max-w-[170px]'>
                                        Dashboard Soundtrack
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className='p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer'
                                title='Minimize player'
                            >
                                <ChevronDownIcon className='w-4 h-4' />
                            </button>
                        </div>

                        {/* Animated Equalizer Waveform & Info */}
                        <div className='flex items-center gap-3 bg-neutral-900/90 p-3 rounded-xl border border-white/5'>
                            <div className='flex items-end gap-0.5 h-6 shrink-0 px-1'>
                                <span className={`w-1 rounded-full bg-blue-400 transition-all ${isPlaying && !isMuted ? 'h-5 animate-[bounce_0.8s_infinite]' : 'h-1.5 opacity-40'}`} />
                                <span className={`w-1 rounded-full bg-indigo-400 transition-all ${isPlaying && !isMuted ? 'h-3 animate-[bounce_1.2s_infinite]' : 'h-1.5 opacity-40'}`} />
                                <span className={`w-1 rounded-full bg-sky-400 transition-all ${isPlaying && !isMuted ? 'h-6 animate-[bounce_0.6s_infinite]' : 'h-1.5 opacity-40'}`} />
                                <span className={`w-1 rounded-full bg-amber-400 transition-all ${isPlaying && !isMuted ? 'h-4 animate-[bounce_1.0s_infinite]' : 'h-1.5 opacity-40'}`} />
                            </div>
                            <div className='grow overflow-hidden'>
                                <p className='text-xs font-bold text-blue-300 truncate'>
                                    Ambient Stream
                                </p>
                                <p className='text-[10px] text-gray-400 truncate'>
                                    {isPlaying ? (isMuted ? 'Muted' : 'Streaming Dashboard Audio...') : 'Paused'}
                                </p>
                            </div>
                        </div>

                        {/* Playback Controls */}
                        <div className='flex items-center justify-between pt-1'>
                            <button
                                onClick={toggleMute}
                                className={`p-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                                    isMuted ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-neutral-800 text-gray-300 border-white/10 hover:text-white'
                                }`}
                            >
                                {isMuted ? <SpeakerXMarkIcon className='w-4 h-4' /> : <SpeakerWaveIcon className='w-4 h-4' />}
                                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                            </button>

                            <button
                                onClick={togglePlay}
                                className='p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 active:scale-95 transition cursor-pointer'
                            >
                                {isPlaying ? <PauseIcon className='w-5 h-5' /> : <PlayIcon className='w-5 h-5 ml-0.5' />}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Compact Pill Bar */
                    <div className='flex items-center gap-3'>
                        <button
                            onClick={() => setIsExpanded(true)}
                            className='flex items-center gap-2 cursor-pointer group text-left'
                            title='Expand player'
                        >
                            {/* Animated Equalizer Waveform */}
                            <div className='flex items-end gap-0.5 h-4 shrink-0 px-0.5'>
                                <span className={`w-0.5 rounded-full bg-blue-400 transition-all ${isPlaying && !isMuted ? 'h-3.5 animate-[bounce_0.8s_infinite]' : 'h-1 opacity-40'}`} />
                                <span className={`w-0.5 rounded-full bg-indigo-400 transition-all ${isPlaying && !isMuted ? 'h-2 animate-[bounce_1.2s_infinite]' : 'h-1 opacity-40'}`} />
                                <span className={`w-0.5 rounded-full bg-sky-400 transition-all ${isPlaying && !isMuted ? 'h-4 animate-[bounce_0.6s_infinite]' : 'h-1 opacity-40'}`} />
                            </div>

                            <div className='flex flex-col'>
                                <span className='text-[11px] font-extrabold text-blue-300 group-hover:text-blue-200 transition-colors flex items-center gap-1'>
                                    <span>Vertex Radio</span>
                                    <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' />
                                </span>
                            </div>
                        </button>

                        <div className='h-4 w-px bg-white/10 my-auto' />

                        <div className='flex items-center gap-1'>
                            <button
                                onClick={togglePlay}
                                className='p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer'
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? <PauseIcon className='w-4 h-4' /> : <PlayIcon className='w-4 h-4' />}
                            </button>

                            <button
                                onClick={toggleMute}
                                className='p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer'
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? <SpeakerXMarkIcon className='w-4 h-4 text-rose-400' /> : <SpeakerWaveIcon className='w-4 h-4' />}
                            </button>

                            <button
                                onClick={() => setIsExpanded(true)}
                                className='p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer'
                                title='Expand player'
                            >
                                <ChevronUpIcon className='w-4 h-4' />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AudioStreamPlayer
