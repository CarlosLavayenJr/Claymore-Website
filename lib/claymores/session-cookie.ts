// Reading and rewriting the Auth.js session cookie outside of Auth.js itself.
// The cookie is an encrypted JWE (AUTH_SECRET), httpOnly, and holds the API
// access and refresh tokens. Nothing here is sent to client JavaScript.
// Used by proxy.ts (which rotates tokens) and by server components/actions.

import { decode, encode, type JWT } from 'next-auth/jwt'
import { ClaymoresApiClient } from './api-client'
import { createRefresher, type ApiSession, type Refresher } from './api-session'
import { apiBaseUrl } from './auth-env'

export const SESSION_MAX_AGE = 30 * 24 * 60 * 60

const SECURE_NAME = '__Secure-authjs.session-token'
const PLAIN_NAME = 'authjs.session-token'

export type MemberToken = JWT & { api?: ApiSession }

type CookieReader = { getAll(): { name: string; value: string }[] }

/** Finds the session cookie (secure or not, possibly chunked) and returns its name and raw value. */
export function findSessionCookie(cookies: CookieReader): { name: string; secure: boolean; value: string } | null {
    const all = cookies.getAll()
    for (const [name, secure] of [[SECURE_NAME, true], [PLAIN_NAME, false]] as const) {
        const whole = all.find(c => c.name === name)
        if (whole) return { name, secure, value: whole.value }
        const chunks = all
            .filter(c => c.name.startsWith(`${name}.`))
            .map(c => ({ index: Number(c.name.slice(name.length + 1)), value: c.value }))
            .filter(c => Number.isInteger(c.index))
            .sort((a, b) => a.index - b.index)
        if (chunks.length) return { name, secure, value: chunks.map(c => c.value).join('') }
    }
    return null
}

export function sessionCookieName(secure: boolean) {
    return secure ? SECURE_NAME : PLAIN_NAME
}

export async function decodeSession(raw: string, cookieName: string): Promise<MemberToken | null> {
    const secret = process.env.AUTH_SECRET
    if (!secret) return null
    try {
        return (await decode({ token: raw, secret, salt: cookieName })) as MemberToken | null
    } catch {
        return null
    }
}

export async function encodeSession(token: MemberToken, cookieName: string): Promise<string> {
    const secret = process.env.AUTH_SECRET
    if (!secret) throw new Error('AUTH_SECRET is missing')
    return encode({ token, secret, salt: cookieName, maxAge: SESSION_MAX_AGE })
}

export function sessionCookieOptions(secure: boolean) {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure,
        maxAge: SESSION_MAX_AGE,
    }
}

export function apiClient() {
    return new ClaymoresApiClient({ baseUrl: apiBaseUrl() })
}

const globalForRefresher = globalThis as unknown as { __claymoresRefresher?: Refresher }

/** One refresher per server instance so concurrent requests share a single rotation. */
export function refresher(): Refresher {
    globalForRefresher.__claymoresRefresher ??= createRefresher(apiClient())
    return globalForRefresher.__claymoresRefresher
}
