import React, { useState, useEffect, useRef } from 'react'
import {
    SpeakerWaveIcon,
    SpeakerXMarkIcon,
    PlayIcon,
    PauseIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    SparklesIcon,
    LinkIcon,
} from '@heroicons/react/24/outline'

// High-quality ambient soundtrack stream (Direct MP3 / Stream URL)
const DEFAULT_AUDIO_URL = 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3'

export const AudioStreamPlayer: React.FC = () => {
    const [audioUrl, setAudioUrl] = useState<string>(() => {
        return localStorage.getItem('vertex_radio_url') || DEFAULT_AUDIO_URL
    })
    const [isPlaying, setIsPlaying] = useState<boolean>(false)
    const [isMuted, setIsMuted] = useState<boolean>(false)
    const [isExpanded, setIsExpanded] = useState<boolean>(false)
    const [customUrl, setCustomUrl] = useState<string>(audioUrl)
    const [showUrlInput, setShowUrlInput] = useState<boolean>(false)
    const audioRef = useRef<HTMLAudioElement>(null)

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : 0.85
        }
    }, [isMuted])

    const togglePlay = async () => {
        if (!audioRef.current) return
        try {
            if (isPlaying) {
                audioRef.current.pause()
                setIsPlaying(false)
            } else {
                await audioRef.current.play()
                setIsPlaying(true)
            }
        } catch (err) {
            console.error('Audio playback error:', err)
        }
    }

    const toggleMute = () => {
        if (!audioRef.current) return
        const nextMute = !isMuted
        setIsMuted(nextMute)
        audioRef.current.muted = nextMute
    }

    const applyCustomUrl = (newUrl: string) => {
        setAudioUrl(newUrl)
        localStorage.setItem('vertex_radio_url', newUrl)
        setShowUrlInput(false)
        setIsPlaying(false)
        setTimeout(() => {
            if (audioRef.current) {
                audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
            }
        }, 100)
    }

    // First user gesture handler to unblock browser autoplay
    useEffect(() => {
        const handleFirstInteraction = () => {
            if (audioRef.current && !isPlaying) {
                audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
            }
        }
        window.addEventListener('click', handleFirstInteraction, { once: true })
        return () => window.removeEventListener('click', handleFirstInteraction)
    }, [isPlaying])

    return (
        <div className='fixed bottom-5 right-5 z-50 font-sans select-none print:hidden'>
            {/* HTML5 Native Audio Element — Direct Stream Engine */}
            <audio
                ref={audioRef}
                src={audioUrl}
                loop
                preload='auto'
                crossOrigin='anonymous'
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />

            {/* Floating Glassmorphism Player Widget */}
            <div className={`transition-all duration-300 rounded-2xl border shadow-2xl backdrop-blur-xl ${
                isExpanded ? 'w-80 p-4 bg-neutral-950/95 border-blue-500/30 shadow-blue-950/50' : 'px-4 py-2.5 bg-neutral-900/90 hover:bg-neutral-900 border-white/10 hover:border-blue-500/40 shadow-xl'
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
                                        Vertex Radio <span className='px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono'>DIRECT STREAM</span>
                                    </h6>
                                    <p className='text-[11px] text-gray-400 font-medium truncate max-w-[170px]'>
                                        Dashboard Sound System
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
                                    Ambient Lofi Soundtrack
                                </p>
                                <p className='text-[10px] text-gray-400 truncate'>
                                    {isPlaying ? (isMuted ? 'Muted' : 'Playing Live Audio...') : 'Click Play to Stream Audio'}
                                </p>
                            </div>
                        </div>

                        {/* Stream Source URL Input Modal/Bar */}
                        {showUrlInput ? (
                            <div className='space-y-2 p-2.5 bg-neutral-900 border border-white/10 rounded-xl text-xs'>
                                <span className='text-[11px] font-bold text-gray-300 block'>Custom Audio / MP3 Stream URL:</span>
                                <input
                                    type='text'
                                    value={customUrl}
                                    onChange={(e) => setCustomUrl(e.target.value)}
                                    placeholder='https://example.com/sound.mp3 or /soundtrack.mp3'
                                    className='w-full text-xs font-mono bg-neutral-950 border border-white/10 rounded px-2 py-1.5 text-blue-300 focus:outline-none'
                                />
                                <div className='flex gap-2 pt-1'>
                                    <button
                                        onClick={() => applyCustomUrl(customUrl)}
                                        className='grow py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer'
                                    >
                                        Set Stream URL
                                    </button>
                                    <button
                                        onClick={() => setShowUrlInput(false)}
                                        className='px-2.5 py-1 rounded bg-neutral-800 text-gray-400 hover:text-white text-xs cursor-pointer'
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowUrlInput(true)}
                                className='w-full py-1.5 text-[11px] font-semibold text-gray-400 hover:text-blue-300 flex items-center justify-center gap-1.5 hover:bg-white/5 rounded-lg transition cursor-pointer'
                            >
                                <LinkIcon className='w-3.5 h-3.5' /> Change Audio Stream / MP3 URL
                            </button>
                        )}

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
                                className='p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 active:scale-95 transition cursor-pointer flex items-center justify-center'
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
                                    <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                                </span>
                            </div>
                        </button>

                        <div className='h-4 w-px bg-white/10 my-auto' />

                        <div className='flex items-center gap-1'>
                            <button
                                onClick={togglePlay}
                                className='p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer'
                                title={isPlaying ? 'Pause' : 'Click to Play Audio'}
                            >
                                {isPlaying ? <PauseIcon className='w-4 h-4' /> : <PlayIcon className='w-4 h-4 text-blue-400' />}
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
