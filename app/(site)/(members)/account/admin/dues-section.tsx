import { randomUUID } from 'node:crypto'
import { ChevronDown } from 'lucide-react'
import { cancelDuesCheckout, editDuesPaymentNote, undoDuesPayment } from './actions'
import { DuesSummary } from './dues-summary'
import { AdminSection } from '@/components/members/admin-section'
import { AssignDuesForm, AutomaticDuesForm, RecordPaymentForm, RemoveDuesButton, type MemberOption } from './dues-forms'
import { CardHeading, formatDate, inputClass, labelClass, MemberCard, Notice } from '@/components/members/member-ui'
import {
    canRemoveDues,
    centsToDollarsInput,
    creditedCentsOf,
    DUES_LIMITS,
    isCreditMethod,
    mapWithConcurrency,
    memberLabel,
    normalizeAutomaticDues,
    notePlaceholder,
    paymentMethodLabel,
    recordableCents,
    sortMembers,
    summarizeDues,
} from '@/lib/claymores/admin-dues'
import { formatCents, type AdminDuesAssessment, type AdminDuesDetail, type ClaymoresApiClient, type DuesPayment } from '@/lib/claymores/api-client'

/** Detail requests in flight at once while rendering the list. */
const DETAIL_CONCURRENCY = 6

function Money({ label, cents, emphasis }: { label: string; cents: number; emphasis?: boolean }) {
    return (
        <span className="block">
            <span className="block text-[0.7rem] font-semibold uppercase tracking-widest text-[#555555]">{label}</span>
            <span className={emphasis ? 'block font-claymore text-lg text-[#111111]' : 'block font-semibold text-[#111111]'}>
                {formatCents(cents)}
            </span>
        </span>
    )
}

const smallButton =
    'inline-flex items-center justify-center rounded-md border border-[#EAEAEA] px-3 py-1.5 text-sm font-semibold text-[#555555] transition-colors hover:border-[#111111] hover:text-[#111111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]'
const smallDanger =
    'inline-flex items-center justify-center rounded-md border border-[#fd80b5] px-3 py-1.5 text-sm font-semibold text-[#b02a64] transition-colors hover:bg-[#fd80b5] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]'
const disclosure = 'cursor-pointer list-none text-sm font-semibold text-[#fd80b5] marker:hidden hover:text-[#111111] [&::-webkit-details-marker]:hidden'

function PaymentActions({ assessmentId, payment }: { assessmentId: string; payment: DuesPayment }) {
    const credit = isCreditMethod(payment.method ?? '')
    return (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            <details className="w-full sm:w-auto">
                <summary className={disclosure}>Edit note</summary>
                <form action={editDuesPaymentNote} className="mt-2 space-y-2">
                    <input type="hidden" name="assessmentId" value={assessmentId} />
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <label htmlFor={`note-${payment.id}`} className="sr-only">Note</label>
                    <textarea
                        id={`note-${payment.id}`}
                        name="note"
                        rows={2}
                        maxLength={DUES_LIMITS.note}
                        required={credit}
                        defaultValue={payment.note ?? ''}
                        placeholder={notePlaceholder(payment.method ?? 'other')}
                        className={inputClass}
                    />
                    <button type="submit" className={smallButton}>Save note</button>
                </form>
            </details>
            <details className="w-full sm:w-auto">
                <summary className={disclosure}>Undo payment</summary>
                <form action={undoDuesPayment} className="mt-2 space-y-2 rounded-lg border border-[#fd80b5] bg-[#fd80b5]/5 p-3">
                    <input type="hidden" name="assessmentId" value={assessmentId} />
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <input type="hidden" name="method" value={payment.method ?? ''} />
                    <p className="text-sm text-[#111111]">
                        It stays in the history, crossed out, and the balance goes back up by {formatCents(payment.amountCents)}.
                    </p>
                    {payment.method === 'stripe' && (
                        <p className="text-sm font-semibold text-[#b02a64]">
                            This only fixes the club’s records. To give the money back, refund it in the Stripe dashboard.
                        </p>
                    )}
                    <label htmlFor={`reason-${payment.id}`} className={labelClass}>Why?</label>
                    <input
                        id={`reason-${payment.id}`}
                        name="reason"
                        required
                        maxLength={DUES_LIMITS.note}
                        placeholder="Recorded on the wrong player"
                        className={inputClass}
                    />
                    <button type="submit" className={smallDanger}>Undo payment</button>
                </form>
            </details>
        </div>
    )
}

function PaymentHistory({ detail, context }: { detail: AdminDuesDetail | null; context: string }) {
    if (detail === null) return <p className="text-sm text-[#555555]">Payment history couldn’t load. Refresh in a minute.</p>
    if (detail.payments.length === 0) return <p className="text-sm text-[#555555]">No payments recorded yet.</p>
    return (
        <ul className="divide-y divide-[#EAEAEA] rounded-lg border border-[#EAEAEA]" aria-label={`Payments for ${context}`}>
            {detail.payments.map(p => {
                const undone = Boolean(p.voidedAt)
                return (
                    <li key={p.id} className={`px-3 py-2.5 text-sm ${undone ? 'bg-[#fafafa]' : ''}`}>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <div className="min-w-0">
                                <p className={undone ? 'text-[#555555] line-through' : 'text-[#111111]'}>
                                    <span className="font-semibold">{formatCents(p.amountCents)}</span>
                                    <span className="text-[#555555]"> · {paymentMethodLabel(p.method) ?? 'Method not recorded'}</span>
                                </p>
                                {p.note && <p className="mt-0.5 whitespace-pre-line break-words text-[#555555]">{p.note}</p>}
                                {undone && (
                                    <p className="mt-0.5 break-words text-[#b02a64]">
                                        Undone{p.voidedBy ? ` by ${p.voidedBy}` : ''}{p.voidedAt ? ` on ${formatDate(p.voidedAt)}` : ''}
                                        {p.voidReason ? `: ${p.voidReason}` : ''}
                                    </p>
                                )}
                            </div>
                            <p className="shrink-0 text-xs text-[#555555] sm:text-sm">{formatDate(p.recordedAt, true) ?? '—'}</p>
                        </div>
                        {!undone && <PaymentActions assessmentId={detail.assessment.id} payment={p} />}
                    </li>
                )
            })}
        </ul>
    )
}

function AssessmentRow({ dues, player, detail }: { dues: AdminDuesAssessment; player: string; detail: AdminDuesDetail | null }) {
    // The detail call is the fresher read; fall back to the list row.
    const current = detail?.assessment ?? dues
    const due = formatDate(current.dueDate)
    const paidInFull = current.balanceCents <= 0
    const pending = current.pendingCheckoutCents > 0
    const recordable = recordableCents(current)
    const context = `${player}, ${current.description}`

    return (
        <li className="rounded-lg border border-[#EAEAEA]">
            <div className="flex flex-col gap-3 p-4 sm:p-5">
                    <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0">
                            <span className="block break-words font-semibold text-[#111111]">{player}</span>
                            <span className="block text-sm text-[#555555]">
                                {current.description}
                                {due && <> · Due {due}</>}
                            </span>
                        </span>
                        <span
                            className={
                                paidInFull
                                    ? 'rounded-full bg-[#77c3ef]/15 px-3 py-1 text-xs font-semibold text-[#1f6f9c]'
                                    : 'rounded-full bg-[#fd80b5]/15 px-3 py-1 text-xs font-semibold text-[#b02a64]'
                            }
                        >
                            {paidInFull ? 'Paid in full' : 'Balance due'}
                        </span>
                    </span>
                    <span className="grid grid-cols-3 gap-2">
                        <Money label="Amount" cents={current.amountCents} />
                        <Money label="Paid" cents={current.paidCents} />
                        <Money label="Balance" cents={current.balanceCents} emphasis />
                    </span>
                    {creditedCentsOf(current) > 0 && (
                        <span className="block text-sm text-[#555555]">
                            Includes {formatCents(creditedCentsOf(current))} credited (volunteer/waived)
                        </span>
                    )}
                    {pending && (
                        <span className="block text-sm text-[#555555]">
                            Card checkout in progress: <span className="font-semibold text-[#111111]">{formatCents(current.pendingCheckoutCents)}</span>
                        </span>
                    )}
            </div>
            <details className="group/pay border-t border-[#EAEAEA]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-b-lg px-4 py-3 text-sm font-semibold text-[#fd80b5] marker:hidden hover:bg-[#fafafa] sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span className="group-open/pay:hidden">Show payments{!paidInFull && ' and record a payment'}</span>
                    <span className="hidden group-open/pay:inline">Hide payments</span>
                    <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open/pay:rotate-180" />
                </summary>

                <div className="space-y-4 border-t border-[#EAEAEA] p-4 sm:p-5">
                    <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#555555]">Payment history</h4>
                        <PaymentHistory detail={detail} context={context} />
                    </div>
                    {paidInFull ? null : recordable > 0 ? (
                        <RecordPaymentForm
                            assessmentId={current.id}
                            recordableDollars={centsToDollarsInput(recordable)}
                            initialId={randomUUID()}
                            context={context}
                        />
                    ) : (
                        <Notice tone="info" title="A card payment covers the rest of this balance">
                            The player started a {formatCents(current.pendingCheckoutCents)} card checkout. Wait for it to
                            finish, or cancel it below to waive or record the balance.
                        </Notice>
                    )}
                    {pending && (
                        <form action={cancelDuesCheckout} className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fafafa] p-4">
                            <input type="hidden" name="assessmentId" value={current.id} />
                            <button type="submit" className="inline-flex items-center justify-center rounded-md border border-[#fd80b5] px-4 py-2 text-sm font-semibold text-[#b02a64] transition-colors hover:bg-[#fd80b5] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]">
                                Cancel card checkout
                            </button>
                            <span className="text-xs text-[#555555]">
                                {formatCents(current.pendingCheckoutCents)} is held by a card checkout the player started. Cancel it to waive or record that amount; if they actually paid, the payment gets recorded instead.
                            </span>
                        </form>
                    )}
                    {canRemoveDues(current) && (
                        <div className="border-t border-[#EAEAEA] pt-4">
                            <RemoveDuesButton assessmentId={current.id} context={context} />
                        </div>
                    )}
                </div>
            </details>
        </li>
    )
}

export async function DuesSection({ api }: { api: ClaymoresApiClient }) {
    const [dues, members, automatic] = await Promise.all([api.allDues(), api.members(), api.getAutomaticDues()])

    if (!dues.ok && dues.status === 404) {
        return (
            <MemberCard aria-labelledby="dues-heading">
                <CardHeading id="dues-heading">Manage dues</CardHeading>
                <div className="mt-5">
                    <Notice tone="info" title="Dues are switched off">
                        Dues aren’t turned on for the club server yet. Once they are, you can assign dues and record payments here.
                    </Notice>
                </div>
            </MemberCard>
        )
    }

    const sortedMembers = members.ok ? sortMembers(members.data) : []
    const labels = new Map(sortedMembers.map(m => [m.subject, memberLabel(m)]))
    const options: MemberOption[] = sortedMembers.map(m => ({ subject: m.subject, label: memberLabel(m) }))
    const playerLabel = (subject: string) => labels.get(subject) ?? (members.ok ? 'Former member' : 'Member names unavailable')

    // Outstanding first, then by player, then by due date.
    const list = dues.ok
        ? [...dues.data].sort((a, b) =>
            Number(a.balanceCents <= 0) - Number(b.balanceCents <= 0)
            || playerLabel(a.playerSubject).localeCompare(playerLabel(b.playerSubject), 'en', { sensitivity: 'base' })
            || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
        : []
    const details = await mapWithConcurrency(list, DETAIL_CONCURRENCY, async d => {
        const r = await api.duesDetail(d.id)
        return r.ok ? r.data : null
    })
    const summary = summarizeDues(list, playerLabel)
    const outstanding = list.reduce((sum, d) => sum + Math.max(0, d.balanceCents), 0)
    const paidCount = list.filter(d => d.balanceCents <= 0).length
    const auto = automatic.ok ? normalizeAutomaticDues(automatic.data) : null

    return (
        <>
            <AdminSection
                id="who-has-paid"
                defaultOpen
                title="Who has paid"
                status={!dues.ok ? 'Couldn’t load' : list.length === 0
                    ? 'No dues assigned yet'
                    : <>{paidCount} of {list.length} paid in full · <span className="font-semibold text-[#111111]">{formatCents(outstanding)}</span> outstanding</>}
            >
                {summary.length > 0
                    ? <DuesSummary groups={summary} />
                    : <p className="text-[#555555]">Once dues are assigned, this shows who has paid, per dues item.</p>}
            </AdminSection>

            <AdminSection
                id="all-dues"
                defaultOpen
                title="Payments"
                status={!dues.ok ? 'Couldn’t load' : list.length === 0
                    ? 'Nothing yet'
                    : 'Record cash, see each player’s history, edit notes, undo a payment'}
            >
                {!dues.ok ? (
                    <Notice tone="error" title="Dues couldn’t load">
                        {dues.status === 403
                            ? 'Only club admins can see club dues.'
                            : 'The club server didn’t respond. Refresh in a minute.'}
                    </Notice>
                ) : list.length === 0 ? (
                    <p className="text-[#555555]">No dues assigned yet.</p>
                ) : (
                    <ul className="space-y-3">
                        {list.map((d, i) => (
                            <AssessmentRow key={d.id} dues={d} player={playerLabel(d.playerSubject)} detail={details[i] ?? null} />
                        ))}
                    </ul>
                )}
            </AdminSection>

            <AdminSection
                id="assign-dues"
                title="Assign dues"
                status="Open to bill one player or everyone at once"
            >
                <div className="space-y-3">
                    {!members.ok && (
                        <Notice tone="error" title="The member list couldn’t load">
                            The club server didn’t respond. Refresh in a minute to assign dues.
                        </Notice>
                    )}
                    {members.ok && <AssignDuesForm members={options} initialId={randomUUID()} />}
                    {members.ok && options.length > 0 && (
                        <p className="text-xs text-[#555555]">Only members who have signed in at least once are listed.</p>
                    )}
                </div>
            </AdminSection>

            {(automatic.ok || automatic.status !== 404) && (
                <AdminSection
                    id="automatic-dues"
                    title="Automatic dues"
                    status={!auto ? 'Couldn’t load' : auto.enabled
                        ? <>On · {auto.description} {formatCents(auto.amountCents)} for every new player</>
                        : 'Off'}
                >
                    {auto ? (
                        <AutomaticDuesForm saved={auto} />
                    ) : (
                        <Notice tone="error" title="Automatic dues couldn’t load">
                            {automatic.status === 403
                                ? 'Only club admins can change automatic dues.'
                                : 'The club server didn’t respond. Refresh in a minute.'}
                        </Notice>
                    )}
                </AdminSection>
            )}
        </>
    )
}
