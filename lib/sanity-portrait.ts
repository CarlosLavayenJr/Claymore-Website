import type { ImageLoaderProps } from 'next/image'

export function sanityPortraitLoader(src: string) {
    if (!src.startsWith('https://cdn.sanity.io/')) return undefined

    return ({ src, width, quality }: ImageLoaderProps) => {
        const url = new URL(src)
        url.searchParams.set('w', String(width))
        url.searchParams.set('q', String(quality ?? 75))
        url.searchParams.set('auto', 'format')
        return url.href
    }
}
