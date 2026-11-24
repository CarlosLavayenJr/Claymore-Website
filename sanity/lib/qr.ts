export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.claymoresrfc.com'

export type QrCodeFields = {
    destination?: string
    medium?: string
    campaign?: string
}

// "/join" -> "https://www.claymoresrfc.com/join?utm_source=qr&utm_medium=flyer&utm_campaign=fall-recruiting"
// Full URLs are used as-is (plus UTM params). Returns null until a destination is set.
export function buildQrUrl({ destination, medium, campaign }: QrCodeFields): string | null {
    const trimmed = destination?.trim()
    if (!trimmed) return null

    let url: URL
    try {
        url = /^https?:\/\//i.test(trimmed)
            ? new URL(trimmed)
            : new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, SITE_URL)
    } catch {
        return null
    }

    if (campaign?.trim()) {
        url.searchParams.set('utm_source', 'qr')
        url.searchParams.set('utm_medium', medium?.trim() || 'print')
        url.searchParams.set('utm_campaign', slugify(campaign))
    }

    return url.toString()
}

export function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}
