'use client'

import { useActionState, useId } from 'react'
import { useFormStatus } from 'react-dom'
import { startCheckout, type PayState } from './actions'
import { ctaClass, inputClass, labelClass, Notice } from '@/components/members/member-ui'

function PayButton() {
    const { pending } = useFormStatus()
    return (
        <button type="submit" className={`${ctaClass} w-full sm:w-auto`} disabled={pending} aria-disabled={pending}>
            {pending ? 'Opening checkout…' : 'Pay now'}
        </button>
    )
}

export function PayForm({ assessmentId, suggestedDollars }: { assessmentId: string; suggestedDollars: string }) {
    const [state, action] = useActionState<PayState, FormData>(startCheckout, { error: null })
    const id = useId()
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
                <PayButton />
            </div>
            <p id={`${id}-hint`} className="text-xs text-[#555555]">
                Pay all or part of the balance. You&apos;ll finish on Stripe&apos;s secure checkout.
            </p>
            {state.error && <Notice tone="error" title={state.error} />}
        </form>
    )
}
