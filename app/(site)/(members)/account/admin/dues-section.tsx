import { randomUUID } from 'node:crypto'
import { DuesSummary } from './dues-summary'
import { AssignDuesForm, AutomaticDuesForm, RecordPaymentForm, RemoveDuesButton, type MemberOption } from './dues-forms'
import { CardHeading, formatDate, MemberCard, Notice } from '@/components/members/member-ui'
import {
    canRemoveDues,
    centsToDollarsInput,
    creditedCentsOf,
    mapWithConcurrency,
    memberLabel,
    normalizeAutomaticDues,
    paymentMethodLabel,
    recordableCents,
    sortMembers,
    summarizeDues,
} from '@/lib/claymores/admin-dues'
import { formatCents, type AdminDuesAssessment, type AdminDuesDetail, type ClaymoresApiClient } from '@/lib/claymores/api-client'

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

function PaymentHistory({ detail, context }: { detail: AdminDuesDetail | null; context: string }) {
    if (detail === null) return <p className="text-sm text-[#555555]">Payment history couldn’t load. Refresh in a minute.</p>
    if (detail.payments.length === 0) return <p className="text-sm text-[#555555]">No payments recorded yet.</p>
    return (
        <ul className="divide-y divide-[#EAEAEA] rounded-lg border border-[#EAEAEA]" aria-label={`Payments for ${context}`}>
            {detail.payments.map(p => (
                <li key={p.id} className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                        <p className="text-[#111111]">
                            <span className="font-semibold">{formatCents(p.amountCents)}</span>
                            <span className="text-[#555555]"> · {paymentMethodLabel(p.method) ?? 'Method not recorded'}</span>
                        </p>
                        {p.note && <p className="mt-0.5 whitespace-pre-line break-words text-[#555555]">{p.note}</p>}
                    </div>
                    <p className="shrink-0 text-xs text-[#555555] sm:text-sm">{formatDate(p.recordedAt, true) ?? '—'}</p>
                </li>
            ))}
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
            <details className="group">
                <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 marker:hidden sm:p-5 [&::-webkit-details-marker]:hidden">
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
                    <span className="text-sm font-semibold text-[#fd80b5] group-open:hidden">Show payments{!paidInFull && ' and record a payment'}</span>
                    <span className="hidden text-sm font-semibold text-[#fd80b5] group-open:inline">Hide details</span>
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
                            Wait for the {formatCents(current.pendingCheckoutCents)} Stripe checkout to finish or expire
                            before recording another payment.
                        </Notice>
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

    return (
        <MemberCard aria-labelledby="dues-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardHeading id="dues-heading">Manage dues</CardHeading>
                {dues.ok && list.length > 0 && (
                    <p className="text-sm text-[#555555]">
                        Outstanding <span className="font-claymore text-xl text-[#111111]">{formatCents(outstanding)}</span>
                    </p>
                )}
            </div>
            <p className="mt-2 text-sm text-[#555555]">
                Assign dues to a member, then record cash, Venmo, Zelle, or check payments as they come in. Card payments
                through Stripe record themselves.
            </p>

            {/* 404 means dues are switched off (or this API predates automatic dues): hide the card. */}
            {(automatic.ok || automatic.status !== 404) && (
                <section aria-labelledby="automatic-dues-heading" className="mt-6">
                    <h3 id="automatic-dues-heading" className="text-lg font-semibold text-[#111111]">Automatic dues for new players</h3>
                    <div className="mt-3">
                        {automatic.ok ? (
                            <AutomaticDuesForm saved={normalizeAutomaticDues(automatic.data)} />
                        ) : (
                            <Notice tone="error" title="Automatic dues couldn’t load">
                                {automatic.status === 403
                                    ? 'Only club admins can change automatic dues.'
                                    : 'The club server didn’t respond. Refresh in a minute.'}
                            </Notice>
                        )}
                    </div>
                </section>
            )}

            <DuesSummary groups={summary} />

            <h3 className="mt-8 text-lg font-semibold text-[#111111]">Assign dues</h3>
            <div className="mt-3 space-y-3">
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

            <h3 className="mt-8 text-lg font-semibold text-[#111111]">All dues</h3>
            <div className="mt-3">
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
            </div>
        </MemberCard>
    )
}
