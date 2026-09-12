'use client'

import React, { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Play, Pause, Radio, Volume2, VolumeX } from 'lucide-react'

interface HLSBackgroundVideoProps {
  streamUrl?: string
  fallbackVideoUrl?: string
}

export default function HLSBackgroundVideo({
  streamUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  fallbackVideoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
}: HLSBackgroundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [isLiveStream, setIsLiveStream] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)

  // Initialize HLS video
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: Hls | null = null

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
      })

      hls.loadSource(streamUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLiveStream(true)
        setVideoLoaded(true)
        video.play().catch(() => {
          // Autoplay blocked without user interaction
        })
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError()
              break
            default:
              hls?.destroy()
              // Fallback to MP4 if HLS fails entirely
              video.src = fallbackVideoUrl
              video.play().catch(() => {})
              break
          }
        }
      })
    } else if (video.canPlayType('application/x-mpegURL')) {
      // Native Apple HLS (Safari)
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setIsLiveStream(true)
        setVideoLoaded(true)
        video.play().catch(() => {})
      })
    } else {
      video.src = fallbackVideoUrl
      video.play().catch(() => {})
    }

    return () => {
      if (hls) {
        hls.destroy()
      }
    }
  }, [streamUrl, fallbackVideoUrl])

  // Ambient interactive canvas with network nodes and telemetry pulses
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // Particle nodes for high-tech network constellation
    const numNodes = 45
    const nodes = Array.from({ length: numNodes }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 1.8 + 1,
      color: Math.random() > 0.4 ? '#7b39fc' : '#f87b52',
      alpha: Math.random() * 0.5 + 0.2
    }))

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      // Connect near nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 130) {
            const opacity = (1 - dist / 130) * 0.18
            ctx.beginPath()
            ctx.strokeStyle = nodes[i].color === '#7b39fc' 
              ? `rgba(123, 57, 252, ${opacity})` 
              : `rgba(248, 123, 82, ${opacity})`
            ctx.lineWidth = 0.8
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Update and draw nodes
      nodes.forEach(node => {
        node.x += node.vx
        node.y += node.vy

        if (node.x < 0 || node.x > width) node.vx *= -1
        if (node.y < 0 || node.y > height) node.vy *= -1

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.shadowColor = node.color
        ctx.shadowBlur = 6
        ctx.fill()
        ctx.shadowBlur = 0
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      {/* Background Video Element */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-screen transition-opacity duration-1000 ${
          videoLoaded ? 'opacity-25' : 'opacity-0'
        }`}
        playsInline
        autoPlay
        muted
        loop
      />

      {/* Dynamic Network Node Canvas Overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-60 mix-blend-screen pointer-events-none"
      />

      {/* Linear-style Cyber Grid overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-40 mix-blend-overlay pointer-events-none" />

      {/* Primary Purple Beam Glow from Top */}
      <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1200px] h-[750px] linear-glow-beam pointer-events-none blur-3xl opacity-90" />

      {/* Accent Orange Radial Flare */}
      <div className="absolute top-[10%] right-[10%] w-[550px] h-[550px] linear-accent-glow pointer-events-none blur-3xl opacity-75" />

      {/* Secondary Deep Purple Ambient Glow */}
      <div className="absolute bottom-[10%] left-[5%] w-[600px] h-[500px] bg-gradient-to-tr from-[#7b39fc]/15 to-transparent pointer-events-none blur-3xl" />

      {/* Vignette Gradients for Crisp Readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#06070a]/60 via-[#06070a]/40 to-[#06070a] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(6,7,10,0.85)_100%)] pointer-events-none" />

      {/* Video / Stream Status Pill (Clickable) */}
      <div className="absolute bottom-6 right-6 pointer-events-auto flex items-center gap-2 z-20">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-pill text-xs text-slate-300 font-mono tracking-wide">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f87b52] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7b39fc]"></span>
          </span>
          <Radio className="w-3.5 h-3.5 text-[#7b39fc]" />
          <span className="font-medium text-[11px] text-slate-200">
            {isLiveStream ? 'HLS Stream: Live' : 'Feed: Active'}
          </span>
          
          <div className="h-3 w-[1px] bg-white/20 mx-1" />

          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause background video' : 'Play background video'}
            className="text-slate-400 hover:text-white transition-colors p-0.5"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>

          <button
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
            className="text-slate-400 hover:text-white transition-colors p-0.5"
          >
            {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  )
}
