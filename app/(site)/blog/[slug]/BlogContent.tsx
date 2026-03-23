'use client'

import { useEffect, useRef, useState } from 'react'
import { PortableText } from 'next-sanity'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

type BodyBlock = { _type: string; asset?: { url?: string }; alt?: string; caption?: string }

interface Props {
    coverImageUrl: string | null
    coverImageAlt: string
    body: unknown[]
    excerpt: string | null
}

export default function BlogContent({ coverImageUrl, coverImageAlt, body, excerpt }: Props) {
    // Collect all zoomable image URLs in order: cover first, then inline body images
    const allImages: string[] = [
        ...(coverImageUrl ? [coverImageUrl] : []),
        ...(body as BodyBlock[])
            .filter(b => b._type === 'image' && b.asset?.url)
            .map(b => b.asset!.url!),
    ]

    const [lightbox, setLightbox] = useState<number | null>(null)
    const touchStartX = useRef<number | null>(null)

    const open = (url: string) => {
        const idx = allImages.indexOf(url)
        if (idx !== -1) setLightbox(idx)
    }
    const prev = () => setLightbox(i => i !== null ? (i - 1 + allImages.length) % allImages.length : null)
    const next = () => setLightbox(i => i !== null ? (i + 1) % allImages.length : null)

    useEffect(() => {
        if (lightbox === null) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') next()
            if (e.key === 'ArrowLeft') prev()
            if (e.key === 'Escape') setLightbox(null)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [lightbox, allImages.length])

    const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return
        const delta = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(delta) > 40) delta < 0 ? next() : prev()
        touchStartX.current = null
    }

    const portableTextComponents = {
        types: {
            image: ({ value }: { value: BodyBlock }) => {
                if (!value.asset?.url) return null
                return (
                    <figure className="my-8">
                        <button
                            onClick={() => open(value.asset!.url!)}
                            className="w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#77c3ef] rounded-lg"
                            aria-label="Zoom image"
                        >
                            <img
                                src={value.asset.url}
                                alt={value.alt ?? ''}
                                className="w-full rounded-lg cursor-zoom-in transition-opacity hover:opacity-90"
                            />
                        </button>
                        {value.caption && (
                            <figcaption className="text-center text-sm text-gray-500 mt-2">{value.caption}</figcaption>
                        )}
                    </figure>
                )
            },
        },
    }

    return (
        <>
            {coverImageUrl && (
                <button
                    onClick={() => open(coverImageUrl)}
                    className="w-full mb-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#77c3ef] rounded-xl"
                    aria-label="Zoom cover image"
                >
                    <img
                        src={coverImageUrl}
                        alt={coverImageAlt}
                        className="w-full h-72 object-cover rounded-xl cursor-zoom-in transition-opacity hover:opacity-90"
                    />
                </button>
            )}

            {body && body.length > 0 ? (
                <div className="prose prose-lg max-w-none text-[#333333] [&_h2]:font-claymore [&_h2]:text-[#111111] [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:mb-5 [&_a]:text-[#77c3ef]">
                    <PortableText value={body as Parameters<typeof PortableText>[0]['value']} components={portableTextComponents} />
                </div>
            ) : excerpt ? (
                <p className="text-[#555555] leading-relaxed text-lg">{excerpt}</p>
            ) : null}

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

                    {allImages.length > 1 && (
                        <button
                            className="absolute left-2 md:left-4 text-white/70 hover:text-white p-3 transition-colors"
                            onClick={e => { e.stopPropagation(); prev() }}
                            aria-label="Previous"
                        >
                            <ChevronLeft className="w-9 h-9" />
                        </button>
                    )}

                    <img
                        src={allImages[lightbox]}
                        alt=""
                        className="max-h-[88vh] max-w-[80vw] object-contain rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />

                    {allImages.length > 1 && (
                        <button
                            className="absolute right-2 md:right-4 text-white/70 hover:text-white p-3 transition-colors"
                            onClick={e => { e.stopPropagation(); next() }}
                            aria-label="Next"
                        >
                            <ChevronRight className="w-9 h-9" />
                        </button>
                    )}

                    {allImages.length > 1 && (
                        <p className="absolute bottom-4 text-zinc-500 text-sm tracking-widest">
                            {lightbox + 1} / {allImages.length}
                        </p>
                    )}
                </div>
            )}
        </>
    )
}
