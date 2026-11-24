// Redirect-target validation for ?callbackUrl=. No `server-only` import so it
// can be unit tested.

// Placeholder origin used only to resolve the value; never shown or redirected to.
const BASE = 'https://claymores.invalid'

// Browsers strip tabs and newlines from URLs, so `/\t/evil.com` becomes
// `//evil.com` (protocol-relative). Reject every C0 control character and DEL.
const CONTROL_CHARS = /[\x00-\x1f\x7f]/

/** Only allow same-origin, path-absolute redirect targets; anything else becomes `fallback`. */
export function safeCallbackUrl(value: unknown, fallback = '/account'): string {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback
    if (value.includes('\\') || CONTROL_CHARS.test(value)) return fallback

    let url: URL
    try {
        url = new URL(value, BASE)
    } catch {
        return fallback
    }
    // Dot segments can collapse into `//host` (e.g. `/.//evil.com`), so check the normalized path too.
    if (url.origin !== BASE || !url.pathname.startsWith('/') || url.pathname.startsWith('//')) return fallback
    return `${url.pathname}${url.search}${url.hash}`
}
