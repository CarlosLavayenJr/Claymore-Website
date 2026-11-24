// API session lifecycle for the website (backend-for-frontend):
// Google id_token -> API tokens, and single-flight refresh-token rotation.
//
// The API rotates refresh tokens on every refresh and revokes the whole
// sign-in family if an already-rotated token is presented again. Two parallel
// requests from the same browser carry the same (old) session cookie, so a
// naive refresh-per-request would revoke the session. `createRefresher`
// shares one in-flight refresh per token and remembers the result briefly so a
// request that arrives with the old cookie just after rotation reuses the new
// tokens instead of presenting the old refresh token again.

import type { ApiTokens, ApiUser, ClaymoresApiClient } from './api-client'

export type ApiSession = {
    accessToken: string
    /** Epoch milliseconds. */
    accessTokenExpiresAt: number
    refreshToken: string
    user: ApiUser
}

export type ExchangeOutcome =
    | { kind: 'signed-in'; session: ApiSession }
    | { kind: 'not-invited' }
    | { kind: 'invalid' }
    | { kind: 'unavailable' }

export type RefreshOutcome =
    | { kind: 'refreshed'; session: ApiSession }
    /** Refresh token unknown, expired, revoked, or the invitation was removed. Sign the member out. */
    | { kind: 'revoked' }
    /** API unreachable or erroring. Keep the session and try again later. */
    | { kind: 'unavailable' }

export function toApiSession(tokens: ApiTokens): ApiSession {
    const expiresAt = Date.parse(tokens.accessTokenExpiresAt)
    if (!tokens.accessToken || !tokens.refreshToken || Number.isNaN(expiresAt)) {
        throw new Error('Claymores API returned an incomplete token response')
    }
    return {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: expiresAt,
        refreshToken: tokens.refreshToken,
        user: {
            subject: tokens.user?.subject,
            name: tokens.user?.name ?? null,
            email: tokens.user?.email,
            role: tokens.user?.role ?? null,
        },
    }
}

export async function exchangeGoogleIdToken(client: ClaymoresApiClient, idToken: string): Promise<ExchangeOutcome> {
    const result = await client.exchangeGoogleIdToken(idToken)
    if (result.ok) {
        try {
            return { kind: 'signed-in', session: toApiSession(result.data) }
        } catch {
            return { kind: 'unavailable' }
        }
    }
    if (result.status === 403 && result.error === 'not_invited') return { kind: 'not-invited' }
    if (result.status === 401 || result.status === 400) return { kind: 'invalid' }
    return { kind: 'unavailable' }
}

/** True when the access token expires within `skewMs` (default two minutes). */
export function needsRefresh(session: Pick<ApiSession, 'accessTokenExpiresAt'>, now = Date.now(), skewMs = 120_000) {
    return session.accessTokenExpiresAt - skewMs <= now
}

type RefresherOptions = {
    /** How long a completed rotation is remembered for late requests carrying the old token. */
    rememberMs?: number
    now?: () => number
}

export function createRefresher(client: ClaymoresApiClient, options: RefresherOptions = {}) {
    const rememberMs = options.rememberMs ?? 120_000
    const now = options.now ?? Date.now
    const inFlight = new Map<string, Promise<RefreshOutcome>>()
    const recent = new Map<string, { outcome: RefreshOutcome; until: number }>()

    function prune() {
        const t = now()
        for (const [key, entry] of recent) if (entry.until <= t) recent.delete(key)
    }

    async function run(refreshToken: string): Promise<RefreshOutcome> {
        const result = await client.refresh(refreshToken)
        if (result.ok) {
            try {
                return { kind: 'refreshed', session: toApiSession(result.data) }
            } catch {
                return { kind: 'unavailable' }
            }
        }
        if (result.status === 401 || result.status === 403) return { kind: 'revoked' }
        return { kind: 'unavailable' }
    }

    return {
        refresh(refreshToken: string): Promise<RefreshOutcome> {
            prune()
            const remembered = recent.get(refreshToken)
            if (remembered) return Promise.resolve(remembered.outcome)
            const pending = inFlight.get(refreshToken)
            if (pending) return pending

            const promise = run(refreshToken)
                .then(outcome => {
                    // Remember final outcomes only. An unavailable API should be retried.
                    if (outcome.kind !== 'unavailable') {
                        recent.set(refreshToken, { outcome, until: now() + rememberMs })
                    }
                    return outcome
                })
                .finally(() => inFlight.delete(refreshToken))
            inFlight.set(refreshToken, promise)
            return promise
        },
        /** For tests. */
        size: () => ({ inFlight: inFlight.size, recent: recent.size }),
    }
}

export type Refresher = ReturnType<typeof createRefresher>
