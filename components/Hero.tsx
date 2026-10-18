import Link from "next/link"
import { getImageProps } from "next/image"

const ALT = "Central Florida Claymores RFC — Orlando Rugby Club, USA Rugby D3"
const MOBILE_SRC =
    "https://cdn.sanity.io/images/bw1seoll/production/2d25cd34de4fe2d52dbb0a05508c2067dbfea8e3-916x1717.png"

interface Props {
    weekday: string
}

// Art-directed hero: one <picture> so the browser downloads only the image for the
// current breakpoint, loaded eagerly at high priority since it's the LCP element.
export default function RugbyHero({ weekday }: Props) {
    const common = { alt: ALT, fill: true, sizes: "100vw", quality: 75 } as const
    const {
        props: { srcSet: desktopSrcSet },
    } = getImageProps({ ...common, src: "/homepage/hero-desktop.webp" })
    const {
        props: { srcSet: mobileSrcSet, ...imgProps },
    } = getImageProps({ ...common, src: MOBILE_SRC, loading: "eager", fetchPriority: "high" })

    return (
        <section className="relative w-full h-[85svh] min-h-[520px] overflow-hidden bg-black">
            <picture>
                <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
                <img {...imgProps} srcSet={mobileSrcSet} alt={ALT} className="w-full h-full object-cover" />
            </picture>

            {/* Scrim keeps the headline readable over any photo */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" aria-hidden="true" />

            <div className="absolute inset-x-0 bottom-0 px-4 pb-12 md:pb-20">
                <div className="mx-auto max-w-5xl text-center md:text-left text-white">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#fd80b5]">
                        Central Florida Claymores RFC · USA Rugby D3
                    </p>
                    <h1 className="mb-4 text-4xl font-claymore leading-tight md:text-6xl">
                        Orlando&apos;s Rugby Club
                    </h1>
                    <p className="mb-8 max-w-xl text-lg text-gray-200 md:text-xl mx-auto md:mx-0">
                        No experience needed. Come to a {weekday} practice and see what rugby in Central Florida is all about.
                    </p>
                    <div className="flex flex-col items-center gap-4 sm:flex-row md:items-start">
                        <Link
                            href="/contact"
                            className="inline-block bg-[#77c3ef] text-white font-claymore text-xl px-10 py-4 rounded-md hover:bg-[#a0d5f5] transition-colors"
                        >
                            Join a Practice
                        </Link>
                        <Link
                            href="/join"
                            className="inline-flex items-center gap-2 font-semibold text-white hover:text-[#77c3ef] transition-colors"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-4 w-4">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </span>
                            Watch the 2026 highlights
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    )
}
