import 'server-only'

import { cookies } from 'next/headers'
import { ClaymoresApiClient } from './api-client'
import { apiBaseUrl } from './auth-env'
import { decodeSession, findSessionCookie, type MemberToken } from './session-cookie'

/** The decoded member session (including API tokens), read from the httpOnly cookie. Server only. */
export async function getMemberToken(): Promise<MemberToken | null> {
    const found = findSessionCookie(await cookies())
    if (!found) return null
    const token = await decodeSession(found.value, found.name)
    return token?.api ? token : null
}

/** An API client authorized as the signed-in member, or null when signed out. */
export async function memberApi(): Promise<{ api: ClaymoresApiClient; token: MemberToken & { api: NonNullable<MemberToken['api']> } } | null> {
    const token = await getMemberToken()
    if (!token?.api) return null
    const api = new ClaymoresApiClient({ baseUrl: apiBaseUrl(), accessToken: token.api.accessToken })
    return { api, token: token as MemberToken & { api: NonNullable<MemberToken['api']> } }
}

/** Only allow same-site relative redirect targets. */
export function safeCallbackUrl(value: unknown, fallback = '/account'): string {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
    return value
}
