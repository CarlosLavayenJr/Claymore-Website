'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Lightbox from '@/components/Lightbox'
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

    const [activeIndex, setActiveIndex] = useState(-1)

    const urls = displayed.map(p => p.url)

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
            <div className={`grid ${cols}`}>
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

            <Lightbox
                images={urls}
                index={activeIndex}
                onClose={() => setActiveIndex(-1)}
            />
        </>
    )
}
