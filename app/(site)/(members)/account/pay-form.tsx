'use client'

import { useActionState, useId } from 'react'
import { useFormStatus } from 'react-dom'
import { startCheckout, type PayState } from './actions'
import { ctaClass, inputClass, labelClass, Notice } from '@/components/members/member-ui'

function PayButton({ label }: { label: string }) {
    const { pending } = useFormStatus()
    return (
        <button type="submit" className={`${ctaClass} w-full sm:w-auto`} disabled={pending} aria-disabled={pending}>
            {pending ? 'Opening checkout…' : label}
        </button>
    )
}

/**
 * Pay form for one dues item. When a checkout is already open (`pendingDollars`),
 * the API reuses that session and its amount, so the amount field is replaced by
 * a "Resume payment" button for the pending amount.
 */
export function PayForm({
    assessmentId,
    suggestedDollars,
    pendingDollars,
}: {
    assessmentId: string
    suggestedDollars: string
    pendingDollars?: string
}) {
    const [state, action] = useActionState<PayState, FormData>(startCheckout, { error: null })
    const id = useId()

    if (pendingDollars) {
        return (
            <form action={action} className="mt-4 space-y-3">
                <input type="hidden" name="assessmentId" value={assessmentId} />
                <input type="hidden" name="amount" value={pendingDollars} />
                <PayButton label="Resume payment" />
                <p className="text-xs text-[#555555]">
                    Reopens the ${pendingDollars} checkout on Stripe. Payments started in the Claymores app finish in the app.
                </p>
                {state.error && <Notice tone="error" title={state.error} />}
            </form>
        )
    }

    return (
        <form action={action} className="mt-4 space-y-3">
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:w-48">
                    <label htmlFor={id} className={labelClass}>Amount (USD)</label>
                    <div className="relative mt-1">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#555555]">$</span>
                        <input
                            id={id}
                            name="amount"
                            inputMode="decimal"
                            required
                            defaultValue={state.amount ?? suggestedDollars}
                            className={`${inputClass} pl-7`}
                            aria-describedby={`${id}-hint`}
                        />
                    </div>
                </div>
                <PayButton label="Pay now" />
            </div>
            <p id={`${id}-hint`} className="text-xs text-[#555555]">
                Pay all or part of the balance. You&apos;ll finish on Stripe&apos;s secure checkout.
            </p>
            {state.error && <Notice tone="error" title={state.error} />}
        </form>
    )
}
