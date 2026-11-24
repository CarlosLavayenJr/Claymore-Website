// Pure helpers for the Club Admin "Manage dues" section: form parsing, labels,
// and mapping API results to what the admin sees. Shared by the server actions,
// the page, and the unit tests (no Next.js imports).

import {
    formatCents,
    parseDollarsToCents,
    type ApiResult,
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

export const MANUAL_PAYMENT_METHODS: readonly { value: ManualPaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'venmo', label: 'Venmo' },
    { value: 'zelle', label: 'Zelle' },
    { value: 'check', label: 'Check' },
    { value: 'other', label: 'Other' },
]

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
export type AssignDuesValues = { playerSubject: string; description: string; amount: string; dueDate: string }
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
    }
    const id = text(form, 'id')
    if (!isUuid(id)) return { ok: false, message: 'The form expired. Refresh the page and try again.', values }
    if (!values.playerSubject) return { ok: false, message: 'Choose a player.', values }
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
    const amount = parsePositiveDollars(values.amount)
    if (!amount.ok) return { ok: false, message: amount.message, values }
    if (!isManualPaymentMethod(values.method)) return { ok: false, message: 'Choose how they paid.', values }
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

export function duesWriteOutcome(result: ApiResult<unknown>, action: 'assign' | 'payment'): DuesWriteOutcome {
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
                        : 'That conflicts with an existing dues item. Refresh the page and try again.'),
                retry: false,
            }
        default:
            return {
                kind: 'error',
                message: 'The club server didn’t respond. Submit again to retry — it won’t be recorded twice.',
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
