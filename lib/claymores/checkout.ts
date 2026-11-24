// Maps the API's checkout-session response to what the website's pay action
// does next. Shared by the server action and the unit tests.

import type { ApiResult } from './api-client'

/** Where Stripe sends the member back. "web" uses the API's Stripe:WebReturnUrl. */
export type CheckoutReturnTo = 'app' | 'web'

/** The query values the API appends to the return URL: /account?checkout=returned|cancelled. */
export type CheckoutReturnStatus = 'returned' | 'cancelled'

export const CHECKOUT_UNAVAILABLE_MESSAGE =
    'Online payment isn’t available yet. Pay in the Claymores app or to the club treasurer at practice.'

export type CheckoutOutcome =
    | { kind: 'redirect'; url: string }
    | { kind: 'sign-in' }
    | { kind: 'error'; message: string }

export function checkoutOutcome(result: ApiResult<{ url?: unknown } | null>): CheckoutOutcome {
    if (result.ok) {
        const url = result.data?.url
        return typeof url === 'string' && url.startsWith('https://')
            ? { kind: 'redirect', url }
            : { kind: 'error', message: 'The payment page couldn’t be opened. Try again.' }
    }
    switch (result.status) {
        case 401:
            return { kind: 'sign-in' }
        case 400:
            if (result.error === 'web_checkout_unavailable') return { kind: 'error', message: CHECKOUT_UNAVAILABLE_MESSAGE }
            return { kind: 'error', message: 'Enter an amount between $0.50 and your remaining balance.' }
        case 404:
            return { kind: 'error', message: 'That dues item wasn’t found. Refresh the page and try again.' }
        case 409:
            return {
                kind: 'error',
                message: 'That’s more than the balance you can pay right now, or a payment is already in progress. Refresh the page and try a smaller amount.',
            }
        case 502:
            return { kind: 'error', message: 'Stripe couldn’t start the checkout. Try again in a minute.' }
        default:
            return { kind: 'error', message: 'Payments are temporarily unavailable. Try again in a minute.' }
    }
}

/** Reads ?checkout= on /account, tolerating repeated or unknown values. */
export function checkoutReturnStatus(value: string | string[] | undefined): CheckoutReturnStatus | null {
    const first = Array.isArray(value) ? value[0] : value
    return first === 'returned' || first === 'cancelled' ? first : null
}
