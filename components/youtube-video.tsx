'use client'

import { useState } from 'react'
import Image from 'next/image'
import { track } from '@vercel/analytics'
import { youtubeThumbnail } from '@/lib/highlight-video'

interface Props {
    id: string
    title: string
    // Set when the video is above the fold so the thumbnail loads as the LCP image.
    priority?: boolean
}

// Lightweight YouTube embed: renders a static thumbnail and only loads the
// YouTube player (~1MB of JS) once the visitor clicks play.
export default function YouTubeVideo({ id, title, priority = false }: Props) {
    const [playing, setPlaying] = useState(false)

    return (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10">
            {playing ? (
                <iframe
                    src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                    title={title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full border-0"
                />
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        track('video_play', { video: id, from: window.location.pathname })
                        setPlaying(true)
                    }}
                    aria-label={`Play video: ${title}`}
                    className="group absolute inset-0 h-full w-full"
                >
                    <Image
                        src={youtubeThumbnail(id)}
                        alt={title}
                        fill
                        preload={priority}
                        sizes="(min-width: 1024px) 640px, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/20" />
                    <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#77c3ef] shadow-xl transition-transform group-hover:scale-110 md:h-20 md:w-20">
                        <svg viewBox="0 0 24 24" fill="white" className="ml-1 h-7 w-7 md:h-9 md:w-9" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </span>
                </button>
            )}
        </div>
    )
}
