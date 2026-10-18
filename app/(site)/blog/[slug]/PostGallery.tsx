'use client'

import { useState } from 'react'
import Lightbox from '@/components/Lightbox'
import type { SanityPlayerPhoto } from '@/sanity/lib/queries'
import { sanityWidth } from '@/lib/utils'

export default function PostGallery({ photos, title }: { photos: SanityPlayerPhoto[]; title: string }) {
    const [index, setIndex] = useState(-1)
    const urls = photos.map(p => p.url)

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
                            onClick={() => setIndex(i)}
                            aria-label={`Enlarge photo ${i + 1} of ${photos.length}`}
                            className="block w-full overflow-hidden rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78c3ef]"
                        >
                            <img
                                src={sanityWidth(photo.url, 600)}
                                alt={photo.altText || `${title} — photo ${i + 1}`}
                                loading="lazy"
                                decoding="async"
                                className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                        </button>
                    ))}
                </div>
            </div>

            <Lightbox images={urls} index={index} onClose={() => setIndex(-1)} />
        </>
    )
}
