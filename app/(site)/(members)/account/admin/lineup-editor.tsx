'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveLineup, type LineupState } from './actions'
import { ctaClass, inputClass, Notice, secondaryCtaClass } from '@/components/members/member-ui'
import type { LineupStatus } from '@/lib/claymores/api-client'
import {
    availabilityLabel,
    LINEUP_NUMBERS,
    memberName,
    positionOf,
    STARTERS,
    type LineupValues,
    type PickerGroup,
} from '@/lib/claymores/match-availability'
import { cn } from '@/lib/utils'

const initialState: LineupState = { status: 'idle', message: null, attempt: 0 }

const statusTag: Record<string, string> = {
    maybe: 'bg-[#fd80b5]/15 text-[#b02a64]',
    unavailable: 'bg-[#111111] text-white',
    none: 'bg-[#EAEAEA] text-[#555555]',
}

/** Someone in a saved lineup who is no longer a member (the API refuses to save them again). */
export type FormerMember = { subject: string; name: string | null }

function SaveButtons({ status }: { status: LineupStatus }) {
    const { pending, data } = useFormStatus()
    const intent = data?.get('intent')
    const published = status === 'published'
    return (
        <div className="flex flex-wrap gap-2">
            <button
                type="submit"
                name="intent"
                value="draft"
                disabled={pending}
                className={`${secondaryCtaClass} py-2 text-sm`}
                onClick={event => {
                    if (published && !window.confirm('Move this lineup back to a draft? Members stop seeing it until you publish again.')) {
                        event.preventDefault()
                    }
                }}
            >
                {pending && intent === 'draft' ? 'Saving…' : published ? 'Unpublish (save as draft)' : 'Save draft'}
            </button>
            <button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                className={`${ctaClass} py-2 text-base`}
                onClick={event => {
                    const message = published
                        ? 'Update the published lineup? Members see the change straight away.'
                        : 'Publish this lineup? Players in it get a notification.'
                    if (!window.confirm(message)) event.preventDefault()
                }}
            >
                {pending && intent === 'publish' ? 'Publishing…' : published ? 'Update published lineup' : 'Publish'}
            </button>
        </div>
    )
}

/**
 * The 23-row lineup editor for one match: number, position, and a member picker grouped
 * Available / Maybe / No reply / Out. Save draft keeps it to admins; Publish shows it to members.
 */
export function LineupEditor({ fixtureId, groups, formerMembers, initialValues, status }: {
    fixtureId: string
    groups: PickerGroup[]
    formerMembers: FormerMember[]
    initialValues: LineupValues
    status: LineupStatus
}) {
    const [state, formAction] = useActionState(saveLineup, initialState)
    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="fixtureId" value={fixtureId} />
            {state.status === 'error' && state.message && <Notice tone="error" title={state.message} />}
            {/* Remount on each failed submit so the picks come back from the action's state. */}
            <Rows
                key={state.attempt}
                fixtureId={fixtureId}
                groups={groups}
                formerMembers={formerMembers}
                initialValues={state.values ?? initialValues}
            />
            <SaveButtons status={status} />
        </form>
    )
}

function Rows({ fixtureId, groups, formerMembers, initialValues }: {
    fixtureId: string
    groups: PickerGroup[]
    formerMembers: FormerMember[]
    initialValues: LineupValues
}) {
    const [values, setValues] = useState<LineupValues>(initialValues)
    const statusOf = useMemo(() => {
        const map = new Map<string, string>()
        for (const g of groups) for (const m of g.members) map.set(m.subject, m.status ?? 'none')
        return map
    }, [groups])
    const counts = useMemo(() => {
        const used = new Map<string, number>()
        for (const n of LINEUP_NUMBERS) if (values[n]) used.set(values[n], (used.get(values[n]) ?? 0) + 1)
        return used
    }, [values])
    const picked = LINEUP_NUMBERS.filter(n => values[n]).length

    const row = (n: number) => {
        const subject = values[n] ?? ''
        const id = `lineup-${fixtureId}-${n}`
        const twice = subject && (counts.get(subject) ?? 0) > 1
        const answer = subject ? statusOf.get(subject) ?? 'former' : null
        return (
            <li key={n} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[2rem_9rem_minmax(0,1fr)]">
                <span className="text-right font-claymore text-lg text-[#111111]">{n}</span>
                <label htmlFor={id} className="text-sm text-[#555555] sm:order-none">{positionOf(n)}</label>
                <div className="col-start-2 flex min-w-0 items-center gap-2 sm:col-start-auto">
                    <select
                        id={id}
                        name={`slot-${n}`}
                        // Uncontrolled: React resets the form after the action, back to these defaults
                        // (the saved lineup, or the picks a failed save returned). `values` only drives the tags.
                        defaultValue={initialValues[n] ?? ''}
                        onChange={event => setValues(v => ({ ...v, [n]: event.target.value }))}
                        aria-invalid={twice || undefined}
                        className={cn(inputClass, 'min-w-0 flex-1 py-2 pr-8 text-sm', twice && 'border-[#fd80b5] ring-2 ring-[#fd80b5]/40')}
                    >
                        <option value="">—</option>
                        {groups.filter(g => g.members.length > 0).map(g => (
                            <optgroup key={g.key} label={g.label}>
                                {g.members.map(m => (
                                    <option key={m.subject} value={m.subject}>
                                        {memberName(m)}{m.note ? ` — ${m.note}` : ''}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        {formerMembers.length > 0 && (
                            <optgroup label="No longer a member">
                                {formerMembers.map(m => (
                                    <option key={m.subject} value={m.subject}>{m.name ?? 'Former member'}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                    {twice ? (
                        <span className="shrink-0 rounded-full bg-[#fd80b5] px-2 py-0.5 text-xs font-semibold text-white">Twice</span>
                    ) : answer && answer !== 'available' ? (
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', statusTag[answer] ?? statusTag.none)}>
                            {answer === 'former' ? 'Not a member' : availabilityLabel(answer === 'none' ? null : answer)}
                        </span>
                    ) : null}
                </div>
            </li>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-[#555555]">{picked} of 23 picked</p>
            <div>
                <h5 className="text-xs font-semibold uppercase tracking-widest text-[#555555]">Starting XV</h5>
                <ol className="mt-2 space-y-2">{LINEUP_NUMBERS.filter(n => n <= STARTERS).map(row)}</ol>
            </div>
            <div>
                <h5 className="text-xs font-semibold uppercase tracking-widest text-[#555555]">Replacements</h5>
                <ol className="mt-2 space-y-2">{LINEUP_NUMBERS.filter(n => n > STARTERS).map(row)}</ol>
            </div>
        </div>
    )
}
