import type { ReactNode } from 'react'
import JsonLd from '@/components/json-ld'
import YouTubeVideo from '@/components/youtube-video'
import { highlightVideo, videoObjectSchema } from '@/lib/highlight-video'

interface Props {
    eyebrow?: string
    title: ReactNode
    children?: ReactNode
}

// Split hero: copy + CTA on the left, highlight video on the right (stacked on mobile,
// copy first so the CTA stays above the fold). Includes VideoObject structured data.
export default function VideoHero({ eyebrow = 'Central Florida Claymores RFC', title, children }: Props) {
    return (
        <section className="bg-black text-white px-4 py-14 md:py-20">
            <JsonLd data={videoObjectSchema()} />
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
                <div className="text-center lg:text-left">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#fd80b5]">{eyebrow}</p>
                    <h1 className="mb-6 text-4xl font-claymore leading-tight md:text-5xl">{title}</h1>
                    {children}
                </div>

                <figure>
                    <YouTubeVideo id={highlightVideo.youtubeId} title={highlightVideo.title} priority />
                    <figcaption className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-400 lg:justify-start">
                        <span className="h-px w-6 bg-[#fd80b5]" aria-hidden="true" />
                        2026 season highlights · 2:42
                    </figcaption>
                </figure>
            </div>
        </section>
    )
}
