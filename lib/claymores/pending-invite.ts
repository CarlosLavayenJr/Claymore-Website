import 'server-only'

// "Anyone with the link" invites: /invite/<token> keeps the token in an httpOnly cookie while
// the visitor signs in with Google. If the API says they aren't invited yet, the sign-in
// callback redeems the token (inviting them as a player) and signs them straight in.

import { cookies } from 'next/headers'

const COOKIE = 'claymores_invite'
const MAX_AGE = 60 * 60 // an hour to finish signing in

/** Tokens are 22 URL-safe characters; accept a little slack, nothing else. */
export function isInviteToken(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value)
}

export async function setPendingInvite(token: string) {
    ;(await cookies()).set(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: MAX_AGE,
    })
}

export async function getPendingInvite(): Promise<string | null> {
    const value = (await cookies()).get(COOKIE)?.value
    return isInviteToken(value) ? value : null
}

export async function clearPendingInvite() {
    ;(await cookies()).set(COOKIE, '', {
        path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    })
}
