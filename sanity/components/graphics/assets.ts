import { parse, type Font } from 'opentype.js'
import type { GraphicData } from '@/lib/graphics/model'

let fontPromise: Promise<Font> | undefined
export function loadGraphicFont() {
    if (!fontPromise) {
        fontPromise = fetch('/fonts/VIKING-N.woff').then(async response => {
            if (!response.ok) throw new Error('Could not load the Claymores display font.')
            return parse(await response.arrayBuffer())
        }).catch(error => { fontPromise = undefined; throw error })
    }
    return fontPromise
}
async function inlineImage(url: string, width: number, signal?: AbortSignal): Promise<string> {
    // Sanity image URLs are public image assets; no Studio credentials leave the client.
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin !== window.location.origin && parsed.origin !== 'https://cdn.sanity.io') throw new Error('Unsupported graphic image source.')
    if (parsed.origin === 'https://cdn.sanity.io') parsed.search = `w=${width}&fit=max`
    const response = await fetch(parsed.href, { signal, credentials: 'omit' })
    if (!response.ok) throw new Error('Could not load a graphic image. Check the selected cutouts and logos.')
    const blob = await response.blob()
    if (!/^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/i.test(blob.type)) throw new Error('A selected image has an unsupported format.')
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Could not prepare the graphic image.'))
        reader.readAsDataURL(blob)
    })
}
export async function inlineGraphicAssets(data: GraphicData, signal?: AbortSignal): Promise<GraphicData> {
    const cache = new Map<string, Promise<string>>()
    const load = (url?: string, width = 1000) => {
        if (!url) return Promise.resolve(undefined)
        const key = `${url}:${width}`
        if (!cache.has(key)) cache.set(key, inlineImage(url, width, signal))
        return cache.get(key)!
    }
    const needsLineupPhotos = data.template === 'pitch'
    const [clubLogo, opponentLogo, background, featured, lineup] = await Promise.all([
        load(data.clubLogo, 360), load(data.opponentLogo, 360), load(data.background, 1350),
        Promise.all((data.template === 'featured' || data.template === 'threePlayers' ? data.featured : []).map(async p => ({ ...p, photo: await load(p.photo, data.template === 'threePlayers' ? 600 : 1000) }))),
        Promise.all(data.lineup.map(async p => ({ ...p, photo: needsLineupPhotos && (p.number ?? 0) <= 15 ? await load(p.photo, 240) : undefined }))),
    ])
    return { ...data, clubLogo, opponentLogo, background, featured, lineup }
}
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = filename
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function graphicPng(svg: string): Promise<Blob> {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    try {
        const img = new Image()
        img.src = url
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = 1080; canvas.height = 1350
        const context = canvas.getContext('2d')
        if (!context) throw new Error('PNG export is unavailable in this browser.')
        context.drawImage(img, 0, 0)
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'))
    } finally { URL.revokeObjectURL(url) }
}
