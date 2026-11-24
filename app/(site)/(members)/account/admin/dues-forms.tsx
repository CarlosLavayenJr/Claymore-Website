'use client'

import { useActionState, useId, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { assignDues, recordDuesPayment, type AssignDuesState, type RecordPaymentState } from './actions'
import { ctaClass, inputClass, labelClass, Notice } from '@/components/members/member-ui'
import { ALL_MEMBERS, DEFAULT_DUES_DESCRIPTION, DUES_LIMITS, MANUAL_PAYMENT_METHODS } from '@/lib/claymores/admin-dues'

const selectClass = `${inputClass} pr-8`

function SubmitButton({ label, busy, disabled }: { label: string; busy: string; disabled?: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            className={`${ctaClass} w-full py-2 text-base sm:w-auto`}
            disabled={disabled || pending}
            aria-disabled={disabled || pending}
        >
            {pending ? busy : label}
        </button>
    )
}

function DollarInput({ id, defaultValue, describedBy, inputRef }: {
    id: string
    defaultValue?: string
    describedBy?: string
    inputRef?: React.Ref<HTMLInputElement>
}) {
    return (
        <div className="relative mt-1">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#555555]">$</span>
            <input
                ref={inputRef}
                id={id}
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                required
                maxLength={20}
                defaultValue={defaultValue}
                aria-describedby={describedBy}
                className={`${inputClass} pl-7`}
            />
        </div>
    )
}

function Outcome({ state }: { state: { status: string; message: string | null } }) {
    if (!state.message) return null
    return <Notice tone={state.status === 'success' ? 'success' : 'error'} title={state.message} />
}

export type MemberOption = { subject: string; label: string }

/**
 * Assign dues to one member. `initialId` is a fresh UUID from the page render; the
 * action hands back the id for the next submit so retries reuse it and successes
 * don't (see DuesFormState in ./actions).
 */
export function AssignDuesForm({ members, initialId }: { members: MemberOption[]; initialId: string }) {
    const [state, action] = useActionState<AssignDuesState, FormData>(assignDues, { status: 'idle', message: null, nextId: null })
    const id = useId()
    const values = state.status === 'error' ? state.values : undefined
    const disabled = members.length === 0

    return (
        <form action={action} className="space-y-4 rounded-lg bg-[#fafafa] p-4">
            <input type="hidden" name="id" value={state.nextId ?? initialId} />
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label htmlFor={`${id}-player`} className={labelClass}>Player</label>
                    <select
                        id={`${id}-player`}
                        name="playerSubject"
                        required
                        disabled={disabled}
                        defaultValue={values?.playerSubject ?? ''}
                        className={`${selectClass} mt-1`}
                    >
                        <option value="" disabled>{disabled ? 'No members have signed in yet' : 'Choose a player…'}</option>
                        {!disabled && (
                            <option value={ALL_MEMBERS}>
                                Everyone who has signed in ({members.length} member{members.length === 1 ? '' : 's'})
                            </option>
                        )}
                        {members.map(m => <option key={m.subject} value={m.subject}>{m.label}</option>)}
                    </select>
                    <label className="mt-2 flex items-start gap-2 text-sm text-[#555555]">
                        <input
                            type="checkbox"
                            name="skipExisting"
                            defaultChecked={values?.skipExisting ?? true}
                            className="mt-0.5 accent-[#77c3ef]"
                        />
                        <span>When assigning to everyone, skip anyone who already has dues with this description.</span>
                    </label>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor={`${id}-description`} className={labelClass}>Description</label>
                    <input
                        id={`${id}-description`}
                        name="description"
                        required
                        maxLength={DUES_LIMITS.description}
                        defaultValue={values?.description ?? DEFAULT_DUES_DESCRIPTION}
                        className={`${inputClass} mt-1`}
                    />
                </div>
                <div>
                    <label htmlFor={`${id}-amount`} className={labelClass}>Amount (USD)</label>
                    <DollarInput id={`${id}-amount`} defaultValue={values?.amount ?? ''} />
                </div>
                <div>
                    <label htmlFor={`${id}-due`} className={labelClass}>
                        Due date <span className="font-normal text-[#555555]">(optional)</span>
                    </label>
                    <input
                        id={`${id}-due`}
                        name="dueDate"
                        type="date"
                        defaultValue={values?.dueDate ?? ''}
                        className={`${inputClass} mt-1`}
                    />
                </div>
            </div>
            <SubmitButton label="Assign dues" busy="Assigning…" disabled={disabled} />
            <Outcome state={state} />
        </form>
    )
}

/**
 * Record a cash/Venmo/Zelle/check/other payment against one assessment.
 * `recordableDollars` is the balance minus any Stripe checkout in progress,
 * which is what "Paid in full" fills in.
 */
export function RecordPaymentForm({ assessmentId, recordableDollars, initialId, context }: {
    assessmentId: string
    recordableDollars: string
    initialId: string
    /** Who and what, for screen-reader labels ("Pat Player, Season dues"). */
    context: string
}) {
    const [state, action] = useActionState<RecordPaymentState, FormData>(recordDuesPayment, { status: 'idle', message: null, nextId: null })
    const id = useId()
    const amountRef = useRef<HTMLInputElement>(null)
    const values = state.status === 'error' ? state.values : undefined

    return (
        <form action={action} className="space-y-3 rounded-lg bg-[#fafafa] p-4" aria-label={`Record payment for ${context}`}>
            <input type="hidden" name="id" value={state.nextId ?? initialId} />
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <p className="text-sm font-semibold text-[#111111]">Record payment</p>
            <div className="grid gap-3 sm:grid-cols-[12rem_10rem_minmax(0,1fr)] sm:items-start">
                <div>
                    <label htmlFor={`${id}-amount`} className={labelClass}>Amount (USD)</label>
                    <DollarInput
                        id={`${id}-amount`}
                        inputRef={amountRef}
                        defaultValue={values?.amount ?? ''}
                        describedBy={`${id}-full`}
                    />
                    <button
                        type="button"
                        id={`${id}-full`}
                        onClick={() => {
                            if (!amountRef.current) return
                            amountRef.current.value = recordableDollars
                            amountRef.current.focus()
                        }}
                        className="mt-1 text-sm font-semibold text-[#fd80b5] underline-offset-4 hover:text-[#111111] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                    >
                        Paid in full (${recordableDollars})
                    </button>
                </div>
                <div>
                    <label htmlFor={`${id}-method`} className={labelClass}>Method</label>
                    <select id={`${id}-method`} name="method" defaultValue={values?.method ?? 'cash'} className={`${selectClass} mt-1`}>
                        {MANUAL_PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor={`${id}-note`} className={labelClass}>
                        Note <span className="font-normal text-[#555555]">(optional)</span>
                    </label>
                    <input
                        id={`${id}-note`}
                        name="note"
                        maxLength={DUES_LIMITS.note}
                        autoComplete="off"
                        defaultValue={values?.note ?? ''}
                        placeholder="Paid cash at practice 11/20"
                        className={`${inputClass} mt-1`}
                    />
                </div>
            </div>
            <SubmitButton label="Record payment" busy="Recording…" />
            <Outcome state={state} />
        </form>
    )
}
