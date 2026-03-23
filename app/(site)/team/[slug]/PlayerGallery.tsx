'use client'

import { useEffect, useRef, useState } from 'react'
import Lightbox from '@/components/Lightbox'
import type { SanityPlayerPhoto } from '@/sanity/lib/queries'

export default function PlayerGallery({ photos, playerName }: { photos: SanityPlayerPhoto[], playerName: string }) {
    const sectionRef = useRef<HTMLDivElement>(null)
    const [parallax, setParallax] = useState(0)
    const [lightbox, setLightbox] = useState(-1)

    const row1 = photos.filter((_, i) => i % 2 === 0)
    const row2 = photos.filter((_, i) => i % 2 === 1)

    useEffect(() => {
        const onScroll = () => {
            if (!sectionRef.current) return
            const rect = sectionRef.current.getBoundingClientRect()
            const progress = 1 - (rect.bottom / (window.innerHeight + rect.height))
            setParallax(Math.max(0, progress * 180))
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    const urls = photos.map(p => p.url)

    const photoIndex = (rowIdx: number, row: 0 | 1) => rowIdx * 2 + row

    return (
        <>
            <div ref={sectionRef} className="pb-20 overflow-hidden">
                <div className="flex items-center gap-4 mb-10 px-8">
                    <div className="w-8 h-0.5 bg-[#78c3ef]" />
                    <h2 className="text-2xl font-claymore text-[#78c3ef] uppercase tracking-widest">Gallery</h2>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex justify-center overflow-hidden w-full">
                        <div
                            className="flex gap-3 will-change-transform"
                            style={{ transform: `translateX(${-parallax}px)` }}
                        >
                            {row1.map((photo, i) => (
                                <button
                                    key={photo._id}
                                    onClick={() => setLightbox(photoIndex(i, 0))}
                                    className="flex-shrink-0 h-60 md:h-80 overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                                    style={{ width: `${photo.aspectRatio * 240}px` }}
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

                    <div className="flex justify-center overflow-hidden w-full">
                        <div
                            className="flex gap-3 will-change-transform"
                            style={{ transform: `translateX(${parallax}px)` }}
                        >
                            {row2.map((photo, i) => (
                                <button
                                    key={photo._id}
                                    onClick={() => setLightbox(photoIndex(i, 1))}
                                    className="flex-shrink-0 h-60 md:h-80 overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                                    style={{ width: `${photo.aspectRatio * 240}px` }}
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

            <Lightbox
                images={urls}
                index={lightbox}
                onClose={() => setLightbox(-1)}
            />
        </>
    )
}
