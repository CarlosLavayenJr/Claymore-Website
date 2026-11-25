'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signOut } from '@/auth'
import { ACCOUNT_DELETED_PARAM, DELETE_CONFIRMATION, deletionOutcome, isDeleteConfirmed } from '@/lib/claymores/account-deletion'
import { parseDollarsToCents, formatCents } from '@/lib/claymores/api-client'
import { memberAuthEnabled, SIGNED_IN_HINT_COOKIE, webCheckoutEnabled } from '@/lib/claymores/auth-env'
import { CHECKOUT_UNAVAILABLE_MESSAGE, checkoutOutcome } from '@/lib/claymores/checkout'
import { matchAnchor, parseAvailabilityForm } from '@/lib/claymores/match-availability'
import { memberApi } from '@/lib/claymores/member'

export type PayState = { error: string | null; amount?: string }

const MIN_CENTS = 50

export async function startCheckout(_previous: PayState, formData: FormData): Promise<PayState> {
    if (!webCheckoutEnabled()) return { error: CHECKOUT_UNAVAILABLE_MESSAGE }
    const id = String(formData.get('assessmentId') ?? '')
    const amount = String(formData.get('amount') ?? '').slice(0, 20)
    const state = await checkout(id, amount)
    return { ...state, amount }
}

export type DeleteState = { error: string | null }

/** Deletes the member's account through the API, then signs out locally and goes home. */
export async function deleteAccount(_previous: DeleteState, formData: FormData): Promise<DeleteState> {
    if (!memberAuthEnabled()) redirect('/')
    if (!isDeleteConfirmed(formData.get('confirm'))) {
        return { error: `Type ${DELETE_CONFIRMATION} in capital letters to confirm.` }
    }
    const session = await memberApi()
    if (!session) redirect('/sign-in?callbackUrl=/account')

    const outcome = deletionOutcome(await session.api.deleteMe())
    if (outcome.kind === 'sign-in') redirect('/sign-in?error=expired&callbackUrl=/account')
    if (outcome.kind === 'error') return { error: outcome.message }

    // The API already revoked every session, so there is no logout call to make.
    ;(await cookies()).delete(SIGNED_IN_HINT_COOKIE)
    await signOut({ redirectTo: `/?${ACCOUNT_DELETED_PARAM}=1` })
    return { error: null }
}

async function checkout(id: string, amount: string): Promise<PayState> {
    const session = await memberApi()
    if (!session) redirect('/sign-in?callbackUrl=/account')
    const cents = parseDollarsToCents(amount)
    if (!id) return { error: 'Choose what you’re paying for.' }
    if (cents === null) return { error: 'Enter an amount like 25 or 25.50.' }
    if (cents < MIN_CENTS) return { error: `The minimum payment is ${formatCents(MIN_CENTS)}.` }

    const outcome = checkoutOutcome(await session.api.createCheckoutSession(id, cents, 'web'))
    if (outcome.kind === 'redirect') redirect(outcome.url)
    if (outcome.kind === 'sign-in') redirect('/sign-in?error=expired&callbackUrl=/account')
    return { error: outcome.message }
}

/**
 * Saves the member's answer for a match (the Available / Maybe / Out button pressed, plus an
 * optional note) and comes back to that match card with `?availability=<outcome>`.
 */
export async function answerAvailability(formData: FormData) {
    const parsed = parseAvailabilityForm(formData)
    if (!parsed.ok) back('invalid', parsed.fixtureId)

    const session = await memberApi()
    if (!session) redirect('/sign-in?callbackUrl=/account')
    const result = await session.api.answerAvailability(parsed.fixtureId, parsed.status, parsed.note)
    if (result.ok) back('saved', parsed.fixtureId)
    if (result.status === 401) redirect('/sign-in?error=expired&callbackUrl=/account')
    back(result.status === 409 ? 'closed'
        : result.status === 404 ? 'not_found'
        : result.status === 400 ? 'invalid'
        : 'unavailable', parsed.fixtureId)
}

function back(outcome: string, fixtureId: string | null): never {
    redirect(`/account?availability=${outcome}${fixtureId ? `#${matchAnchor(fixtureId)}` : '#matches'}`)
}
