'use client'

import { useState } from 'react'
import { PortableText } from 'next-sanity'
import Lightbox from '@/components/Lightbox'

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

    const [index, setIndex] = useState(-1)

    const open = (url: string) => {
        const idx = allImages.indexOf(url)
        if (idx !== -1) setIndex(idx)
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

            <Lightbox images={allImages} index={index} onClose={() => setIndex(-1)} />
        </>
    )
}
