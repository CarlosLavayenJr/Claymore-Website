'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { SanityPlayerPhoto } from '@/sanity/lib/queries'

export default function PlayerGallery({ photos, playerName }: { photos: SanityPlayerPhoto[], playerName: string }) {
    const sectionRef = useRef<HTMLDivElement>(null)
    const [parallax, setParallax] = useState(0)
    const [lightbox, setLightbox] = useState<number | null>(null)

    const col1 = photos.filter((_, i) => i % 2 === 0)
    const col2 = photos.filter((_, i) => i % 2 === 1)

    // Parallax: columns move in opposite directions as you scroll
    useEffect(() => {
        const onScroll = () => {
            if (!sectionRef.current) return
            const rect = sectionRef.current.getBoundingClientRect()
            const center = rect.top + rect.height / 2 - window.innerHeight / 2
            setParallax(center * 0.12)
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    // Keyboard nav
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

    // Map col/row index back to full photos array index
    const photoIndex = (colIdx: number, col: 0 | 1) => colIdx * 2 + col

    return (
        <>
            <div ref={sectionRef} className="px-8 pb-20 overflow-hidden">
                <div className="flex items-center gap-4 mb-10">
                    <div className="w-8 h-0.5 bg-[#78c3ef]" />
                    <h2 className="text-2xl font-claymore text-[#78c3ef] uppercase tracking-widest">Gallery</h2>
                </div>

                <div className="flex gap-4 items-start">
                    {/* Column 1 — moves upward on scroll */}
                    <div
                        className="flex-1 flex flex-col gap-4 will-change-transform"
                        style={{ transform: `translateY(${-parallax}px)` }}
                    >
                        {col1.map((photo, i) => (
                            <button
                                key={photo._id}
                                onClick={() => setLightbox(photoIndex(i, 0))}
                                className="w-full overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                            >
                                <img
                                    src={photo.url}
                                    alt={playerName}
                                    className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                            </button>
                        ))}
                    </div>

                    {/* Column 2 — offset down, moves downward on scroll */}
                    <div
                        className="flex-1 flex flex-col gap-4 will-change-transform mt-16"
                        style={{ transform: `translateY(${parallax}px)` }}
                    >
                        {col2.map((photo, i) => (
                            <button
                                key={photo._id}
                                onClick={() => setLightbox(photoIndex(i, 1))}
                                className="w-full overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                            >
                                <img
                                    src={photo.url}
                                    alt={playerName}
                                    className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {lightbox !== null && (
                <div
                    className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
                    onClick={() => setLightbox(null)}
                >
                    {/* Close */}
                    <button
                        className="absolute top-5 right-5 text-white/70 hover:text-white transition-colors p-2"
                        onClick={() => setLightbox(null)}
                        aria-label="Close"
                    >
                        <X className="w-7 h-7" />
                    </button>

                    {/* Prev */}
                    <button
                        className="absolute left-4 text-white/70 hover:text-white transition-colors p-3"
                        onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + photos.length) % photos.length) }}
                        aria-label="Previous"
                    >
                        <ChevronLeft className="w-10 h-10" />
                    </button>

                    {/* Image */}
                    <img
                        src={photos[lightbox].url}
                        alt={playerName}
                        className="max-h-[88vh] max-w-[80vw] object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Next */}
                    <button
                        className="absolute right-4 text-white/70 hover:text-white transition-colors p-3"
                        onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % photos.length) }}
                        aria-label="Next"
                    >
                        <ChevronRight className="w-10 h-10" />
                    </button>

                    {/* Counter */}
                    <p className="absolute bottom-5 text-zinc-500 text-sm tracking-widest">
                        {lightbox + 1} / {photos.length}
                    </p>
                </div>
            )}
        </>
    )
}
