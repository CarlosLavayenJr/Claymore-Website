import { ChevronDown } from 'lucide-react'
import {
    duesMoneyParts,
    duesSummaryTotals,
    formatSummaryCents,
    type DuesSummaryGroup,
    type DuesSummaryMember,
} from '@/lib/claymores/admin-dues'

const pct = (part: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, (part / total) * 100)) : 0)

/** Volunteer/waived credit in the progress bar: light steel blue with diagonal stripes. */
const creditStyle = {
    backgroundColor: 'rgba(119, 195, 239, 0.35)',
    backgroundImage: 'repeating-linear-gradient(135deg, rgba(119, 195, 239, 0.9) 0 3px, transparent 3px 6px)',
}

/** "$1,950 collected · $250 credited · $800 outstanding", credited only when there is some. */
function MoneyLine({ totals }: { totals: Parameters<typeof duesMoneyParts>[0] }) {
    return (
        <>
            {duesMoneyParts(totals).map((part, i) => (
                <span key={part.label}>
                    {i > 0 && ' · '}
                    {part.label === 'credited' && (
                        <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={creditStyle} />
                    )}
                    <span className="font-semibold text-[#111111]">{part.amount}</span> {part.label}
                    {part.label === 'credited' && <span className="sr-only"> (volunteered or waived, not money)</span>}
                </span>
            ))}
        </>
    )
}

function NameList({ title, people, showBalance, tone }: {
    title: string
    people: DuesSummaryMember[]
    showBalance?: boolean
    tone: 'blue' | 'pink' | 'grey'
}) {
    const dot = tone === 'blue' ? 'bg-[#77c3ef]' : tone === 'pink' ? 'bg-[#fd80b5]/50' : 'bg-[#EAEAEA]'
    return (
        <div className="min-w-0">
            <h5 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#555555]">
                <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                {title} ({people.length})
            </h5>
            {people.length === 0 ? (
                <p className="mt-1.5 text-sm text-[#555555]">Nobody</p>
            ) : (
                <ul className="mt-1.5 space-y-1 text-sm text-[#111111]">
                    {people.map((p, i) => (
                        <li key={`${p.label}-${i}`} className="flex flex-wrap justify-between gap-x-3">
                            <span className="min-w-0 break-words">{p.label}</span>
                            {showBalance && (
                                <span className="shrink-0 text-[#555555]">{formatSummaryCents(p.balanceCents)} left</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function GroupCard({ group }: { group: DuesSummaryGroup }) {
    // Order: money paid in full (blue), all volunteer/waived credit (striped), money partly paid (pink).
    const full = pct(group.paidInFullCents, group.totalCents)
    const credited = Math.min(100 - full, pct(group.paidInFullCreditedCents + group.partlyPaidCreditedCents, group.totalCents))
    const partly = Math.min(100 - full - credited, pct(group.partlyPaidCents, group.totalCents))
    const counts = [
        group.partlyPaid > 0 && `${group.partlyPaid} partly paid`,
        group.unpaid > 0 && `${group.unpaid} unpaid`,
    ].filter(Boolean)

    return (
        <li className="rounded-lg border border-[#EAEAEA]">
            <div className="flex flex-col gap-2.5 p-4">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="min-w-0 break-words font-semibold text-[#111111]">
                            {group.description}
                            <span className="font-normal text-[#555555]">
                                {' · '}
                                {group.amountCents !== null ? `${formatSummaryCents(group.amountCents)} each` : 'Varied amounts'}
                            </span>
                        </span>
                        {group.outstandingCents === 0 && (
                            <span className="rounded-full bg-[#77c3ef]/15 px-2.5 py-0.5 text-xs font-semibold text-[#1f6f9c]">All paid</span>
                        )}
                    </span>
                    <span aria-hidden className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#EAEAEA]">
                        <span className="h-full bg-[#77c3ef]" style={{ width: `${full}%` }} />
                        {credited > 0 && <span className="h-full" style={{ ...creditStyle, width: `${credited}%` }} />}
                        <span className="h-full bg-[#fd80b5]/50" style={{ width: `${partly}%` }} />
                    </span>
                    <span className="block text-sm text-[#111111]">
                        <span className="font-semibold">{group.paidInFull} of {group.count}</span> paid in full
                        {counts.map(c => <span key={String(c)} className="text-[#555555]"> · {c}</span>)}
                    </span>
                    <span className="block text-sm text-[#555555]">
                        <MoneyLine totals={group} />
                        {group.pendingCheckoutCents > 0 && <> · {formatSummaryCents(group.pendingCheckoutCents)} in card checkout</>}
                    </span>
            </div>
            <details className="group/names border-t border-[#EAEAEA]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-b-lg px-4 py-3 text-sm font-semibold text-[#fd80b5] marker:hidden hover:bg-[#fafafa] [&::-webkit-details-marker]:hidden">
                    <span className="group-open/names:hidden">Show names ({group.count})</span>
                    <span className="hidden group-open/names:inline">Hide names</span>
                    <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open/names:rotate-180" />
                </summary>
                <div className="grid gap-4 border-t border-[#EAEAEA] p-4 sm:grid-cols-3">
                    <NameList title="Paid in full" people={group.members.paid} tone="blue" />
                    <NameList title="Partly paid" people={group.members.partly} showBalance tone="pink" />
                    <NameList title="Unpaid" people={group.members.unpaid} tone="grey" />
                </div>
            </details>
        </li>
    )
}

/** "Who has paid what": one card per dues description plus a club-wide total. */
export function DuesSummary({ groups }: { groups: DuesSummaryGroup[] }) {
    if (groups.length === 0) return null
    const totals = duesSummaryTotals(groups)

    return (
        <section aria-label="Who has paid, per dues item">
            <p className="text-sm text-[#555555]">
                Club total: <MoneyLine totals={totals} />
            </p>
            <ul className="mt-3 space-y-3">
                {groups.map(g => <GroupCard key={g.description.toLowerCase()} group={g} />)}
            </ul>
        </section>
    )
}
