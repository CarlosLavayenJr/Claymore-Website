import 'server-only'

export function getGoogleSignInUrl(): string | null {
    const origin = process.env.CLAYMORES_GOOGLE_SIGN_IN_ORIGIN?.trim()
    if (!origin || process.env.VERCEL_ENV === 'production') return null

    const url = URL.parse(origin)
    if (!url || url.protocol !== 'https:' || url.username || url.password) return null
    return new URL('/auth/google', url).href
}
