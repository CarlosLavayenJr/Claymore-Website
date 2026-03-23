'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { SanityPlayerPhoto } from '@/sanity/lib/queries'

export default function PostGallery({ photos }: { photos: SanityPlayerPhoto[] }) {
    const [lightbox, setLightbox] = useState<number | null>(null)
    const touchStartX = useRef<number | null>(null)

    useEffect(() => {
        if (lightbox === null) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') setLightbox(i => i !== null ? (i + 1) % photos.length : null)
            if (e.key === 'ArrowLeft') setLightbox(i => i !== null ? (i - 1 + photos.length) % photos.length : null)
            if (e.key === 'Escape') setLightbox(null)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [lightbox, photos.length])

    const prev = () => setLightbox(i => i !== null ? (i - 1 + photos.length) % photos.length : null)
    const next = () => setLightbox(i => i !== null ? (i + 1) % photos.length : null)

    const onTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX
    }
    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return
        const delta = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(delta) > 40) delta < 0 ? next() : prev()
        touchStartX.current = null
    }

    return (
        <>
            <div className="mt-16">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-8 h-0.5 bg-[#78c3ef]" />
                    <h2 className="text-2xl font-claymore text-[#111111] uppercase tracking-widest">Gallery</h2>
                </div>

                <div className="columns-2 sm:columns-3 gap-3 space-y-3">
                    {photos.map((photo, i) => (
                        <button
                            key={photo._id}
                            onClick={() => setLightbox(i)}
                            className="block w-full overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                        >
                            <img
                                src={photo.url}
                                alt=""
                                className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                        </button>
                    ))}
                </div>
            </div>

            {lightbox !== null && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                    onClick={() => setLightbox(null)}
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                >
                    <button
                        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 transition-colors"
                        onClick={() => setLightbox(null)}
                        aria-label="Close"
                    >
                        <X className="w-7 h-7" />
                    </button>

                    <button
                        className="absolute left-2 md:left-4 text-white/70 hover:text-white p-3 transition-colors"
                        onClick={e => { e.stopPropagation(); prev() }}
                        aria-label="Previous"
                    >
                        <ChevronLeft className="w-9 h-9" />
                    </button>

                    <img
                        src={photos[lightbox].url}
                        alt=""
                        className="max-h-[88vh] max-w-[80vw] object-contain rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />

                    <button
                        className="absolute right-2 md:right-4 text-white/70 hover:text-white p-3 transition-colors"
                        onClick={e => { e.stopPropagation(); next() }}
                        aria-label="Next"
                    >
                        <ChevronRight className="w-9 h-9" />
                    </button>

                    <p className="absolute bottom-4 text-zinc-500 text-sm tracking-widest">
                        {lightbox + 1} / {photos.length}
                    </p>
                </div>
            )}
        </>
    )
}
