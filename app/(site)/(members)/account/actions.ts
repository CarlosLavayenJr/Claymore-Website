'use server'

import { redirect } from 'next/navigation'
import { parseDollarsToCents, formatCents } from '@/lib/claymores/api-client'
import { webCheckoutEnabled } from '@/lib/claymores/auth-env'
import { CHECKOUT_UNAVAILABLE_MESSAGE, checkoutOutcome } from '@/lib/claymores/checkout'
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
