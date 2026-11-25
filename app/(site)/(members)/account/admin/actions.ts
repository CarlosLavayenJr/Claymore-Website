'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
    ALL_MEMBERS,
    allMembersSummary,
    automaticDuesSummary,
    duesWriteOutcome,
    isUuid,
    paymentMethodLabel,
    parseAssignDuesForm,
    parseAutomaticDuesForm,
    parseRecordPaymentForm,
    type AssignDuesValues,
    type AutomaticDuesValues,
    type RecordPaymentValues,
} from '@/lib/claymores/admin-dues'
import { formatCents, type ApiResult, type AssignAllResult, type Role } from '@/lib/claymores/api-client'
import { parseLineupForm, type LineupValues } from '@/lib/claymores/match-availability'
import { memberApi } from '@/lib/claymores/member'
import { parseNameForm } from '@/lib/claymores/member-name'

const ADMIN = '/account/admin'

function role(value: FormDataEntryValue | null): Role | null {
    return value === 'player' || value === 'admin' ? value : null
}

function done(notice: string): never {
    redirect(`${ADMIN}?notice=${notice}`)
}

function failed(result: ApiResult<unknown>, fallback: string): never {
    if (result.ok) done(fallback)
    if (result.status === 401) redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
    const code = result.status === 403 ? 'forbidden'
        : result.status === 404 ? 'not_found'
        : result.status === 409 && result.error === 'not_pending' ? 'not_pending'
        : result.status === 409 ? 'conflict'
        : result.status === 400 ? 'invalid'
        : 'unavailable'
    redirect(`${ADMIN}?error=${code}`)
}

async function admin() {
    const session = await memberApi()
    if (!session) redirect(`/sign-in?callbackUrl=${ADMIN}`)
    return session.api
}

export async function approveJoinRequest(id: string, formData: FormData) {
    const r = role(formData.get('role'))
    if (!r) redirect(`${ADMIN}?error=invalid`)
    const result = await (await admin()).approveJoinRequest(id, r)
    if (result.ok) done('approved')
    failed(result, 'approved')
}

export async function denyJoinRequest(id: string, formData: FormData) {
    const reason = String(formData.get('reason') ?? '').trim().slice(0, 500)
    const result = await (await admin()).denyJoinRequest(id, reason || undefined)
    if (result.ok) done('denied')
    failed(result, 'denied')
}

export async function saveInvitation(formData: FormData) {
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const r = role(formData.get('role'))
    if (!r || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) redirect(`${ADMIN}?error=invalid`)
    const result = await (await admin()).putInvitation(email, r)
    if (result.ok) done('invited')
    failed(result, 'invited')
}

export async function removeInvitation(email: string) {
    const result = await (await admin()).deleteInvitation(email)
    if (result.ok) done('removed')
    failed(result, 'removed')
}

// --- Dues ---
// These return state (instead of redirecting like the actions above) so the form
// keeps what the admin typed, shows the API's own error text, and controls the
// idempotency id: `nextId` stays the same after an ambiguous failure (retrying is
// safe) and is fresh after a success or a definite rejection.

export type DuesFormState<V> = {
    status: 'idle' | 'success' | 'error'
    message: string | null
    /** Idempotency id for the next submit; null only before the first submit (use the page's). */
    nextId: string | null
    values?: V
}

export type AssignDuesState = DuesFormState<AssignDuesValues>
export type RecordPaymentState = DuesFormState<RecordPaymentValues>

/** Nothing was sent, so the id that was submitted is still unused. */
function keepId(formData: FormData) {
    const id = formData.get('id')
    return isUuid(id) ? id : randomUUID()
}

export async function assignDues(_previous: AssignDuesState, formData: FormData): Promise<AssignDuesState> {
    const parsed = parseAssignDuesForm(formData)
    if (!parsed.ok) return { status: 'error', message: parsed.message, nextId: keepId(formData), values: parsed.values }

    const toAll = parsed.value.playerSubject === ALL_MEMBERS
    const { id, playerSubject: _player, ...dues } = parsed.value
    const result = toAll
        ? await (await admin()).assignDuesToAllMembers({ batchId: id, ...dues, skipExisting: parsed.values.skipExisting })
        : await (await admin()).createDues(parsed.value)
    const outcome = duesWriteOutcome(result, 'assign')
    if (outcome.kind === 'sign-in') redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
    if (outcome.kind === 'error') {
        return {
            status: 'error',
            message: outcome.message,
            nextId: outcome.retry ? parsed.value.id : randomUUID(),
            values: parsed.values,
        }
    }
    revalidatePath(ADMIN)
    return {
        status: 'success',
        message: toAll && result.ok
            ? allMembersSummary(result.data as AssignAllResult, formatCents(parsed.value.amountCents), parsed.value.description)
            : `Assigned ${formatCents(parsed.value.amountCents)} “${parsed.value.description}”.`,
        nextId: randomUUID(),
    }
}

export async function recordDuesPayment(_previous: RecordPaymentState, formData: FormData): Promise<RecordPaymentState> {
    const parsed = parseRecordPaymentForm(formData)
    if (!parsed.ok) return { status: 'error', message: parsed.message, nextId: keepId(formData), values: parsed.values }

    const { assessmentId, payment } = parsed.value
    const outcome = duesWriteOutcome(await (await admin()).recordDuesPayment(assessmentId, payment), 'payment')
    if (outcome.kind === 'sign-in') redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
    if (outcome.kind === 'error') {
        return {
            status: 'error',
            message: outcome.message,
            nextId: outcome.retry ? payment.id : randomUUID(),
            values: parsed.values,
        }
    }
    revalidatePath(ADMIN)
    return {
        status: 'success',
        message: `Recorded ${formatCents(payment.amountCents)} (${paymentMethodLabel(payment.method)}).`,
        nextId: randomUUID(),
    }
}

// PUT and DELETE are idempotent on their own, so these two carry no idempotency id.

export type AutomaticDuesState = {
    status: 'idle' | 'success' | 'error'
    message: string | null
    values?: AutomaticDuesValues
}

export async function saveAutomaticDues(_previous: AutomaticDuesState, formData: FormData): Promise<AutomaticDuesState> {
    const parsed = parseAutomaticDuesForm(formData)
    if (!parsed.ok) return { status: 'error', message: parsed.message, values: parsed.values }
    // Never set up and left off: already the saved state, and the API won't take an amount of 0.
    if (parsed.value === null) return { status: 'success', message: automaticDuesSummary({ enabled: false, description: '', amountCents: 0 }) }

    const result = await (await admin()).saveAutomaticDues(parsed.value)
    const outcome = duesWriteOutcome(result, 'automatic')
    if (outcome.kind === 'sign-in') redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
    if (outcome.kind === 'error') return { status: 'error', message: outcome.message, values: parsed.values }
    revalidatePath(ADMIN)
    // A 200 means the API saved exactly what was sent.
    return { status: 'success', message: automaticDuesSummary(parsed.value) }
}

export type RemoveDuesState = { status: 'idle' | 'error'; message: string | null }

export async function removeDues(_previous: RemoveDuesState, formData: FormData): Promise<RemoveDuesState> {
    const id = String(formData.get('assessmentId') ?? '').trim()
    if (!id || id.length > 100) return { status: 'error', message: 'The form expired. Refresh the page and try again.' }

    const outcome = duesWriteOutcome(await (await admin()).removeDues(id), 'remove')
    if (outcome.kind === 'sign-in') redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
    if (outcome.kind === 'error') return { status: 'error', message: outcome.message }
    // The row disappears on success, so confirm at the top of the page instead of inline.
    revalidatePath(ADMIN)
    done('dues_removed')
}

// --- Payment corrections ---
// Plain redirects with a page notice: the history re-renders with the change.

function paymentIds(formData: FormData) {
    const assessmentId = String(formData.get('assessmentId') ?? '').trim()
    const paymentId = String(formData.get('paymentId') ?? '').trim()
    return isUuid(assessmentId) && isUuid(paymentId) ? { assessmentId, paymentId } : null
}

function paymentFailed(result: ApiResult<unknown>): never {
    if (!result.ok && result.status === 401) redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
    const code = result.ok ? 'unavailable'
        : result.status === 400 ? 'payment_invalid'
        : result.status === 409 ? 'payment_undone'
        : result.status === 404 ? 'not_found'
        : result.status === 403 ? 'forbidden'
        : 'unavailable'
    redirect(`${ADMIN}?error=${code}#all-dues`)
}

export async function undoDuesPayment(formData: FormData) {
    const ids = paymentIds(formData)
    const reason = String(formData.get('reason') ?? '').trim()
    if (!ids || !reason || reason.length > 500) redirect(`${ADMIN}?error=undo_reason#all-dues`)
    const result = await (await admin()).voidDuesPayment(ids.assessmentId, ids.paymentId, reason)
    if (!result.ok) paymentFailed(result)
    revalidatePath(ADMIN)
    redirect(`${ADMIN}?notice=${formData.get('method') === 'stripe' ? 'payment_undone_card' : 'payment_undone'}#all-dues`)
}

export async function editDuesPaymentNote(formData: FormData) {
    const ids = paymentIds(formData)
    const note = String(formData.get('note') ?? '').trim()
    if (!ids || note.length > 500) redirect(`${ADMIN}?error=payment_invalid#all-dues`)
    const result = await (await admin()).editDuesPaymentNote(ids.assessmentId, ids.paymentId, note || null)
    if (!result.ok) paymentFailed(result)
    revalidatePath(ADMIN)
    redirect(`${ADMIN}?notice=note_saved#all-dues`)
}

// --- Invite links ---

export async function createInviteLink(formData: FormData) {
    const days = Number(formData.get('days') ?? 30)
    if (!Number.isInteger(days) || days < 1 || days > 90) redirect(`${ADMIN}?error=invalid#invitations`)
    const result = await (await admin()).createInviteLink(days)
    if (!result.ok) failed(result, 'link_created')
    revalidatePath(ADMIN)
    redirect(`${ADMIN}?notice=link_created#invitations`)
}

export async function revokeInviteLink(id: string) {
    if (!isUuid(id)) redirect(`${ADMIN}?error=invalid#invitations`)
    const result = await (await admin()).revokeInviteLink(id)
    if (!result.ok) failed(result, 'link_revoked')
    revalidatePath(ADMIN)
    redirect(`${ADMIN}?notice=link_revoked#invitations`)
}

// --- Match lineups ---
// Returns state on failure so the 23 picks survive and the API's own error shows; a save
// redirects back to the match (`?fixture=<id>#matches`) with a page notice.

export type LineupState = {
    status: 'idle' | 'error'
    message: string | null
    values?: LineupValues
    /** Bumped on every failed submit so the editor re-applies `values`. */
    attempt: number
}

export async function saveLineup(previous: LineupState, formData: FormData): Promise<LineupState> {
    const parsed = parseLineupForm(formData)
    const attempt = previous.attempt + 1
    if (!parsed.ok) return { status: 'error', message: parsed.message, values: parsed.values, attempt }

    const result = await (await admin()).saveFixtureLineup(parsed.fixtureId, parsed.input)
    if (!result.ok) {
        if (result.status === 401) redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
        const message = result.status === 400 ? result.error ?? 'Check the lineup and try again.'
            : result.status === 403 ? 'Only club admins can do that.'
            : result.status === 404 ? 'That match is no longer in the club’s fixtures.'
            : 'The club server didn’t respond. Try again in a minute.'
        return { status: 'error', message, values: parsed.values, attempt }
    }
    revalidatePath(ADMIN)
    const notice = parsed.input.publish ? 'lineup_published' : 'lineup_saved'
    redirect(`${ADMIN}?notice=${notice}&fixture=${encodeURIComponent(parsed.fixtureId)}#matches`)
}

// --- Member names ---

export async function saveMemberName(subject: string, formData: FormData) {
    const parsed = parseNameForm(formData)
    if (!parsed.ok || !subject || subject.length > 255) redirect(`${ADMIN}?error=name_invalid#members`)
    const result = await (await admin()).setMemberName(subject, parsed.name)
    if (!result.ok) failed(result, 'name_saved')
    revalidatePath(ADMIN)
    redirect(`${ADMIN}?notice=name_saved#members`)
}
