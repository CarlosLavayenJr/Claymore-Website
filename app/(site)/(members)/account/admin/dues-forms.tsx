'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
    assignDues,
    recordDuesPayment,
    removeDues,
    saveAutomaticDues,
    type AssignDuesState,
    type AutomaticDuesState,
    type RecordPaymentState,
    type RemoveDuesState,
} from './actions'
import { ctaClass, inputClass, labelClass, Notice } from '@/components/members/member-ui'
import {
    ALL_MEMBERS,
    centsToDollarsInput,
    DEFAULT_DUES_DESCRIPTION,
    DUES_LIMITS,
    isCreditMethod,
    MANUAL_PAYMENT_METHODS,
    notePlaceholder,
    noteRequiredMessage,
} from '@/lib/claymores/admin-dues'
import { formatCents, type AutomaticDues } from '@/lib/claymores/api-client'

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

function DollarInput({ id, defaultValue, describedBy, inputRef, required = true }: {
    id: string
    defaultValue?: string
    describedBy?: string
    inputRef?: React.Ref<HTMLInputElement>
    required?: boolean
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
                required={required}
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
 * Assign dues to one player or to everyone who has signed in. `initialId` is a fresh UUID from
 * the page render; the action hands back the id for the next submit so retries reuse it and
 * successes don't (see DuesFormState in ./actions).
 */
export function AssignDuesForm({ members, initialId }: { members: MemberOption[]; initialId: string }) {
    const [state, action] = useActionState<AssignDuesState, FormData>(assignDues, { status: 'idle', message: null, nextId: null })
    const id = useId()
    const values = state.status === 'error' ? state.values : undefined
    const disabled = members.length === 0
    const [everyone, setEveryone] = useState(values?.playerSubject === ALL_MEMBERS)
    const [description, setDescription] = useState(values?.description ?? DEFAULT_DUES_DESCRIPTION)
    const [amount, setAmount] = useState(values?.amount ?? '')
    const dollars = Number(amount.replaceAll('$', '').replaceAll(',', '').trim())
    const summary = Number.isFinite(dollars) && dollars > 0 ? formatCents(Math.round(dollars * 100)) : null

    const tab = (on: boolean) =>
        on
            ? 'rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#111111] shadow-sm'
            : 'rounded-md px-4 py-2 text-sm font-semibold text-[#555555] hover:text-[#111111] disabled:opacity-60'

    return (
        <form action={action} className="space-y-4 rounded-lg bg-[#fafafa] p-4">
            <input type="hidden" name="id" value={state.nextId ?? initialId} />
            <div role="radiogroup" aria-label="Who gets these dues" className="inline-flex rounded-lg bg-[#EAEAEA] p-1">
                <button type="button" role="radio" aria-checked={!everyone} className={tab(!everyone)} onClick={() => setEveryone(false)}>
                    One player
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={everyone}
                    disabled={disabled}
                    className={tab(everyone)}
                    onClick={() => setEveryone(true)}
                >
                    Everyone ({members.length})
                </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {everyone ? (
                    <div className="sm:col-span-2">
                        <input type="hidden" name="playerSubject" value={ALL_MEMBERS} />
                        <label className="flex items-start gap-2 text-sm text-[#111111]">
                            <input
                                type="checkbox"
                                name="skipExisting"
                                defaultChecked={values?.skipExisting ?? true}
                                className="mt-0.5 accent-[#77c3ef]"
                            />
                            <span>Skip players who already have “{description.trim() || DEFAULT_DUES_DESCRIPTION}”</span>
                        </label>
                    </div>
                ) : (
                    <div className="sm:col-span-2">
                        <label htmlFor={`${id}-player`} className={labelClass}>Player</label>
                        <select
                            id={`${id}-player`}
                            name="playerSubject"
                            required
                            disabled={disabled}
                            defaultValue={values?.playerSubject && values.playerSubject !== ALL_MEMBERS ? values.playerSubject : ''}
                            className={`${selectClass} mt-1`}
                        >
                            <option value="" disabled>{disabled ? 'No members have signed in yet' : 'Choose a player…'}</option>
                            {members.map(m => <option key={m.subject} value={m.subject}>{m.label}</option>)}
                        </select>
                    </div>
                )}
                <div className="sm:col-span-2">
                    <label htmlFor={`${id}-description`} className={labelClass}>What it’s for</label>
                    <input
                        id={`${id}-description`}
                        name="description"
                        required
                        maxLength={DUES_LIMITS.description}
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        aria-describedby={`${id}-description-help`}
                        className={`${inputClass} mt-1`}
                    />
                    <p id={`${id}-description-help`} className="mt-1 text-xs text-[#555555]">
                        Include the season, like “2026–27 season dues”, so it reads clearly in the summary later.
                    </p>
                </div>
                <div>
                    <label htmlFor={`${id}-amount`} className={labelClass}>Amount (USD)</label>
                    <div className="relative mt-1">
                        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#555555]">$</span>
                        <input
                            id={`${id}-amount`}
                            name="amount"
                            inputMode="decimal"
                            autoComplete="off"
                            required
                            maxLength={20}
                            value={amount}
                            onChange={event => setAmount(event.target.value)}
                            className={`${inputClass} pl-7`}
                        />
                    </div>
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
            <SubmitButton
                label={everyone
                    ? `Assign${summary ? ` ${summary}` : ''} to ${members.length} player${members.length === 1 ? '' : 's'}`
                    : `Assign${summary ? ` ${summary}` : ' dues'}`}
                busy="Assigning…"
                disabled={disabled}
            />
            <Outcome state={state} />
        </form>
    )
}

const MONEY_METHODS = MANUAL_PAYMENT_METHODS.filter(m => m.kind === 'money')
const CREDIT_METHODS = MANUAL_PAYMENT_METHODS.filter(m => m.kind === 'credit')

/**
 * Record a cash/Venmo/Zelle/check/other payment, or a volunteer/waived credit, against one
 * assessment. Credits need a note (checked here and by the API).
 * `recordableDollars` is the balance minus any Stripe checkout in progress,
 * which is what "Paid in full" fills in (for credits too).
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
    const noteRef = useRef<HTMLInputElement>(null)
    const values = state.status === 'error' ? state.values : undefined
    const [method, setMethod] = useState(values?.method ?? 'cash')
    const [noteError, setNoteError] = useState<string | null>(null)
    // A failed submit re-renders with the values it sent; follow the method it echoes back.
    const [echoed, setEchoed] = useState(values)
    if (values !== echoed) {
        setEchoed(values)
        if (values?.method) setMethod(values.method)
    }
    const credit = isCreditMethod(method)
    const waiving = method === 'waived'

    return (
        <form
            action={action}
            onSubmit={event => {
                const message = noteRequiredMessage(method)
                if (message && !noteRef.current?.value.trim()) {
                    event.preventDefault()
                    setNoteError(message)
                    noteRef.current?.focus()
                }
            }}
            className="space-y-3 rounded-lg bg-[#fafafa] p-4"
            aria-label={`Record payment for ${context}`}
        >
            <input type="hidden" name="id" value={state.nextId ?? initialId} />
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <input type="hidden" name="recordable" value={recordableDollars} />
            <p className="text-sm font-semibold text-[#111111]">Record payment</p>
            <div className="grid gap-3 sm:grid-cols-[12rem_10rem_minmax(0,1fr)] sm:items-start">
                <div>
                    <label htmlFor={`${id}-amount`} className={labelClass}>
                        Amount (USD){waiving && <span className="font-normal text-[#555555]"> (optional)</span>}
                    </label>
                    <DollarInput
                        id={`${id}-amount`}
                        inputRef={amountRef}
                        defaultValue={values?.amount ?? ''}
                        describedBy={waiving ? `${id}-waive ${id}-full` : `${id}-full`}
                        required={!waiving}
                    />
                    {waiving && (
                        <p id={`${id}-waive`} className="mt-1 text-xs text-[#555555]">
                            Leave blank to waive the whole ${recordableDollars}.
                        </p>
                    )}
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
                    <select
                        id={`${id}-method`}
                        name="method"
                        value={method}
                        onChange={event => {
                            setMethod(event.target.value)
                            setNoteError(null)
                        }}
                        className={`${selectClass} mt-1`}
                    >
                        <optgroup label="Money">
                            {MONEY_METHODS.map(m => <option key={m.value} value={m.value}>{m.option}</option>)}
                        </optgroup>
                        <optgroup label="Credit (not money)">
                            {CREDIT_METHODS.map(m => <option key={m.value} value={m.value}>{m.option}</option>)}
                        </optgroup>
                    </select>
                </div>
                <div>
                    <label htmlFor={`${id}-note`} className={labelClass}>
                        Note{' '}
                        <span className={credit ? 'font-normal text-[#b02a64]' : 'font-normal text-[#555555]'}>
                            {credit ? '(required)' : '(optional)'}
                        </span>
                    </label>
                    <input
                        ref={noteRef}
                        id={`${id}-note`}
                        name="note"
                        maxLength={DUES_LIMITS.note}
                        autoComplete="off"
                        defaultValue={values?.note ?? ''}
                        placeholder={notePlaceholder(method)}
                        aria-required={credit}
                        aria-invalid={noteError ? true : undefined}
                        aria-describedby={noteError ? `${id}-note-error` : credit ? `${id}-note-help` : undefined}
                        onChange={() => noteError && setNoteError(null)}
                        className={`${inputClass} mt-1`}
                    />
                    {noteError ? (
                        <p id={`${id}-note-error`} role="alert" className="mt-1 text-sm font-semibold text-[#b02a64]">{noteError}</p>
                    ) : credit && (
                        <p id={`${id}-note-help`} className="mt-1 text-xs text-[#555555]">
                            Counts toward their balance but isn’t money, so it’s kept apart from what’s collected.
                        </p>
                    )}
                </div>
            </div>
            <SubmitButton label="Record payment" busy="Recording…" />
            <Outcome state={state} />
        </form>
    )
}

/**
 * "Automatic dues for new players": the setting the API applies to every player who signs in
 * or opens their dues. The hidden saved* fields let the admin switch it off with the amount
 * blank without the save failing (see parseAutomaticDuesForm).
 */
export function AutomaticDuesForm({ saved }: { saved: AutomaticDues }) {
    const [state, action] = useActionState<AutomaticDuesState, FormData>(saveAutomaticDues, { status: 'idle', message: null })
    const id = useId()
    const values = state.status === 'error' ? state.values : undefined
    const savedAmount = saved.amountCents > 0 ? centsToDollarsInput(saved.amountCents) : ''

    return (
        <form action={action} className="space-y-4 rounded-lg bg-[#fafafa] p-4" aria-describedby={`${id}-help`}>
            <input type="hidden" name="savedAmountCents" value={saved.amountCents} />
            <input type="hidden" name="savedDescription" value={saved.description} />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#111111]">
                    <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={values?.enabled ?? saved.enabled}
                        className="h-4 w-4 accent-[#77c3ef]"
                    />
                    Assign automatically
                </label>
                <span
                    className={
                        saved.enabled
                            ? 'rounded-full bg-[#77c3ef]/15 px-3 py-1 text-xs font-semibold text-[#1f6f9c]'
                            : 'rounded-full bg-[#EAEAEA] px-3 py-1 text-xs font-semibold text-[#555555]'
                    }
                >
                    {saved.enabled ? 'On' : 'Off'}
                </span>
            </div>
            <p id={`${id}-help`} className="text-sm text-[#555555]">
                Every player who signs in gets these dues unless you remove them. Admins and coaches aren’t included. Existing players
                get them the next time they sign in or open their dues; use “Everyone who has signed in” to assign them now.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label htmlFor={`${id}-description`} className={labelClass}>Description</label>
                    <input
                        id={`${id}-description`}
                        name="description"
                        maxLength={DUES_LIMITS.description}
                        defaultValue={values?.description ?? (saved.description || DEFAULT_DUES_DESCRIPTION)}
                        className={`${inputClass} mt-1`}
                    />
                </div>
                <div>
                    <label htmlFor={`${id}-amount`} className={labelClass}>Amount (USD)</label>
                    <DollarInput id={`${id}-amount`} required={false} defaultValue={values?.amount ?? savedAmount} />
                </div>
                <div>
                    <label htmlFor={`${id}-due`} className={labelClass}>
                        Due date <span className="font-normal text-[#555555]">(optional)</span>
                    </label>
                    <input
                        id={`${id}-due`}
                        name="dueDate"
                        type="date"
                        defaultValue={values?.dueDate ?? saved.dueDate ?? ''}
                        className={`${inputClass} mt-1`}
                    />
                </div>
            </div>
            <SubmitButton label="Save" busy="Saving…" />
            <Outcome state={state} />
        </form>
    )
}

const dangerClass =
    'inline-flex items-center justify-center rounded-md border border-[#fd80b5] px-4 py-2 text-sm font-semibold text-[#b02a64] transition-colors hover:bg-[#fd80b5] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-not-allowed disabled:opacity-60'
const quietClass =
    'inline-flex items-center justify-center rounded-md border border-[#EAEAEA] px-4 py-2 text-sm font-semibold text-[#555555] transition-colors hover:border-[#111111] hover:text-[#111111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:opacity-60'

function ConfirmRemoveButton() {
    const { pending } = useFormStatus()
    return (
        <button type="submit" className={dangerClass} disabled={pending} aria-disabled={pending}>
            {pending ? 'Removing…' : 'Yes, remove'}
        </button>
    )
}

/**
 * Two-step "Remove" for a dues item with nothing paid and no checkout in progress.
 * Success redirects with a page-level notice (the row is gone); errors show inline.
 */
export function RemoveDuesButton({ assessmentId, context }: { assessmentId: string; context: string }) {
    const [state, action] = useActionState<RemoveDuesState, FormData>(removeDues, { status: 'idle', message: null })
    const [confirming, setConfirming] = useState(false)
    const confirmRef = useRef<HTMLDivElement>(null)
    const removeRef = useRef<HTMLButtonElement>(null)
    const id = useId()

    useEffect(() => {
        if (confirming) confirmRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
    }, [confirming])

    return (
        <form action={action} className="space-y-3" aria-label={`Remove dues for ${context}`}>
            <input type="hidden" name="assessmentId" value={assessmentId} />
            {confirming ? (
                <div ref={confirmRef} role="group" aria-labelledby={`${id}-confirm`} className="space-y-3 rounded-lg border border-[#fd80b5] bg-[#fd80b5]/5 p-4">
                    <p id={`${id}-confirm`} className="text-sm text-[#111111]">
                        <span className="font-semibold">Remove these dues?</span>{' '}
                        <span className="text-[#555555]">Removed dues won’t be assigned again automatically.</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <ConfirmRemoveButton />
                        <button
                            type="button"
                            className={quietClass}
                            onClick={() => {
                                setConfirming(false)
                                requestAnimationFrame(() => removeRef.current?.focus())
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-3">
                    <button ref={removeRef} type="button" className={dangerClass} onClick={() => setConfirming(true)}>
                        Remove
                    </button>
                    <span className="text-xs text-[#555555]">Nothing has been paid on this item, so it can be removed.</span>
                </div>
            )}
            {state.status === 'error' && state.message && <Notice tone="error" title={state.message} />}
        </form>
    )
}
