'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { SanityPlayerPhoto } from '@/sanity/lib/queries'

export default function PlayerGallery({ photos, playerName }: { photos: SanityPlayerPhoto[], playerName: string }) {
    const sectionRef = useRef<HTMLDivElement>(null)
    const [parallax, setParallax] = useState(0)
    const [lightbox, setLightbox] = useState<number | null>(null)

    const row1 = photos.filter((_, i) => i % 2 === 0)
    const row2 = photos.filter((_, i) => i % 2 === 1)

    // Parallax: drive off raw scrollY so row 1 moves left and row 2 moves right
    useEffect(() => {
        const onScroll = () => {
            if (!sectionRef.current) return
            const rect = sectionRef.current.getBoundingClientRect()
            // Progress 0→1 as section scrolls through viewport
            const progress = 1 - (rect.bottom / (window.innerHeight + rect.height))
            setParallax(progress * 180)
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

    // Map row/index back to full photos array index
    const photoIndex = (rowIdx: number, row: 0 | 1) => rowIdx * 2 + row

    return (
        <>
            <div ref={sectionRef} className="pb-20 overflow-hidden">
                <div className="flex items-center gap-4 mb-10 px-8">
                    <div className="w-8 h-0.5 bg-[#78c3ef]" />
                    <h2 className="text-2xl font-claymore text-[#78c3ef] uppercase tracking-widest">Gallery</h2>
                </div>

                <div className="flex flex-col gap-4">
                    {/* Row 1 — centered, drifts left on scroll */}
                    <div className="flex justify-center">
                        <div
                            className="flex gap-3 will-change-transform"
                            style={{ transform: `translateX(${-parallax}px)` }}
                        >
                            {row1.map((photo, i) => (
                                <button
                                    key={photo._id}
                                    onClick={() => setLightbox(photoIndex(i, 0))}
                                    className="flex-shrink-0 h-80 overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                                    style={{ width: `${photo.aspectRatio * 320}px` }}
                                >
                                    <img
                                        src={photo.url}
                                        alt={playerName}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Row 2 — centered, drifts right on scroll */}
                    <div className="flex justify-center">
                        <div
                            className="flex gap-3 will-change-transform"
                            style={{ transform: `translateX(${parallax}px)` }}
                        >
                            {row2.map((photo, i) => (
                                <button
                                    key={photo._id}
                                    onClick={() => setLightbox(photoIndex(i, 1))}
                                    className="flex-shrink-0 h-80 overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                                    style={{ width: `${photo.aspectRatio * 320}px` }}
                                >
                                    <img
                                        src={photo.url}
                                        alt={playerName}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                </button>
                            ))}
                        </div>
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
