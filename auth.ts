// Auth.js (next-auth v5) for member sign-in on the website.
//
// Google is the only real provider. After Google OAuth, the signIn callback
// exchanges Google's id_token with the Claymores API for API tokens. Those
// tokens live only in the encrypted Auth.js session JWT (httpOnly cookie);
// the session callback never exposes them, and the site doesn't mount a
// client SessionProvider. proxy.ts rotates the refresh token.

import NextAuth, { type NextAuthConfig } from 'next-auth'
import type { Account } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { cookies } from 'next/headers'
import { exchangeGoogleIdToken, type ApiSession } from '@/lib/claymores/api-session'
import { devSignInEnabled, SIGNED_IN_HINT_COOKIE } from '@/lib/claymores/auth-env'
import { clearPendingGoogle, setPendingGoogle } from '@/lib/claymores/pending-google'
import { clearPendingInvite, getPendingInvite } from '@/lib/claymores/pending-invite'
import { apiClient, SESSION_MAX_AGE } from '@/lib/claymores/session-cookie'

declare module 'next-auth/jwt' {
    interface JWT {
        api?: ApiSession
    }
}

// The same Account object is passed to signIn and then jwt within one callback request.
const exchanged = new WeakMap<Account, ApiSession>()

const providers: NextAuthConfig['providers'] = [Google]

if (devSignInEnabled()) {
    // Development-only stand-in for Google, for the local mock API. The mock
    // accepts `dev-id-token:<email>` as an id_token. Never in production builds.
    providers.push(
        Credentials({
            id: 'dev',
            name: 'Development sign-in',
            credentials: { email: { label: 'Email', type: 'email' } },
            authorize(credentials) {
                const email = String(credentials?.email ?? '').trim().toLowerCase()
                if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null
                return { id: email, email, name: email.split('@')[0], idToken: `dev-id-token:${email}` } as never
            },
        }),
    )
}

function idTokenFor(account: Account | null | undefined, user: { idToken?: unknown }) {
    if (!account) return null
    if (account.provider === 'google') return account.id_token ?? null
    if (account.provider === 'dev' && devSignInEnabled() && typeof user.idToken === 'string') return user.idToken
    return null
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers,
    trustHost: true,
    session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE },
    pages: { signIn: '/sign-in', error: '/sign-in' },
    callbacks: {
        async signIn({ account, user }) {
            const idToken = idTokenFor(account, user as { idToken?: unknown })
            if (!account || !idToken) return '/sign-in?error=invalid'

            let outcome = await exchangeGoogleIdToken(apiClient(), idToken)
            if (outcome.kind === 'not-invited') {
                // Came from an invite link: join as a player, then sign in for real.
                const invite = await getPendingInvite()
                if (invite) {
                    const redeemed = await apiClient().redeemInvite(idToken, invite)
                    await clearPendingInvite()
                    if (redeemed.ok) outcome = await exchangeGoogleIdToken(apiClient(), idToken)
                    else if (redeemed.status === 410) {
                        await setPendingGoogle({ idToken, name: user.name ?? null, email: user.email ?? null })
                        return '/sign-up?from=sign-in&invite=expired'
                    }
                }
            }
            switch (outcome.kind) {
                case 'signed-in': {
                    exchanged.set(account, outcome.session)
                    await clearPendingGoogle()
                    ;(await cookies()).set(SIGNED_IN_HINT_COOKIE, '1', {
                        path: '/',
                        sameSite: 'lax',
                        secure: process.env.NODE_ENV === 'production',
                        maxAge: SESSION_MAX_AGE,
                    })
                    return true
                }
                case 'not-invited':
                    await setPendingGoogle({ idToken, name: user.name ?? null, email: user.email ?? null })
                    return '/sign-up?from=sign-in'
                case 'invalid':
                    return '/sign-in?error=invalid'
                default:
                    return '/sign-in?error=unavailable'
            }
        },
        async jwt({ token, account }) {
            if (account) {
                const session = exchanged.get(account)
                exchanged.delete(account)
                if (!session) return null
                // Keep the cookie small: only what the site needs.
                return {
                    sub: session.user.subject,
                    name: session.user.name,
                    email: session.user.email,
                    api: session,
                }
            }
            return token
        },
        // Never put API tokens in the session object; /api/auth/session returns it to the browser.
        async session({ session, token }) {
            return {
                expires: session.expires,
                user: {
                    name: token.name ?? null,
                    email: token.email ?? '',
                    role: token.api?.user.role ?? null,
                },
            } as unknown as typeof session
        },
    },
})
