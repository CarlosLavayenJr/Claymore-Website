import Link from 'next/link'
import { LineupEditor, type FormerMember } from './lineup-editor'
import { AdminSection } from '@/components/members/admin-section'
import { formatDate, linkClass, Notice } from '@/components/members/member-ui'
import type { ApiResult, ClaymoresApiClient, FixtureAvailability, Lineup } from '@/lib/claymores/api-client'
import {
    countsLine,
    groupMembers,
    lineupValues,
    matchAnchor,
    memberName,
    shortMatchDate,
    todayInOrlando,
    upcomingMatches,
    type PickerGroup,
} from '@/lib/claymores/match-availability'
import { getMatches } from '@/lib/claymores-api'
import { isHomeMatch, matchSlug, opponentOf } from '@/lib/seo'
import { cn } from '@/lib/utils'
import type { SanityMatch } from '@/sanity/lib/queries'

type MatchAdmin = { match: SanityMatch; availability: ApiResult<FixtureAvailability>; lineup: ApiResult<Lineup> }

const lineupChip: Record<string, { label: string; className: string }> = {
    none: { label: 'No lineup', className: 'bg-[#EAEAEA] text-[#555555]' },
    draft: { label: 'Draft', className: 'bg-[#fd80b5]/15 text-[#b02a64]' },
    published: { label: 'Published', className: 'bg-[#77c3ef] text-white' },
}

function title(match: SanityMatch) {
    return `${isHomeMatch(match) ? 'vs' : 'at'} ${opponentOf(match)}`
}

/**
 * Club Admin "Matches & lineups": who can play the next matches (Available / Maybe / Out /
 * No reply, with notes) and the lineup editor for each. `openFixture` is the match just saved.
 */
export async function MatchesSection({ api, openFixture, alwaysOpen = false }: { api: ClaymoresApiClient; openFixture?: string; alwaysOpen?: boolean }) {
    let matches: SanityMatch[]
    try {
        matches = upcomingMatches(await getMatches(), todayInOrlando())
    } catch {
        matches = []
    }
    const states: MatchAdmin[] = await Promise.all(matches.map(async match => {
        const [availability, lineup] = await Promise.all([
            api.adminFixtureAvailability(match._id), api.adminFixtureLineup(match._id),
        ])
        return { match, availability, lineup }
    }))

    const next = states[0]
    const status = !next
        ? 'No upcoming matches'
        : <>
            Next: {title(next.match)}, {shortMatchDate(next.match.date).replace(/^\w+, /, '')}
            {next.availability.ok && <> · {next.availability.data.counts.available} available</>}
            {next.lineup.ok && next.lineup.data.status !== 'none' && <> · lineup {next.lineup.data.status}</>}
        </>
    const missing = states.length > 0 && states.every(s => !s.availability.ok && s.availability.status === 404)

    return (
        <AdminSection id="matches" title="Matches & lineups" status={status} defaultOpen={alwaysOpen || Boolean(openFixture)} needsAction={alwaysOpen}>
            {states.length === 0 ? (
                <p className="text-[#555555]">
                    No upcoming matches on the <Link href="/fixtures" className={linkClass}>fixtures</Link> list.
                </p>
            ) : missing ? (
                <Notice tone="info" title="Availability isn’t switched on yet">
                    The club server doesn’t have match availability yet. It shows here once the API is updated.
                </Notice>
            ) : (
                <>
                    <p className="mb-4 text-sm text-[#555555]">
                        Members answer on their account page or in the app until match day. Build the lineup from who can play,
                        save it as a draft, then publish it: members see it, and the players in it get a notification.
                    </p>
                    <div className="space-y-3">
                        {states.map(s => <MatchPanel key={s.match._id} state={s} open={s.match._id === openFixture} />)}
                    </div>
                </>
            )}
        </AdminSection>
    )
}

function MatchPanel({ state, open }: { state: MatchAdmin; open: boolean }) {
    const { match, availability, lineup } = state
    const anchor = matchAnchor(match._id)
    const chip = lineup.ok ? lineupChip[lineup.data.status] ?? lineupChip.none : null
    return (
        <details id={anchor} open={open} className="group/match scroll-mt-24 rounded-lg border border-[#EAEAEA]">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                    <span className="block text-lg font-semibold text-[#111111]">{title(match)}</span>
                    <span className="block text-sm text-[#555555]">
                        {shortMatchDate(match.date)}{match.kickoffTime ? ` · ${match.kickoffTime}` : ''}
                        {availability.ok && <> · {countsLine(availability.data.counts)}</>}
                    </span>
                </span>
                {chip && <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', chip.className)}>{chip.label}</span>}
            </summary>
            <div className="space-y-6 border-t border-[#EAEAEA] p-4">
                {!availability.ok ? (
                    <Notice tone="error" title="Availability couldn't load">
                        {availability.status === 404
                            ? 'The club server doesn’t know this match yet. It syncs fixtures every hour.'
                            : 'The club server didn’t respond. Refresh in a minute.'}
                    </Notice>
                ) : (
                    <Breakdown groups={groupMembers(availability.data.members)} />
                )}

                <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="text-lg font-semibold text-[#111111]">Lineup</h4>
                        {lineup.ok && lineup.data.status !== 'none' && (
                            <p className="text-xs text-[#555555]">
                                {lineup.data.status === 'published' && lineup.data.publishedAt
                                    ? `Published ${formatDate(lineup.data.publishedAt, true)}`
                                    : lineup.data.updatedAt ? `Draft saved ${formatDate(lineup.data.updatedAt, true)}` : 'Draft'}
                            </p>
                        )}
                    </div>
                    <div className="mt-3">
                        {!lineup.ok || !availability.ok ? (
                            <Notice tone="error" title="The lineup editor couldn't load">
                                The club server didn’t respond. Refresh in a minute.
                            </Notice>
                        ) : (
                            <LineupEditor
                                fixtureId={match._id}
                                groups={groupMembers(availability.data.members)}
                                formerMembers={formerMembers(lineup.data, availability.data)}
                                initialValues={lineupValues(lineup.data)}
                                status={lineup.data.status}
                            />
                        )}
                    </div>
                </div>
                <p className="text-sm">
                    <Link href={`/fixtures/${matchSlug(match)}`} className={linkClass}>Match page</Link>
                </p>
            </div>
        </details>
    )
}

function formerMembers(lineup: Lineup, availability: FixtureAvailability): FormerMember[] {
    const current = new Set(availability.members.map(m => m.subject))
    return lineup.slots.filter(s => !current.has(s.subject)).map(s => ({ subject: s.subject, name: s.name }))
}

function Breakdown({ groups }: { groups: PickerGroup[] }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map(g => (
                <div key={g.key}>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-[#555555]">
                        {g.label} <span className="text-[#111111]">{g.members.length}</span>
                    </h4>
                    {g.members.length === 0 ? (
                        <p className="mt-1 text-sm text-[#999999]">None</p>
                    ) : (
                        <ul className="mt-1 space-y-1 text-sm">
                            {g.members.map(m => (
                                <li key={m.subject} className="text-[#111111]">
                                    {memberName(m)}
                                    {m.note && <span className="block text-xs text-[#555555]">“{m.note}”</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
        </div>
    )
}
