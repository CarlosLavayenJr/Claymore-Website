// Next 16 proxy (formerly middleware). Protects /account* and keeps the
// member's API session fresh: when the access token is about to expire it
// rotates the refresh token once (single-flight per token), writes the new
// encrypted session cookie on the response, and rewrites the request cookie
// so the page rendered in this same request already sees the new tokens and
// never presents the old refresh token again.

import { NextResponse, type NextRequest } from 'next/server'
import { needsRefresh } from '@/lib/claymores/api-session'
import { memberAuthEnabled, SIGNED_IN_HINT_COOKIE } from '@/lib/claymores/auth-env'
import {
    decodeSession,
    encodeSession,
    findSessionCookie,
    refresher,
    sessionCookieOptions,
    SESSION_MAX_AGE,
} from '@/lib/claymores/session-cookie'

export const config = {
    matcher: ['/account', '/account/:path*'],
}

function hintOptions(secure: boolean) {
    return { path: '/', sameSite: 'lax' as const, secure, maxAge: SESSION_MAX_AGE }
}

function toSignIn(request: NextRequest, error?: string, clearCookie?: string) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    url.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    if (error) url.searchParams.set('error', error)
    const response = NextResponse.redirect(url)
    if (clearCookie) response.cookies.delete(clearCookie)
    response.cookies.delete(SIGNED_IN_HINT_COOKIE)
    response.headers.set('Cache-Control', 'no-store')
    return response
}

export async function proxy(request: NextRequest) {
    // Feature off: the pages render "Sign-in is coming soon".
    if (!memberAuthEnabled()) return NextResponse.next()

    const found = findSessionCookie(request.cookies)
    const token = found ? await decodeSession(found.value, found.name) : null
    if (!found || !token?.api) return toSignIn(request, undefined, found?.name)

    const secure = found.secure
    if (!needsRefresh(token.api)) {
        const response = NextResponse.next()
        if (!request.cookies.has(SIGNED_IN_HINT_COOKIE)) {
            response.cookies.set(SIGNED_IN_HINT_COOKIE, '1', hintOptions(secure))
        }
        return response
    }

    const outcome = await refresher().refresh(token.api.refreshToken)
    if (outcome.kind === 'revoked') return toSignIn(request, 'expired', found.name)
    // API unreachable: keep the session; the page shows a branded error state.
    if (outcome.kind === 'unavailable') return NextResponse.next()

    const encoded = await encodeSession({ ...token, api: outcome.session }, found.name)

    // Drop any chunked cookies and hand the rotated session to this request's render.
    const chunks = request.cookies.getAll().map(c => c.name).filter(name => name.startsWith(`${found.name}.`))
    for (const name of chunks) request.cookies.delete(name)
    request.cookies.set(found.name, encoded)
    const response = NextResponse.next({ request: { headers: request.headers } })
    for (const name of chunks) response.cookies.delete(name)
    response.cookies.set(found.name, encoded, sessionCookieOptions(secure))
    response.cookies.set(SIGNED_IN_HINT_COOKIE, '1', hintOptions(secure))
    response.headers.set('Cache-Control', 'no-store')
    return response
}
