'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { SanityTeamPhoto } from '@/sanity/lib/queries'

interface Props {
    photos: SanityTeamPhoto[]
    count?: number
}

export default function TeamPhotoGrid({ photos, count = 4 }: Props) {
    const [displayed, setDisplayed] = useState<SanityTeamPhoto[]>([])

    useEffect(() => {
        const shuffled = [...photos].sort(() => Math.random() - 0.5)
        setDisplayed(shuffled.slice(0, count))
    }, [photos, count])

    const [activeIndex, setActiveIndex] = useState<number | null>(null)

    const close = () => setActiveIndex(null)
    const prev = () => setActiveIndex((i) => (i === null ? null : (i - 1 + displayed.length) % displayed.length))
    const next = () => setActiveIndex((i) => (i === null ? null : (i + 1) % displayed.length))

    if (displayed.length === 0) return null

    const n = displayed.length
    const cols =
        n === 1 ? 'grid-cols-1' :
        n === 2 ? 'grid-cols-2' :
        n === 3 ? 'grid-cols-3' :
        n === 4 ? 'grid-cols-2 md:grid-cols-4' :
        n === 6 ? 'grid-cols-2 md:grid-cols-3' :
        n % 4 === 0 ? 'grid-cols-2 md:grid-cols-4' :
        n % 3 === 0 ? 'grid-cols-3' :
        'grid-cols-2 md:grid-cols-4'

    return (
        <>
            <div className={`grid ${cols} gap-1`}>
                {displayed.map((photo, i) => (
                    <button
                        key={photo._id}
                        onClick={() => setActiveIndex(i)}
                        className="relative h-48 md:h-56 overflow-hidden group focus:outline-none"
                    >
                        <Image
                            src={photo.url}
                            alt="Central Florida Claymores RFC"
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="(max-width: 768px) 50vw, 25vw"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                    </button>
                ))}
            </div>

            {/* Lightbox */}
            {activeIndex !== null && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                    onClick={close}
                >
                    {/* Close */}
                    <button
                        className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300 focus:outline-none"
                        onClick={close}
                        aria-label="Close"
                    >
                        &times;
                    </button>

                    {/* Prev */}
                    {displayed.length > 1 && (
                        <button
                            className="absolute left-4 text-white text-4xl px-4 py-2 hover:text-gray-300 focus:outline-none"
                            onClick={(e) => { e.stopPropagation(); prev() }}
                            aria-label="Previous"
                        >
                            &#8249;
                        </button>
                    )}

                    {/* Image */}
                    <div
                        className="relative w-full max-w-4xl max-h-[85vh] mx-16"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Image
                            src={displayed[activeIndex].url}
                            alt="Central Florida Claymores RFC"
                            width={1200}
                            height={800}
                            className="object-contain w-full h-full max-h-[85vh]"
                        />
                    </div>

                    {/* Next */}
                    {displayed.length > 1 && (
                        <button
                            className="absolute right-4 text-white text-4xl px-4 py-2 hover:text-gray-300 focus:outline-none"
                            onClick={(e) => { e.stopPropagation(); next() }}
                            aria-label="Next"
                        >
                            &#8250;
                        </button>
                    )}

                    {/* Counter */}
                    <p className="absolute bottom-4 text-gray-400 text-sm">
                        {activeIndex + 1} / {displayed.length}
                    </p>
                </div>
            )}
        </>
    )
}
