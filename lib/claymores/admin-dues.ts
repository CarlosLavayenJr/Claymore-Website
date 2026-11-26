// Pure helpers for the Club Admin "Manage dues" section: form parsing, labels,
// and mapping API results to what the admin sees. Shared by the server actions,
// the page, and the unit tests (no Next.js imports).

import {
    formatCents,
    parseDollarsToCents,
    type ApiResult,
    type AutomaticDues,
    type AutomaticDuesInput,
    type ClubMember,
    type DuesAssessment,
    type ManualPaymentMethod,
    type NewDuesAssessment,
    type NewDuesPayment,
} from './api-client'

export const DUES_LIMITS = {
    description: 120,
    note: 500,
    /** $100,000. Well above any real dues; keeps cents far inside the API's integer range. */
    maxCents: 10_000_000,
} as const

export const DEFAULT_DUES_DESCRIPTION = 'Season dues'

/**
 * Methods an admin can record by hand. `kind: 'credit'` methods count toward the balance but
 * aren't money (time volunteered, or dues the club forgives); the API requires a note for them.
 * `option` is the wording in the record-payment picker; `label` is how history lines show it.
 */
export const MANUAL_PAYMENT_METHODS: readonly {
    value: ManualPaymentMethod
    label: string
    option: string
    kind: 'money' | 'credit'
}[] = [
    { value: 'cash', label: 'Cash', option: 'Cash', kind: 'money' },
    { value: 'venmo', label: 'Venmo', option: 'Venmo', kind: 'money' },
    { value: 'zelle', label: 'Zelle', option: 'Zelle', kind: 'money' },
    { value: 'check', label: 'Check', option: 'Check', kind: 'money' },
    { value: 'other', label: 'Other', option: 'Other', kind: 'money' },
    { value: 'volunteer', label: 'Volunteered', option: 'Volunteered (time, not money)', kind: 'credit' },
    { value: 'waived', label: 'Waived', option: 'Waived', kind: 'credit' },
]

/** True for volunteer/waived: credit toward dues, not money, and a note is required. */
export function isCreditMethod(method: string | null | undefined): boolean {
    return MANUAL_PAYMENT_METHODS.some(m => m.value === method && m.kind === 'credit')
}

/** Placeholder for the record-payment note, prompting for what a credit needs explained. */
export function notePlaceholder(method: string | null | undefined): string {
    if (method === 'volunteer') return 'What did they do? e.g. Reffed U12 game 3/14'
    if (method === 'waived') return 'Why? e.g. Scholarship, injury'
    return 'Paid cash at practice 11/20'
}

/** Why a credit can't be saved without a note; null when the method doesn't need one. */
export function noteRequiredMessage(method: string | null | undefined): string | null {
    if (method === 'volunteer') return 'Add a note saying what they did for the club (e.g. “Reffed U12 game 3/14”).'
    if (method === 'waived') return 'Add a note saying why the dues are waived (e.g. “Scholarship”).'
    return null
}

/** Credited cents on an assessment (volunteer/waived), clamped to 0..paid; missing reads as 0. */
export function creditedCentsOf(dues: Pick<DuesAssessment, 'paidCents' | 'creditedCents'>): number {
    const credited = typeof dues.creditedCents === 'number' && Number.isFinite(dues.creditedCents) ? dues.creditedCents : 0
    return Math.min(Math.max(0, credited), Math.max(0, dues.paidCents))
}

/** Waived cents on an assessment, clamped to 0..credited; missing reads as 0. */
export function waivedCentsOf(dues: Pick<DuesAssessment, 'paidCents' | 'creditedCents' | 'waivedCents'>): number {
    const waived = typeof dues.waivedCents === 'number' && Number.isFinite(dues.waivedCents) ? dues.waivedCents : 0
    return Math.min(Math.max(0, waived), creditedCentsOf(dues))
}

/**
 * Where one player's dues stand. "Paid in full" means money covered it; an item settled only by
 * credit is "Waived" or "Volunteered" (or both), so a waiver never reads as a payment.
 */
export type DuesStatusKind = 'paid' | 'waived' | 'volunteered' | 'partly' | 'unpaid'

export function duesStatus(dues: Pick<DuesAssessment, 'paidCents' | 'creditedCents' | 'waivedCents' | 'balanceCents'>):
    { kind: DuesStatusKind; label: string } {
    const credited = creditedCentsOf(dues)
    const waived = waivedCentsOf(dues)
    const volunteered = credited - waived
    // Older APIs don't split credit: call it waived, which is what most credit is.
    const creditWord = waived > 0 && volunteered > 0 ? 'waived & volunteered'
        : volunteered > 0 && dues.waivedCents !== undefined ? 'volunteered' : 'waived'
    if (dues.balanceCents > 0) {
        return dues.paidCents > 0 ? { kind: 'partly', label: 'Balance due' } : { kind: 'unpaid', label: 'Balance due' }
    }
    const money = Math.max(0, dues.paidCents) - credited
    if (money > 0) return { kind: 'paid', label: credited > 0 ? `Paid · rest ${creditWord}` : 'Paid in full' }
    const kind = creditWord === 'volunteered' ? 'volunteered' : 'waived'
    return { kind, label: creditWord[0].toUpperCase() + creditWord.slice(1) }
}

/** "Waived", "Volunteered" or "Credited" for the credit column of one player's dues. */
export function creditLabel(dues: Pick<DuesAssessment, 'paidCents' | 'creditedCents' | 'waivedCents'>): string {
    const credited = creditedCentsOf(dues)
    const waived = waivedCentsOf(dues)
    if (dues.waivedCents === undefined || waived === credited) return 'Waived'
    return waived === 0 ? 'Volunteered' : 'Credited'
}

const METHOD_LABELS: Record<string, string> = {
    stripe: 'Card (Stripe)',
    ...Object.fromEntries(MANUAL_PAYMENT_METHODS.map(m => [m.value, m.label])),
}

/** "Card (Stripe)", "Cash", … ; null for payments recorded before methods were tracked. */
export function paymentMethodLabel(method: string | null | undefined): string | null {
    if (!method) return null
    return METHOD_LABELS[method] ?? 'Other'
}

export function isManualPaymentMethod(value: unknown): value is ManualPaymentMethod {
    return MANUAL_PAYMENT_METHODS.some(m => m.value === value)
}

/** "Name (email)", or just the email when the member has no name. */
export function memberLabel(member: Pick<ClubMember, 'email' | 'name'>): string {
    const name = member.name?.trim()
    return name ? `${name} (${member.email})` : member.email
}

/**
 * What to call each member in dues lists: their name, or their email when they have no name.
 * Two members with the same name get their email added, so they can be told apart.
 */
export function memberDisplayNames<T extends Pick<ClubMember, 'email' | 'name'> & { subject: string }>(
    members: readonly T[],
): Map<string, string> {
    const names = members.map(m => m.name?.trim() || m.email)
    const counts = new Map<string, number>()
    for (const n of names) counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) ?? 0) + 1)
    return new Map(members.map((m, i) => {
        const n = names[i]
        return [m.subject, (counts.get(n.toLowerCase()) ?? 0) > 1 && n !== m.email ? `${n} (${m.email})` : n]
    }))
}

/** Members sorted for the picker: by label, case-insensitive. */
export function sortMembers<T extends Pick<ClubMember, 'email' | 'name'>>(members: T[]): T[] {
    return [...members].sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), 'en', { sensitivity: 'base' }))
}

/** What an admin can still record by hand: the balance minus any Stripe checkout in flight. */
export function recordableCents(dues: Pick<DuesAssessment, 'balanceCents' | 'pendingCheckoutCents'>): number {
    return Math.max(0, dues.balanceCents - Math.max(0, dues.pendingCheckoutCents))
}

/** Cents as the plain dollar string an amount input expects ("25.50"). */
export function centsToDollarsInput(cents: number): string {
    return (Math.max(0, cents) / 100).toFixed(2)
}

/** Dollars typed by an admin into cents: positive, at most two decimals, below the sanity cap. */
export function parsePositiveDollars(input: string): { ok: true; cents: number } | { ok: false; message: string } {
    const cents = parseDollarsToCents(input.slice(0, 20))
    if (cents === null) return { ok: false, message: 'Enter an amount like 150 or 150.50 (no more than two decimals).' }
    if (cents <= 0) return { ok: false, message: 'Enter an amount greater than $0.' }
    if (cents > DUES_LIMITS.maxCents) return { ok: false, message: `Enter an amount up to ${formatCents(DUES_LIMITS.maxCents)}.` }
    return { ok: true, cents }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value)
}

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return false
    const [, y, m, d] = match.map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

type FormLike = Pick<FormData, 'get'>
const text = (form: FormLike, key: string) => String(form.get(key) ?? '').trim()

/** What the admin typed, echoed back so a failed submit keeps its values (and a retry sends the identical body). */
export type AssignDuesValues = { playerSubject: string; description: string; amount: string; dueDate: string; skipExisting: boolean }

/** The player picker's value for "everyone who has signed in". */
export const ALL_MEMBERS = '__all__'

/** "Assigned to 12 members" / "skipped 2 who already had it" summary for an all-members assignment. */
export function allMembersSummary(r: { created: number; skipped: number }, amount: string, description: string): string {
    const who = (n: number) => `${n} member${n === 1 ? '' : 's'}`
    const head = r.created === 0 ? `Nobody new to assign “${description}” to` : `Assigned ${amount} “${description}” to ${who(r.created)}`
    return r.skipped > 0 ? `${head}; skipped ${who(r.skipped)} who already had it.` : `${head}.`
}
export type RecordPaymentValues = { amount: string; method: string; note: string }

export type Parsed<T, V> =
    | { ok: true; value: T; values: V }
    | { ok: false; message: string; values: V }

export function parseAssignDuesForm(form: FormLike): Parsed<NewDuesAssessment, AssignDuesValues> {
    const values: AssignDuesValues = {
        playerSubject: text(form, 'playerSubject').slice(0, 200),
        description: text(form, 'description').slice(0, 500),
        amount: text(form, 'amount').slice(0, 20),
        dueDate: text(form, 'dueDate').slice(0, 20),
        // Unchecked checkboxes are absent from form data; the form sends "on" when checked.
        skipExisting: text(form, 'skipExisting') !== '',
    }
    const id = text(form, 'id')
    if (!isUuid(id)) return { ok: false, message: 'The form expired. Refresh the page and try again.', values }
    if (!values.playerSubject) return { ok: false, message: 'Choose a player, or everyone.', values }
    if (!values.description) return { ok: false, message: 'Enter a description, like “Season dues”.', values }
    if (values.description.length > DUES_LIMITS.description) {
        return { ok: false, message: `Keep the description to ${DUES_LIMITS.description} characters or fewer.`, values }
    }
    const amount = parsePositiveDollars(values.amount)
    if (!amount.ok) return { ok: false, message: amount.message, values }
    if (values.dueDate && !isIsoDate(values.dueDate)) return { ok: false, message: 'Enter a valid due date, or leave it blank.', values }
    return {
        ok: true,
        values,
        value: {
            id: id.toLowerCase(),
            playerSubject: values.playerSubject,
            description: values.description,
            amountCents: amount.cents,
            ...(values.dueDate ? { dueDate: values.dueDate } : {}),
        },
    }
}

export function parseRecordPaymentForm(form: FormLike): Parsed<{ assessmentId: string; payment: NewDuesPayment }, RecordPaymentValues> {
    const values: RecordPaymentValues = {
        amount: text(form, 'amount').slice(0, 20),
        method: text(form, 'method'),
        note: text(form, 'note').slice(0, 2000),
    }
    const id = text(form, 'id')
    const assessmentId = text(form, 'assessmentId')
    if (!isUuid(id) || !assessmentId || assessmentId.length > 100) {
        return { ok: false, message: 'The form expired. Refresh the page and try again.', values }
    }
    // Waiving with no amount waives everything still owed (`recordable`: the balance minus
    // any card checkout in progress, carried by the form).
    const waiveAll = values.method === 'waived' && !values.amount
    const amount = parsePositiveDollars(waiveAll ? text(form, 'recordable') : values.amount)
    if (!amount.ok) return { ok: false, message: waiveAll ? 'Nothing is left to waive.' : amount.message, values }
    if (!isManualPaymentMethod(values.method)) return { ok: false, message: 'Choose how they paid.', values }
    const noteNeeded = noteRequiredMessage(values.method)
    if (noteNeeded && !values.note) return { ok: false, message: noteNeeded, values }
    if (values.note.length > DUES_LIMITS.note) {
        return { ok: false, message: `Keep the note to ${DUES_LIMITS.note} characters or fewer.`, values }
    }
    return {
        ok: true,
        values,
        value: {
            assessmentId,
            payment: {
                id: id.toLowerCase(),
                amountCents: amount.cents,
                method: values.method,
                ...(values.note ? { note: values.note } : {}),
            },
        },
    }
}

/** What the admin typed into the automatic-dues form, echoed back after a failed save. */
export type AutomaticDuesValues = { enabled: boolean; description: string; amount: string; dueDate: string }

/**
 * Parses the "Automatic dues for new players" form. Besides the visible fields it reads two
 * hidden ones carrying what was last loaded from the API (`savedAmountCents`, `savedDescription`),
 * so switching automatic dues off never fails over an empty field: a blank amount or description
 * keeps the saved one. An amount is only required while automatic dues are on.
 *
 * `value` is null when there is nothing to save: dues were never set up (saved amount 0) and the
 * admin is leaving them off without an amount. The API rejects an amount of 0, and the setting is
 * already off, so the caller should skip the request.
 */
export function parseAutomaticDuesForm(form: FormLike): Parsed<AutomaticDuesInput | null, AutomaticDuesValues> {
    const values: AutomaticDuesValues = {
        // Unchecked checkboxes are absent from form data; the form sends "on" when checked.
        enabled: text(form, 'enabled') !== '',
        description: text(form, 'description').slice(0, 500),
        amount: text(form, 'amount').slice(0, 20),
        dueDate: text(form, 'dueDate').slice(0, 20),
    }
    const savedCents = Number(text(form, 'savedAmountCents'))
    const savedAmountCents = Number.isSafeInteger(savedCents) && savedCents > 0 && savedCents <= DUES_LIMITS.maxCents ? savedCents : 0
    const savedDescription = text(form, 'savedDescription').slice(0, DUES_LIMITS.description)

    let description = values.description
    if (!description) {
        if (values.enabled) return { ok: false, message: 'Enter a description, like “Season dues”.', values }
        description = savedDescription || DEFAULT_DUES_DESCRIPTION
    }
    if (description.length > DUES_LIMITS.description) {
        return { ok: false, message: `Keep the description to ${DUES_LIMITS.description} characters or fewer.`, values }
    }

    let amountCents: number
    if (!values.amount && !values.enabled) {
        if (savedAmountCents === 0) return { ok: true, value: null, values }
        amountCents = savedAmountCents
    } else {
        const amount = parsePositiveDollars(values.amount)
        if (!amount.ok) return { ok: false, message: amount.message, values }
        amountCents = amount.cents
    }

    if (values.dueDate && !isIsoDate(values.dueDate)) return { ok: false, message: 'Enter a valid due date, or leave it blank.', values }
    return {
        ok: true,
        values,
        value: { enabled: values.enabled, description, amountCents, dueDate: values.dueDate || null },
    }
}

/** Reads the API's setting defensively so a missing or odd field can't break the form. */
export function normalizeAutomaticDues(data: Partial<AutomaticDues> | null | undefined): AutomaticDues {
    const cents = data?.amountCents
    return {
        enabled: data?.enabled === true,
        description: typeof data?.description === 'string' && data.description.trim()
            ? data.description.trim().slice(0, DUES_LIMITS.description)
            : DEFAULT_DUES_DESCRIPTION,
        amountCents: typeof cents === 'number' && Number.isSafeInteger(cents) && cents > 0 && cents <= DUES_LIMITS.maxCents ? cents : 0,
        dueDate: typeof data?.dueDate === 'string' && isIsoDate(data.dueDate) ? data.dueDate : null,
    }
}

/** Success line after saving the automatic dues setting. */
export function automaticDuesSummary(saved: Pick<AutomaticDues, 'enabled' | 'description' | 'amountCents'>): string {
    return saved.enabled
        ? `Automatic dues are on: every player who signs in gets ${formatCents(saved.amountCents)} “${saved.description}”.`
        : 'Automatic dues are off. Nobody new gets dues automatically.'
}

/** Only untouched dues can be removed: nothing paid and no card checkout in progress. */
export function canRemoveDues(dues: Pick<DuesAssessment, 'paidCents' | 'pendingCheckoutCents'>): boolean {
    return dues.paidCents === 0 && dues.pendingCheckoutCents === 0
}

export type DuesWriteOutcome =
    | { kind: 'ok' }
    | { kind: 'sign-in' }
    /**
     * `retry` true means the API may or may not have applied the request (unreachable,
     * 5xx): keep the same idempotency id so submitting again can't double-record.
     * false means it was definitely rejected, so the next attempt gets a fresh id.
     */
    | { kind: 'error'; message: string; retry: boolean }

/** API error text worth showing as-is: a sentence, not a machine code like "invalid_amount". */
function readable(error: string | null): string | null {
    const trimmed = error?.trim()
    return trimmed && /\s/.test(trimmed) && trimmed.length <= 300 ? trimmed : null
}

export type DuesWriteAction = 'assign' | 'payment' | 'automatic' | 'remove'

export function duesWriteOutcome(result: ApiResult<unknown>, action: DuesWriteAction): DuesWriteOutcome {
    if (result.ok) return { kind: 'ok' }
    switch (result.status) {
        case 401:
            return { kind: 'sign-in' }
        case 403:
            return { kind: 'error', message: 'Only club admins can do that.', retry: false }
        case 404:
            return {
                kind: 'error',
                message: action === 'payment'
                    ? 'That dues item wasn’t found. Dues may be switched off, or it was removed. Refresh the page.'
                    : action === 'remove'
                        ? 'That dues item wasn’t found. It may already have been removed. Refresh the page.'
                        : 'Dues are switched off on the club server.',
                retry: false,
            }
        case 400:
            return { kind: 'error', message: readable(result.error) ?? 'Check the details and try again.', retry: false }
        case 409:
            return {
                kind: 'error',
                message: readable(result.error)
                    ?? (action === 'payment'
                        ? 'That payment conflicts with the current balance. Refresh the page and try again.'
                        : action === 'remove'
                            ? 'This item has payments or a card checkout in progress, so it can’t be removed.'
                            : 'That conflicts with an existing dues item. Refresh the page and try again.'),
                retry: false,
            }
        default:
            return {
                kind: 'error',
                message: action === 'assign' || action === 'payment'
                    ? 'The club server didn’t respond. Submit again to retry — it won’t be recorded twice.'
                    : 'The club server didn’t respond. Try again in a minute.',
                retry: true,
            }
    }
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const index = next++
            results[index] = await fn(items[index], index)
        }
    })
    await Promise.all(workers)
    return results
}

/** One member's line in a dues group: who, and what they still owe on that item. */
export type DuesSummaryMember = { label: string; balanceCents: number }

/** "Who has paid what" for every dues item sharing one description (e.g. "2026-27 Season dues"). */
export type DuesSummaryGroup = {
    description: string
    /** The amount every item in the group charges, or null when the amounts differ. */
    amountCents: number | null
    count: number
    /** Settled with money (some credit allowed). */
    paidInFull: number
    /** Settled by credit alone: waived (or waived and volunteered). */
    waived: number
    /** Settled by volunteering alone. */
    volunteered: number
    partlyPaid: number
    unpaid: number
    /** Sum of all amounts charged. */
    totalCents: number
    /** Money actually received (paid minus volunteer/waived credit). */
    collectedCents: number
    /** Volunteer/waived credit: counts toward balances, but isn't money. */
    creditedCents: number
    outstandingCents: number
    pendingCheckoutCents: number
    /**
     * Money from items paid in full, capped at each item's amount (for the progress bar).
     * Credit on those items is in `paidInFullCreditedCents`, so the two never overlap.
     */
    paidInFullCents: number
    /** Credit on items paid in full, within each item's amount (for the progress bar). */
    paidInFullCreditedCents: number
    /** Money from partly paid items (for the progress bar). */
    partlyPaidCents: number
    /** Credit on partly paid items (for the progress bar). */
    partlyPaidCreditedCents: number
    members: {
        paid: DuesSummaryMember[]; waived: DuesSummaryMember[]; volunteered: DuesSummaryMember[]
        partly: DuesSummaryMember[]; unpaid: DuesSummaryMember[]
    }
}

type SummaryAssessment = Pick<DuesAssessment, 'description' | 'amountCents' | 'paidCents' | 'creditedCents' | 'waivedCents' | 'balanceCents' | 'pendingCheckoutCents'> & {
    playerSubject: string
}

const groupKey = (description: string) => description.trim().replace(/\s+/g, ' ').toLowerCase()
const byLabel = (a: DuesSummaryMember, b: DuesSummaryMember) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })

/**
 * Groups dues by description (trimmed, case-insensitive) and counts who has paid in full,
 * partly, or not at all. The group shows the most common spelling of its description.
 * Groups with the most outstanding come first.
 */
export function summarizeDues(
    assessments: readonly SummaryAssessment[],
    memberLabels: ReadonlyMap<string, string> | ((subject: string) => string),
): DuesSummaryGroup[] {
    const labelFor = typeof memberLabels === 'function'
        ? memberLabels
        : (subject: string) => memberLabels.get(subject) ?? 'Former member'

    const groups = new Map<string, { spellings: Map<string, number>; items: SummaryAssessment[] }>()
    for (const a of assessments) {
        const key = groupKey(a.description)
        let group = groups.get(key)
        if (!group) groups.set(key, (group = { spellings: new Map(), items: [] }))
        const spelling = a.description.trim().replace(/\s+/g, ' ')
        group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1)
        group.items.push(a)
    }

    const summaries = [...groups.values()].map(({ spellings, items }): DuesSummaryGroup => {
        // Most common spelling; ties go to the one seen first (Map keeps insertion order).
        let description = ''
        let best = 0
        for (const [spelling, n] of spellings) if (n > best) [description, best] = [spelling, n]

        const amounts = new Set(items.map(a => a.amountCents))
        const s: DuesSummaryGroup = {
            description,
            amountCents: amounts.size === 1 ? items[0].amountCents : null,
            count: items.length,
            paidInFull: 0,
            waived: 0,
            volunteered: 0,
            partlyPaid: 0,
            unpaid: 0,
            totalCents: 0,
            collectedCents: 0,
            creditedCents: 0,
            outstandingCents: 0,
            pendingCheckoutCents: 0,
            paidInFullCents: 0,
            paidInFullCreditedCents: 0,
            partlyPaidCents: 0,
            partlyPaidCreditedCents: 0,
            members: { paid: [], waived: [], volunteered: [], partly: [], unpaid: [] },
        }
        for (const a of items) {
            const paid = Math.max(0, a.paidCents)
            const credited = creditedCentsOf(a)
            const money = paid - credited
            const member = { label: labelFor(a.playerSubject), balanceCents: Math.max(0, a.balanceCents) }
            s.totalCents += Math.max(0, a.amountCents)
            s.collectedCents += money
            s.creditedCents += credited
            s.outstandingCents += member.balanceCents
            s.pendingCheckoutCents += Math.max(0, a.pendingCheckoutCents)
            // Status uses the balance, so credit counts toward being paid.
            if (a.balanceCents <= 0) {
                // For the bar: credit first, then money up to the amount (an overpayment is money).
                const cap = Math.max(0, a.amountCents)
                const creditPart = Math.min(credited, cap)
                s.paidInFullCreditedCents += creditPart
                s.paidInFullCents += Math.min(money, cap - creditPart)
                const kind = duesStatus(a).kind
                if (kind === 'waived') {
                    s.waived++
                    s.members.waived.push(member)
                } else if (kind === 'volunteered') {
                    s.volunteered++
                    s.members.volunteered.push(member)
                } else {
                    s.paidInFull++
                    s.members.paid.push(member)
                }
            } else if (paid > 0) {
                s.partlyPaid++
                s.partlyPaidCents += money
                s.partlyPaidCreditedCents += credited
                s.members.partly.push(member)
            } else {
                s.unpaid++
                s.members.unpaid.push(member)
            }
        }
        s.members.paid.sort(byLabel)
        s.members.waived.sort(byLabel)
        s.members.volunteered.sort(byLabel)
        s.members.partly.sort(byLabel)
        s.members.unpaid.sort(byLabel)
        return s
    })

    return summaries.sort((a, b) =>
        b.outstandingCents - a.outstandingCents
        || a.description.localeCompare(b.description, 'en', { sensitivity: 'base' }))
}

/** Club-wide totals across every summary group. */
export function duesSummaryTotals(groups: readonly MoneyTotals[]): MoneyTotals {
    return groups.reduce(
        (t, g) => ({
            collectedCents: t.collectedCents + g.collectedCents,
            creditedCents: t.creditedCents + g.creditedCents,
            outstandingCents: t.outstandingCents + g.outstandingCents,
        }),
        { collectedCents: 0, creditedCents: 0, outstandingCents: 0 },
    )
}

type MoneyTotals = { collectedCents: number; creditedCents: number; outstandingCents: number }

/** The parts of a summary money line, in order; "credited" only when there is some. */
export function duesMoneyParts(t: MoneyTotals): { amount: string; label: 'collected' | 'credited' | 'outstanding' }[] {
    return [
        { amount: formatSummaryCents(t.collectedCents), label: 'collected' as const },
        ...(t.creditedCents > 0 ? [{ amount: formatSummaryCents(t.creditedCents), label: 'credited' as const }] : []),
        { amount: formatSummaryCents(t.outstandingCents), label: 'outstanding' as const },
    ]
}

/** "$1,950 collected · $250 credited · $800 outstanding" (credited omitted when 0). */
export function duesMoneyLine(t: MoneyTotals): string {
    return duesMoneyParts(t).map(p => `${p.amount} ${p.label}`).join(' · ')
}

/** Dollars for summary lines: "$125" for whole amounts, "$25.50" otherwise. */
export function formatSummaryCents(cents: number): string {
    return cents % 100 === 0
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
        : formatCents(cents)
}
