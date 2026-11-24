'use server'

import { redirect } from 'next/navigation'
import { parseDollarsToCents, formatCents } from '@/lib/claymores/api-client'
import { webCheckoutEnabled } from '@/lib/claymores/auth-env'
import { memberApi } from '@/lib/claymores/member'

export type PayState = { error: string | null; amount?: string }

const MIN_CENTS = 50

export async function startCheckout(_previous: PayState, formData: FormData): Promise<PayState> {
    if (!webCheckoutEnabled()) return { error: 'Online payment on the website isn’t available yet.' }
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

    const result = await session.api.createCheckoutSession(id, cents)
    if (result.ok && typeof result.data?.url === 'string' && result.data.url.startsWith('https://')) {
        redirect(result.data.url)
    }
    if (result.ok) return { error: 'The payment page couldn’t be opened. Try again.' }
    switch (result.status) {
        case 401:
            redirect('/sign-in?error=expired&callbackUrl=/account')
        case 404:
            return { error: 'That dues item wasn’t found. Refresh the page and try again.' }
        case 409:
            return { error: 'That’s more than the remaining balance. Enter a smaller amount.' }
        case 400:
            return { error: 'Enter an amount between $0.50 and your remaining balance.' }
        default:
            return { error: 'Payments are temporarily unavailable. Try again in a minute.' }
    }
}
