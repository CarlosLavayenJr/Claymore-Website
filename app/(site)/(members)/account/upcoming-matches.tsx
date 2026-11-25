import Link from 'next/link'
import { answerAvailability } from './actions'
import { CardHeading, formatDate, inputClass, linkClass, MemberCard, Notice } from '@/components/members/member-ui'
import type { ApiResult, ClaymoresApiClient, Lineup, MyAvailability } from '@/lib/claymores/api-client'
import {
    AVAILABILITY_CHOICES,
    availabilityLabel,
    countsLine,
    matchAnchor,
    MAX_AVAILABILITY_NOTE,
    memberName,
    shortMatchDate,
    STARTERS,
    todayInOrlando,
    upcomingMatches,
} from '@/lib/claymores/match-availability'
import { getMatches } from '@/lib/claymores-api'
import { isHomeMatch, matchSlug, opponentOf } from '@/lib/seo'
import { cn } from '@/lib/utils'
import type { SanityMatch } from '@/sanity/lib/queries'

const outcomes: Record<string, { tone: 'success' | 'error'; title: string }> = {
    saved: { tone: 'success', title: 'Thanks, your answer is saved. You can change it until match day.' },
    closed: { tone: 'error', title: 'That match has been played, so answers are closed.' },
    invalid: { tone: 'error', title: 'Pick Available, Maybe or Out. Notes are at most 200 characters.' },
    not_found: { tone: 'error', title: 'That match isn’t open for answers. It may have been moved or removed.' },
    unavailable: { tone: 'error', title: 'The club server didn’t respond. Try again in a minute.' },
}

const choiceStyles: Record<string, { on: string; off: string }> = {
    available: { on: 'border-[#77c3ef] bg-[#77c3ef] text-white', off: 'border-[#77c3ef] text-[#1f6f9c] hover:bg-[#77c3ef]/15' },
    maybe: { on: 'border-[#fd80b5] bg-[#fd80b5] text-white', off: 'border-[#fd80b5] text-[#b02a64] hover:bg-[#fd80b5]/15' },
    unavailable: { on: 'border-[#111111] bg-[#111111] text-white', off: 'border-[#555555] text-[#111111] hover:bg-[#EAEAEA]' },
}

type MatchState = {
    match: SanityMatch
    availability: ApiResult<MyAvailability>
    lineup: ApiResult<Lineup>
}

/**
 * "Upcoming matches" on /account: the next Claymores matches, the member's answer (Available /
 * Maybe / Out + note), the club's counts, and the lineup once an admin publishes it.
 * Renders nothing when the API doesn't have availability yet (every match 404s).
 */
export async function UpcomingMatches({ api, subject, outcome }: {
    api: ClaymoresApiClient
    subject: string
    outcome?: string
}) {
    let matches: SanityMatch[]
    try {
        matches = upcomingMatches(await getMatches(), todayInOrlando())
    } catch {
        matches = []
    }
    const states: MatchState[] = await Promise.all(matches.map(async match => {
        const [availability, lineup] = await Promise.all([api.fixtureAvailability(match._id), api.fixtureLineup(match._id)])
        return { match, availability, lineup }
    }))

    const anyOpen = states.some(s => s.availability.ok)
    const allMissing = states.length > 0 && states.every(s => !s.availability.ok && s.availability.status === 404)
    if (allMissing) return null
    const notice = outcome ? outcomes[outcome] : undefined

    return (
        <MemberCard aria-labelledby="matches-heading" id="matches" className="scroll-mt-24">
            <CardHeading id="matches-heading">Upcoming matches</CardHeading>
            <p className="mt-2 text-sm text-[#555555]">
                Let the coaches know if you can play. You can change your answer until match day.
            </p>
            {notice && <Notice tone={notice.tone} title={notice.title} className="mt-4" />}
            <div className="mt-5 space-y-4">
                {states.length === 0 ? (
                    <p className="text-[#555555]">
                        No matches on the calendar right now. See the <Link href="/fixtures" className={linkClass}>fixtures</Link>.
                    </p>
                ) : !anyOpen && states.every(s => !s.availability.ok && s.availability.status !== 404) ? (
                    <Notice tone="error" title="Matches couldn't load">The club server didn’t respond. Refresh in a minute.</Notice>
                ) : (
                    states.map(s => <MatchCard key={s.match._id} state={s} subject={subject} />)
                )}
            </div>
        </MemberCard>
    )
}

function MatchCard({ state, subject }: { state: MatchState; subject: string }) {
    const { match, availability, lineup } = state
    const home = isHomeMatch(match)
    const opponent = opponentOf(match)
    const details = [shortMatchDate(match.date), match.kickoffTime, match.venue ?? (home ? 'Barnett Park, Orlando' : null)]
        .filter(Boolean).join(' · ')
    const mine = availability.ok ? availability.data : null
    const published = lineup.ok && lineup.data.status === 'published' ? lineup.data : null

    return (
        <article id={matchAnchor(match._id)} className="scroll-mt-24 rounded-lg border border-[#EAEAEA] p-4 sm:p-5" aria-labelledby={`${matchAnchor(match._id)}-title`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 id={`${matchAnchor(match._id)}-title`} className="text-lg font-semibold text-[#111111]">
                        <Link href={`/fixtures/${matchSlug(match)}`} className="hover:underline">
                            {home ? 'vs' : 'at'} {opponent}
                        </Link>
                    </h3>
                    <p className="text-sm text-[#555555]">{details}</p>
                </div>
                {mine && (
                    <span className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-semibold text-[#111111] ring-1 ring-[#EAEAEA]">
                        You: {availabilityLabel(mine.status)}
                    </span>
                )}
            </div>

            {!availability.ok ? (
                <p className="mt-3 text-sm text-[#555555]">
                    {availability.status === 404
                        ? 'Answers aren’t open for this match yet.'
                        : 'Your answer couldn’t load. Refresh in a minute.'}
                </p>
            ) : mine && mine.open ? (
                <form action={answerAvailability} className="mt-4 space-y-3">
                    <input type="hidden" name="fixtureId" value={match._id} />
                    {/* Enter in the note field would press the first button (Available): block implicit submit. */}
                    <button type="submit" disabled hidden aria-hidden tabIndex={-1} />
                    <fieldset>
                        <legend className="sr-only">Can you play {home ? 'vs' : 'at'} {opponent}?</legend>
                        <div className="flex flex-wrap gap-2">
                            {AVAILABILITY_CHOICES.map(choice => {
                                const on = mine.status === choice.status
                                const style = choiceStyles[choice.status]
                                return (
                                    <button
                                        key={choice.status}
                                        type="submit"
                                        name="status"
                                        value={choice.status}
                                        aria-pressed={on}
                                        className={cn(
                                            'min-w-24 rounded-md border px-4 py-2 font-claymore text-base transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]',
                                            on ? style.on : style.off,
                                        )}
                                    >
                                        {choice.label}
                                    </button>
                                )
                            })}
                        </div>
                    </fieldset>
                    <div>
                        <label htmlFor={`${matchAnchor(match._id)}-note`} className="text-sm text-[#555555]">
                            Note <span className="text-xs">(optional, e.g. “first half only”; saved with your button)</span>
                        </label>
                        <input
                            id={`${matchAnchor(match._id)}-note`}
                            name="note"
                            maxLength={MAX_AVAILABILITY_NOTE}
                            defaultValue={mine.note ?? ''}
                            autoComplete="off"
                            className={`${inputClass} mt-1 py-2 text-sm`}
                        />
                    </div>
                </form>
            ) : (
                <p className="mt-3 text-sm text-[#555555]">
                    Answers are closed for this match{mine?.note ? <> · Your note: “{mine.note}”</> : null}.
                </p>
            )}

            {mine && <p className="mt-3 text-sm text-[#555555]">Club: {countsLine(mine.counts)}</p>}

            {published && <LineupDetails lineup={published} subject={subject} />}
        </article>
    )
}

function LineupDetails({ lineup, subject }: { lineup: Lineup; subject: string }) {
    const me = lineup.slots.find(s => s.subject === subject)
    const starters = lineup.slots.filter(s => s.number <= STARTERS)
    const bench = lineup.slots.filter(s => s.number > STARTERS)
    return (
        <details className="group mt-4 rounded-md bg-[#fafafa] p-3" open={Boolean(me)}>
            <summary className="cursor-pointer text-sm font-semibold text-[#fd80b5] hover:underline">
                Lineup{me ? ` · you’re #${me.number}, ${me.position}` : ''}
                {lineup.publishedAt && <span className="font-normal text-[#555555]"> · published {formatDate(lineup.publishedAt)}</span>}
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <LineupList title="Starting XV" slots={starters} subject={subject} />
                <LineupList title="Replacements" slots={bench} subject={subject} />
            </div>
        </details>
    )
}

function LineupList({ title, slots, subject }: { title: string; slots: Lineup['slots']; subject: string }) {
    if (slots.length === 0) return null
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#555555]">{title}</p>
            <ol className="mt-1 text-sm">
                {slots.map(s => {
                    const you = s.subject === subject
                    return (
                        <li
                            key={s.number}
                            className={cn('flex gap-2 rounded px-2 py-1', you && 'bg-[#77c3ef]/15 font-semibold')}
                        >
                            <span className="w-6 shrink-0 text-right font-claymore text-[#111111]">{s.number}</span>
                            <span className="min-w-0 flex-1 text-[#111111]">
                                {memberName({ name: s.name, email: 'Club member' })}
                                {you && <span className="ml-1 rounded-full bg-[#77c3ef] px-2 py-0.5 text-xs text-white">You</span>}
                            </span>
                            <span className="hidden shrink-0 text-[#555555] sm:inline">{s.number <= STARTERS ? s.position : ''}</span>
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}
