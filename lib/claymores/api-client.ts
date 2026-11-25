// Typed client for the member endpoints of the Claymores API. Server-side only
// in practice (it carries bearer tokens), but it has no `server-only` import so
// it can be unit tested with a fake fetch.

/** A role an admin can give (see lib/claymores/roles.ts). The API also reports 'superadmin'. */
export type Role = 'player' | 'coach' | 'admin'

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
    /**
     * The part of `paidCents` that is volunteer or waived credit rather than money.
     * Missing from older API versions: treat as 0.
     */
    creditedCents?: number
    balanceCents: number
    pendingCheckoutCents: number
}

/**
 * How a payment was made. "stripe" is set by the API for card checkouts; admins record the rest.
 * "volunteer" (time or work for the club) and "waived" (forgiven by the club) are credits, not
 * money, and the API requires a note for them.
 */
export type PaymentMethod = 'stripe' | 'cash' | 'venmo' | 'zelle' | 'check' | 'other' | 'volunteer' | 'waived'
/** Methods an admin can record by hand (everything except Stripe). */
export type ManualPaymentMethod = Exclude<PaymentMethod, 'stripe'>

export type DuesPayment = {
    id: string
    amountCents: number
    recordedAt: string
    /** null for payments recorded before methods were tracked. */
    method?: PaymentMethod | string | null
    /** Admin-only; always null on the player routes. */
    note?: string | null
    /** Admin-only: set when an admin undid the payment (it no longer counts). Players never see undone payments. */
    voidedAt?: string | null
    voidedBy?: string | null
    voidReason?: string | null
}
export type DuesDetail = { assessment: DuesAssessment; payments: DuesPayment[] }

/** A dues assessment as the admin routes return it: always names the player. */
export type AdminDuesAssessment = DuesAssessment & { playerSubject: string }
export type AdminDuesDetail = { assessment: AdminDuesAssessment; payments: DuesPayment[] }

/** A member who has signed in at least once (GET /v1/admin/members). */
/** `role`: superadmin, coach, admin or player (older APIs leave it out). */
export type ClubMember = { subject: string; email: string; name: string | null; role?: string | null }

/** Same dues for every member who has signed in. `batchId` makes a retry create nothing new. */
export type NewDuesForAllMembers = {
    batchId: string
    description: string
    amountCents: number
    dueDate?: string
    /** Leave out members who already have dues with this description (default true). */
    skipExisting: boolean
}

export type AssignAllResult = { created: number; skipped: number; members: number }

/**
 * Dues every player gets when they sign in or open their dues (GET/PUT /v1/admin/dues/automatic).
 * Never set: `{ enabled: false, description: "Season dues", amountCents: 0, dueDate: null }`.
 */
export type AutomaticDues = {
    enabled: boolean
    description: string
    amountCents: number
    dueDate: string | null
}

/** PUT body: description 1-120 characters, amountCents > 0, dueDate YYYY-MM-DD or null. */
export type AutomaticDuesInput = {
    enabled: boolean
    description: string
    amountCents: number
    dueDate: string | null
}

export type NewDuesAssessment = {
    /** Client-generated idempotency key; reuse it (with the identical body) on retry. */
    id: string
    playerSubject: string
    description: string
    amountCents: number
    dueDate?: string
}

export type NewDuesPayment = {
    /** Client-generated idempotency key; reuse it (with the identical body) on retry. */
    id: string
    amountCents: number
    method: ManualPaymentMethod
    note?: string
}

/** An "anyone with the link" invite (GET /v1/admin/invite-links). */
export type InviteLink = {
    id: string
    token: string
    createdBy: string | null
    createdAt: string
    expiresAt: string
    revokedAt: string | null
    uses: number
    active: boolean
}

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

/** A member's answer for a match. "unavailable" shows as "Out". */
export type AvailabilityStatus = 'available' | 'maybe' | 'unavailable'

export type AvailabilityCounts = { available: number; maybe: number; unavailable: number; noReply: number }

/** GET/PUT /v1/fixtures/{id}/availability: my answer, the club's counts, and whether answers are open. */
export type MyAvailability = {
    fixtureId: string
    status: AvailabilityStatus | null
    note: string | null
    updatedAt: string | null
    counts: AvailabilityCounts
    /** False after match day (Orlando time): answers are closed. */
    open: boolean
}

/** GET /v1/availability/mine: my answers for matches from today on. */
export type MyAvailabilityAnswer = { fixtureId: string; status: AvailabilityStatus; note: string | null }

/** One member's answer for admins. status null: no reply yet. */
export type MemberAvailability = {
    subject: string
    email: string
    name: string | null
    status: AvailabilityStatus | null
    note: string | null
    updatedAt: string | null
}

export type FixtureAvailability = { fixtureId: string; counts: AvailabilityCounts; members: MemberAvailability[] }

/** 1-15 starters, 16-23 replacements. `name` is null when the member has no name on file. */
export type LineupSlot = { number: number; position: string; subject: string; name: string | null }

/** Members only ever see "none" or "published"; admins also see "draft". */
export type LineupStatus = 'none' | 'draft' | 'published'

export type Lineup = {
    fixtureId: string
    status: LineupStatus
    publishedAt: string | null
    updatedAt: string | null
    slots: LineupSlot[]
}

export type SaveLineupInput = { slots: { number: number; subject: string }[]; publish: boolean }

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

    /** 200 {status: "joined" | "already_member"}; 410 when the link is expired, turned off, or wrong. */
    redeemInvite(idToken: string, inviteToken: string) {
        return this.request<{ status: 'joined' | 'already_member'; email?: string }>(
            'POST', '/v1/auth/mobile/google/redeem-invite', { idToken, inviteToken })
    }

    requestStatus(idToken: string) {
        return this.request<{ status: JoinRequestStatus }>('POST', '/v1/auth/mobile/google/request-status', { idToken })
    }

    // --- Member (bearer) ---
    me() {
        return this.request<ApiUser>('GET', '/v1/me')
    }

    /** Sets the caller's name; sign-in no longer replaces it. 400 when blank or over 80 characters. */
    setMyName(name: string) {
        return this.request<{ name: string }>('PUT', '/v1/me/name', { name })
    }

    /** Admin: sets any member's name. 404 when there's no such member. */
    setMemberName(subject: string, name: string) {
        return this.request<{ subject: string; name: string }>('PUT', `/v1/admin/members/${encodeURIComponent(subject)}/name`, { name })
    }

    /** 204 on success; 409 `last_admin` when the caller is the club's only admin. */
    deleteMe() {
        return this.request<null>('DELETE', '/v1/me')
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

    /** 404 when the API doesn't know the fixture. */
    fixtureAvailability(fixtureId: string) {
        return this.request<MyAvailability>('GET', `/v1/fixtures/${encodeURIComponent(fixtureId)}/availability`)
    }

    /** 400 invalid status or note over 200 characters; 404 unknown fixture; 409 the match has been played. */
    answerAvailability(fixtureId: string, status: AvailabilityStatus, note: string | null) {
        return this.request<MyAvailability>('PUT', `/v1/fixtures/${encodeURIComponent(fixtureId)}/availability`, { status, note })
    }

    myAvailability() {
        return this.request<MyAvailabilityAnswer[]>('GET', '/v1/availability/mine')
    }

    /** The published lineup (status "none" until an admin publishes one). */
    fixtureLineup(fixtureId: string) {
        return this.request<Lineup>('GET', `/v1/fixtures/${encodeURIComponent(fixtureId)}/lineup`)
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

    /** Members who have signed in at least once (the dues player picker). */
    members() {
        return this.request<ClubMember[]>('GET', '/v1/admin/members')
    }

    /** Every dues assessment in the club. 404 when dues are switched off in the API. */
    allDues() {
        return this.request<AdminDuesAssessment[]>('GET', '/v1/admin/dues')
    }

    duesDetail(id: string) {
        return this.request<AdminDuesDetail>('GET', `/v1/admin/dues/${encodeURIComponent(id)}`)
    }

    /** 201 on success. Idempotent on `input.id`. */
    createDues(input: NewDuesAssessment) {
        return this.request<unknown>('POST', '/v1/admin/dues', input)
    }

    assignDuesToAllMembers(input: NewDuesForAllMembers) {
        return this.request<AssignAllResult>('POST', '/v1/admin/dues/all-members', input)
    }

    /** The automatic dues setting. 404 when dues are switched off in the API. */
    getAutomaticDues() {
        return this.request<AutomaticDues>('GET', '/v1/admin/dues/automatic')
    }

    /** Saves the automatic dues setting; 200 with the saved setting, 400 `{ error }` when invalid. */
    saveAutomaticDues(input: AutomaticDuesInput) {
        return this.request<AutomaticDues>('PUT', '/v1/admin/dues/automatic', input)
    }

    /**
     * Removes a dues item with no payments and no card checkout in progress. 204 on success,
     * 404 when it's gone, 409 `{ error }` when it has payments or a checkout. Removed dues are
     * never assigned again automatically.
     */
    removeDues(id: string) {
        return this.request<null>('DELETE', `/v1/admin/dues/${encodeURIComponent(id)}`)
    }

    /** Records a cash/Venmo/Zelle/check/other payment. Idempotent on `input.id`. */
    /** 204; 400 without a reason; 409 when it was already undone with another reason. */
    voidDuesPayment(assessmentId: string, paymentId: string, reason: string) {
        return this.request<null>('POST',
            `/v1/admin/dues/${encodeURIComponent(assessmentId)}/payments/${encodeURIComponent(paymentId)}/void`, { reason })
    }

    /** 204; 400 when too long or a volunteer/waived credit would lose its note; 409 when undone. */
    editDuesPaymentNote(assessmentId: string, paymentId: string, note: string | null) {
        return this.request<null>('PATCH',
            `/v1/admin/dues/${encodeURIComponent(assessmentId)}/payments/${encodeURIComponent(paymentId)}`, { note })
    }

    /** Every current member with their answer (status null: no reply). */
    adminFixtureAvailability(fixtureId: string) {
        return this.request<FixtureAvailability>('GET', `/v1/admin/fixtures/${encodeURIComponent(fixtureId)}/availability`)
    }

    /** The lineup, draft or published. */
    adminFixtureLineup(fixtureId: string) {
        return this.request<Lineup>('GET', `/v1/admin/fixtures/${encodeURIComponent(fixtureId)}/lineup`)
    }

    /**
     * Replaces the whole lineup. 400 `{ error }` for bad or repeated numbers, a player picked twice, or a
     * non-member. The first publish notifies the selected players.
     */
    saveFixtureLineup(fixtureId: string, input: SaveLineupInput) {
        return this.request<Lineup>('PUT', `/v1/admin/fixtures/${encodeURIComponent(fixtureId)}/lineup`, input)
    }

    inviteLinks() {
        return this.request<InviteLink[]>('GET', '/v1/admin/invite-links')
    }

    createInviteLink(expiresInDays: number) {
        return this.request<InviteLink>('POST', '/v1/admin/invite-links', { expiresInDays })
    }

    revokeInviteLink(id: string) {
        return this.request<null>('DELETE', `/v1/admin/invite-links/${encodeURIComponent(id)}`)
    }

    recordDuesPayment(assessmentId: string, input: NewDuesPayment) {
        return this.request<unknown>('POST', `/v1/admin/dues/${encodeURIComponent(assessmentId)}/payments`, input)
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
