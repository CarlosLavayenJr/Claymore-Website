// Typed client for the member endpoints of the Claymores API. Server-side only
// in practice (it carries bearer tokens), but it has no `server-only` import so
// it can be unit tested with a fake fetch.

export type Role = 'player' | 'admin'

export type ApiUser = {
    subject: string
    name: string | null
    email: string
    role: Role | string | null
}

export type ApiTokens = {
    accessToken: string
    accessTokenExpiresAt: string
    refreshToken: string
    user: ApiUser
}

export type DuesAssessment = {
    id: string
    playerSubject?: string
    description: string
    amountCents: number
    dueDate: string | null
    paidCents: number
    balanceCents: number
    pendingCheckoutCents: number
}

export type DuesPayment = { id: string; amountCents: number; recordedAt: string }
export type DuesDetail = { assessment: DuesAssessment; payments: DuesPayment[] }

export type JoinRequestStatus = 'none' | 'pending' | 'approved' | 'denied'

/**
 * Shape of a join request in the admin list. The API contract for this list
 * is new, so optional fields are read defensively.
 */
export type JoinRequest = {
    id: string
    email: string
    name: string | null
    phone?: string | null
    message?: string | null
    status: JoinRequestStatus | string
    createdAt?: string | null
    requestedAt?: string | null
}

export type ClubInvitation = {
    email: string
    role: Role | string
    invitedBy?: string | null
    invitedAt?: string | null
}

export type ApiResult<T> =
    | { ok: true; status: number; data: T }
    | { ok: false; status: number; error: string | null; field?: string | null; body: unknown }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ClientOptions = {
    baseUrl: string
    accessToken?: string
    fetch?: FetchLike
    /** Request timeout in ms. */
    timeoutMs?: number
}

/** status 0 means the API could not be reached at all. */
export const UNREACHABLE = 0

export class ClaymoresApiClient {
    private readonly baseUrl: string
    private readonly accessToken?: string
    private readonly fetchImpl: FetchLike
    private readonly timeoutMs: number

    constructor(options: ClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '')
        this.accessToken = options.accessToken
        this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
        this.timeoutMs = options.timeoutMs ?? 10_000
    }

    withAccessToken(accessToken: string) {
        return new ClaymoresApiClient({
            baseUrl: this.baseUrl,
            accessToken,
            fetch: this.fetchImpl,
            timeoutMs: this.timeoutMs,
        })
    }

    async request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (body !== undefined) headers['Content-Type'] = 'application/json'
        if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`

        let response: Response
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                cache: 'no-store',
                signal: AbortSignal.timeout(this.timeoutMs),
            })
        } catch {
            return { ok: false, status: UNREACHABLE, error: 'unreachable', body: null }
        }

        const text = await response.text().catch(() => '')
        let parsed: unknown = null
        if (text) {
            try {
                parsed = JSON.parse(text)
            } catch {
                parsed = text
            }
        }

        if (response.ok) return { ok: true, status: response.status, data: parsed as T }

        const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
        const error = typeof record.error === 'string'
            ? record.error
            : typeof record.status === 'string' ? record.status : null
        const field = typeof record.field === 'string' ? record.field : null
        return { ok: false, status: response.status, error, field, body: parsed }
    }

    // --- Auth (no bearer) ---
    exchangeGoogleIdToken(idToken: string) {
        return this.request<ApiTokens>('POST', '/v1/auth/mobile/google', { idToken })
    }

    refresh(refreshToken: string) {
        return this.request<ApiTokens>('POST', '/v1/auth/mobile/refresh', { refreshToken })
    }

    logout(refreshToken: string) {
        return this.request<null>('POST', '/v1/auth/mobile/logout', { refreshToken })
    }

    requestAccess(input: { idToken: string; name: string; phone?: string; message?: string }) {
        return this.request<{ status: string; email?: string }>('POST', '/v1/auth/mobile/google/request-access', input)
    }

    requestStatus(idToken: string) {
        return this.request<{ status: JoinRequestStatus }>('POST', '/v1/auth/mobile/google/request-status', { idToken })
    }

    // --- Member (bearer) ---
    me() {
        return this.request<ApiUser>('GET', '/v1/me')
    }

    myDues() {
        return this.request<DuesAssessment[]>('GET', '/v1/dues/mine')
    }

    myDuesDetail(id: string) {
        return this.request<DuesDetail>('GET', `/v1/dues/mine/${encodeURIComponent(id)}`)
    }

    /** returnTo "web" sends the member back to the website's /account (API config Stripe:WebReturnUrl). */
    createCheckoutSession(id: string, amountCents: number, returnTo: 'app' | 'web' = 'web') {
        return this.request<{ url: string }>('POST', `/v1/dues/${encodeURIComponent(id)}/checkout-session`, { amountCents, returnTo })
    }

    // --- Admin (bearer, role=admin) ---
    joinRequests(status: JoinRequestStatus = 'pending') {
        return this.request<JoinRequest[]>('GET', `/v1/admin/join-requests?status=${encodeURIComponent(status)}`)
    }

    approveJoinRequest(id: string, role: Role) {
        return this.request<unknown>('POST', `/v1/admin/join-requests/${encodeURIComponent(id)}/approve`, { role })
    }

    denyJoinRequest(id: string, reason?: string) {
        return this.request<unknown>(
            'POST',
            `/v1/admin/join-requests/${encodeURIComponent(id)}/deny`,
            reason ? { reason } : {},
        )
    }

    invitations() {
        return this.request<ClubInvitation[]>('GET', '/v1/admin/invitations')
    }

    putInvitation(email: string, role: Role) {
        return this.request<ClubInvitation>('PUT', `/v1/admin/invitations/${encodeURIComponent(email)}`, { role })
    }

    deleteInvitation(email: string) {
        return this.request<null>('DELETE', `/v1/admin/invitations/${encodeURIComponent(email)}`)
    }
}

export function formatCents(cents: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

/** Parses a dollar amount typed by a member ("25", "25.5", "$1,025.00") into cents, or null. */
export function parseDollarsToCents(input: string): number | null {
    const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
    const [whole, fraction = ''] = cleaned.split('.')
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return Number.isSafeInteger(cents) ? cents : null
}
