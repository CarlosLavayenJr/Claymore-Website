import 'server-only'

// A person who signs in with Google but isn't invited has no API session.
// To let them submit "Request to join" without signing in again, the Google
// id_token from that attempt is kept for 10 minutes in an encrypted,
// httpOnly cookie scoped to /sign-up. When it expires, they sign in with
// Google again.

import { cookies } from 'next/headers'
import { decode, encode } from 'next-auth/jwt'

const COOKIE = 'claymores_pending_google'
const SALT = 'claymores.pending-google'
export const PENDING_MAX_AGE = 10 * 60

export type PendingGoogle = { idToken: string; name: string | null; email: string | null }

function secure() {
    return process.env.NODE_ENV === 'production'
}

export async function setPendingGoogle(value: PendingGoogle) {
    const secret = process.env.AUTH_SECRET
    if (!secret) return
    const jar = await cookies()
    jar.set(COOKIE, await encode({ token: value, secret, salt: SALT, maxAge: PENDING_MAX_AGE }), {
        httpOnly: true,
        sameSite: 'lax',
        secure: secure(),
        path: '/sign-up',
        maxAge: PENDING_MAX_AGE,
    })
}

export async function getPendingGoogle(): Promise<PendingGoogle | null> {
    const secret = process.env.AUTH_SECRET
    if (!secret) return null
    const raw = (await cookies()).get(COOKIE)?.value
    if (!raw) return null
    try {
        const token = await decode({ token: raw, secret, salt: SALT })
        if (!token || typeof token.idToken !== 'string') return null
        return {
            idToken: token.idToken,
            name: typeof token.name === 'string' ? token.name : null,
            email: typeof token.email === 'string' ? token.email : null,
        }
    } catch {
        return null
    }
}

export async function clearPendingGoogle() {
    const jar = await cookies()
    jar.set(COOKIE, '', { path: '/sign-up', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: secure() })
}
