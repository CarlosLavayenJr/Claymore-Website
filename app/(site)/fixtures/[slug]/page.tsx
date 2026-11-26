import { getMatches, getMatchForSlug, getTeams } from '@/lib/claymores-api'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PortableText } from 'next-sanity'
import { client } from '@/sanity/lib/client'
import { type SanityMatch, type SanityTeam } from '@/sanity/lib/queries'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import MatchTypeBadge from '@/components/match-type-badge'
import {
    autoMatchSummary,
    breadcrumbSchema,
    claymoresScore,
    clubEventName,
    formatMatchDateLong,
    isClaymores,
    isClubEvent,
    isHomeMatch,
    matchOutcome,
    matchSlug,
    opponentOf,
    seasonLabel,
    sportsEventSchema,
} from '@/lib/seo'
import FestivalDetails from '@/components/festival-details'
import { festivalsQuery, festivalSlug } from '@/lib/festivals'
import type { SanityPractice } from '@/sanity/lib/queries'
import { ogImage } from '@/lib/og'
import { memberAuthEnabled } from '@/lib/claymores/auth-env'

export const revalidate = 3600

interface Params {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ preview?: string }>
}

export async function generateStaticParams() {
    const matches: SanityMatch[] = await getMatches()
    const festivals: SanityPractice[] = await client.fetch(festivalsQuery)
    return [...matches.map((m) => ({ slug: matchSlug(m) })), ...festivals.map(event => ({ slug: festivalSlug(event) }))]
}

async function getFestival(slug: string): Promise<SanityPractice | null> {
    const festivals: SanityPractice[] = await client.fetch(festivalsQuery)
    return festivals.find(event => festivalSlug(event) === slug) ?? null
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params
    const match = await getMatchForSlug(slug)
    if (!match) {
        const event = await getFestival(slug)
        if (!event) return {}
        return {
            title: `${event.title} — ${formatMatchDateLong(event.startDate)} | Orlando Rugby`,
            description: `${event.title}: Central Florida Claymores event details. ${event.venue ?? ''}`,
            alternates: { canonical: `/fixtures/${slug}` },
            openGraph: { title: event.title, url: `/fixtures/${slug}`, images: ogImage(`/fixtures/${slug}`) },
        }
    }
    if (isClubEvent(match)) {
        const title = `${clubEventName(match)} — ${formatMatchDateLong(match.date)}`
        return {
            title: `${title} | Orlando Rugby`,
            description: autoMatchSummary(match).slice(0, 200),
            alternates: { canonical: `/fixtures/${slug}` },
            openGraph: { title, description: autoMatchSummary(match).slice(0, 200), url: `/fixtures/${slug}`, images: ogImage(`/fixtures/${slug}`) },
        }
    }
    const opp = opponentOf(match)
    const home = isHomeMatch(match)
    const date = formatMatchDateLong(match.date)
    const outcome = matchOutcome(match)
    const score = match.status === 'played' ? ` ${match.homeScore}–${match.awayScore}` : ''
    const titleVerb =
        outcome === 'win'
            ? 'Claymores Defeat'
            : outcome === 'loss'
            ? 'Claymores Fall to'
            : outcome === 'draw'
            ? 'Claymores Draw with'
            : 'Claymores vs'
    const baseTitle = match.status === 'played'
        ? `${titleVerb} ${opp}${score} — ${date}`
        : `Claymores vs ${opp} — ${date} (${home ? 'Home' : 'Away'})`
    return {
        title: `${baseTitle} | Orlando Rugby`,
        description: autoMatchSummary(match).slice(0, 200),
        alternates: { canonical: `/fixtures/${slug}` },
        openGraph: {
            title: baseTitle,
            description: autoMatchSummary(match).slice(0, 200),
            url: `/fixtures/${slug}`,
            type: 'article',
            images: ogImage(`/fixtures/${slug}`),
        },
    }
}

const STATUS_LABEL: Record<SanityMatch['status'], string> = {
    played: 'Final',
    upcoming: 'Upcoming',
    cancelled: 'Cancelled',
    forfeit_us: 'Forfeit (Claymores)',
    forfeit_them: 'Forfeit (Opponent)',
}

function clean(name: string): string {
    return isClaymores(name) ? 'Central Florida Claymores' : name
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
function findTeam(name: string, teams: SanityTeam[]): SanityTeam | null {
    const n = normalize(name)
    for (const t of teams) {
        const candidates = [t.name, ...(t.aliases ?? [])]
        if (candidates.some(a => n.includes(normalize(a)) || normalize(a).includes(n))) return t
    }
    return null
}

export default async function MatchPage({ params, searchParams }: Params) {
    const { slug } = await params
    const [match, teams]: [SanityMatch | null, SanityTeam[]] = await Promise.all([
        getMatchForSlug(slug),
        getTeams(),
    ])
    if (!match) {
        const event = await getFestival(slug)
        if (!event) notFound()
        const query = await searchParams
        const preview = event.eventType === 'festival' && process.env.NODE_ENV === 'development' && query.preview === 'results'
        const previewEvent = preview ? { ...event, results: [
            { _key: 'sample-1', label: 'Round robin · Game 1', homeTeam: 'Claymores', awayTeam: 'Sarasota', homeScore: 24, awayScore: 12 },
            { _key: 'sample-2', label: 'Round robin · Game 2', homeTeam: 'Claymores', awayTeam: 'Lakeland', homeScore: 17, awayScore: 17 },
            { _key: 'sample-3', label: 'Placement game', homeTeam: 'Claymores', awayTeam: 'Tampa', homeScore: 21, awayScore: 14 },
        ] } : event
        return <FestivalDetails event={previewEvent} teams={teams} preview={preview} />
    }

    if (isClubEvent(match)) return <ClubEventPage match={match} slug={slug} teams={teams} />

    const opp = opponentOf(match)
    const oppSlug = (isHomeMatch(match) ? match.awayTeamSlug : match.homeTeamSlug)
        ?? findTeam(opp, teams)?.slug
    const homeTeamDoc = findTeam(match.homeTeam, teams)
    const awayTeamDoc = findTeam(match.awayTeam, teams)
    const homeTeamLogo = match.homeTeamLogo ?? homeTeamDoc?.logoUrl
    const awayTeamLogo = match.awayTeamLogo ?? awayTeamDoc?.logoUrl
    const homeTeamName = homeTeamDoc?.name ?? match.homeTeam
    const awayTeamName = awayTeamDoc?.name ?? match.awayTeam
    const homeTeamHref = isClaymores(match.homeTeam) ? '/team' : (match.homeTeamSlug ?? homeTeamDoc?.slug) ? `/opponents/${match.homeTeamSlug ?? homeTeamDoc?.slug}` : null
    const awayTeamHref = isClaymores(match.awayTeam) ? '/team' : (match.awayTeamSlug ?? awayTeamDoc?.slug) ? `/opponents/${match.awayTeamSlug ?? awayTeamDoc?.slug}` : null
    const home = isHomeMatch(match)
    const dateLong = formatMatchDateLong(match.date)
    const { ours, theirs } = claymoresScore(match)
    const outcome = matchOutcome(match)
    const summary = autoMatchSummary(match)
    const hasEditorRecap = Array.isArray(match.recap) && match.recap.length > 0

    const outcomeChip = (() => {
        switch (outcome) {
            case 'win':
                return { label: 'WIN', bg: '#77c3ef', fg: '#0b1c25' }
            case 'loss':
                return { label: 'LOSS', bg: '#111111', fg: '#ffffff' }
            case 'draw':
                return { label: 'DRAW', bg: '#fd80b5', fg: '#3a0a23' }
            case 'pending':
                return { label: home ? 'HOME' : 'AWAY', bg: '#EAEAEA', fg: '#111111' }
            case 'cancelled':
                return { label: 'CANCELLED', bg: '#EAEAEA', fg: '#111111' }
        }
    })()

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <JsonLd data={sportsEventSchema(match)} />
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Fixtures', path: '/fixtures' },
                    { name: `${clean(match.homeTeam)} vs ${clean(match.awayTeam)}`, path: `/fixtures/${slug}` },
                ])}
            />

            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Fixtures', path: '/fixtures' },
                    { name: isClubEvent(match) ? clubEventName(match) : `vs ${opp}`, path: `/fixtures/${slug}` },
                ]}
            />

            {/* Header card */}
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 md:p-10">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold">
                            {match.competition ?? 'Florida Rugby Union'} · {seasonLabel(match.season)}
                        </p>
                        <MatchTypeBadge matchType={match.matchType} size="compact" />
                    </div>
                    <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider shrink-0"
                        style={{ backgroundColor: outcomeChip.bg, color: outcomeChip.fg }}
                    >
                        {outcomeChip.label}
                    </span>
                </div>

                {/* Score line / matchup */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 my-6">
                    <div className="text-center">
                        {homeTeamHref ? (
                            <Link href={homeTeamHref} className="group block hover:opacity-80 transition-opacity">
                                {homeTeamLogo ? (
                                    <img src={homeTeamLogo} alt={`${homeTeamName} logo`} className="w-16 h-16 md:w-24 md:h-24 mx-auto object-contain" />
                                ) : (
                                    <div className="w-16 h-16 md:w-24 md:h-24 mx-auto rounded-full bg-[#EAEAEA]" />
                                )}
                                <p className="mt-3 text-base md:text-lg font-bold text-[#77c3ef] group-hover:underline">{clean(homeTeamName)}</p>
                            </Link>
                        ) : (
                            <>
                                {homeTeamLogo ? (
                                    <img src={homeTeamLogo} alt={`${homeTeamName} logo`} className="w-16 h-16 md:w-24 md:h-24 mx-auto object-contain" />
                                ) : (
                                    <div className="w-16 h-16 md:w-24 md:h-24 mx-auto rounded-full bg-[#EAEAEA]" />
                                )}
                                <p className="mt-3 text-base md:text-lg font-bold text-[#111111]">{clean(homeTeamName)}</p>
                            </>
                        )}
                        <p className="text-xs uppercase tracking-wider text-[#555555]">Home</p>
                    </div>

                    <div className="text-center">
                        {match.status === 'played' ? (
                            <p className="font-claymore text-5xl md:text-7xl text-[#111111] leading-none">
                                {match.homeScore}
                                <span className="mx-2 text-[#EAEAEA]">–</span>
                                {match.awayScore}
                            </p>
                        ) : (
                            <p className="font-claymore text-3xl md:text-5xl text-[#111111] leading-none">vs</p>
                        )}
                        <p className="mt-3 text-xs uppercase tracking-wider text-[#555555]">{STATUS_LABEL[match.status]}</p>
                    </div>

                    <div className="text-center">
                        {awayTeamHref ? (
                            <Link href={awayTeamHref} className="group block hover:opacity-80 transition-opacity">
                                {awayTeamLogo ? (
                                    <img src={awayTeamLogo} alt={`${awayTeamName} logo`} className="w-16 h-16 md:w-24 md:h-24 mx-auto object-contain" />
                                ) : (
                                    <div className="w-16 h-16 md:w-24 md:h-24 mx-auto rounded-full bg-[#EAEAEA]" />
                                )}
                                <p className="mt-3 text-base md:text-lg font-bold text-[#77c3ef] group-hover:underline">{clean(awayTeamName)}</p>
                            </Link>
                        ) : (
                            <>
                                {awayTeamLogo ? (
                                    <img src={awayTeamLogo} alt={`${awayTeamName} logo`} className="w-16 h-16 md:w-24 md:h-24 mx-auto object-contain" />
                                ) : (
                                    <div className="w-16 h-16 md:w-24 md:h-24 mx-auto rounded-full bg-[#EAEAEA]" />
                                )}
                                <p className="mt-3 text-base md:text-lg font-bold text-[#111111]">{clean(awayTeamName)}</p>
                            </>
                        )}
                        <p className="text-xs uppercase tracking-wider text-[#555555]">Away</p>
                    </div>
                </div>

                <div className="border-t border-[#EAEAEA] pt-6 grid sm:grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[#555555] font-semibold">Date</p>
                        <p className="text-[#111111] mt-1">{dateLong}</p>
                    </div>
                    {match.kickoffTime && (
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[#555555] font-semibold">Kickoff</p>
                            <p className="text-[#111111] mt-1">{match.kickoffTime}</p>
                        </div>
                    )}
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[#555555] font-semibold">Venue</p>
                        <p className="text-[#111111] mt-1">
                            {match.venue ?? (home ? 'Barnett Park, Orlando, FL' : `${opp} home ground`)}
                        </p>
                    </div>
                </div>
            </div>

            {/* H1 + summary */}
            <h1 className="font-claymore text-3xl md:text-4xl text-[#111111] mt-12 mb-3">
                {outcome === 'win' && `Claymores Defeat ${opp} ${ours}–${theirs}`}
                {outcome === 'loss' && `Claymores Fall to ${opp} ${theirs}–${ours}`}
                {outcome === 'draw' && `Claymores Draw with ${opp} ${ours}–${theirs}`}
                {outcome === 'pending' && `Claymores ${home ? 'Host' : 'Travel to'} ${opp} on ${dateLong.split(',').slice(1).join(',').trim()}`}
                {outcome === 'cancelled' && `Claymores vs ${opp} — Cancelled`}
            </h1>
            <div className="w-12 h-px bg-[#fd80b5] mb-6" />

            {hasEditorRecap ? (
                <div className="prose prose-lg max-w-none text-[#333333] [&_h2]:font-claymore [&_h2]:text-[#111111] [&_p]:mb-5 [&_a]:text-[#77c3ef]">
                    <PortableText value={match.recap as Parameters<typeof PortableText>[0]['value']} />
                </div>
            ) : (
                <p className="text-lg text-[#555555] leading-relaxed">{summary}</p>
            )}

            {match.note && (
                <p className="mt-6 text-sm text-[#555555] italic">Match note: {match.note}</p>
            )}

            {/* Members say whether they can play on /account; names and lineups stay private. */}
            {outcome === 'pending' && memberAuthEnabled() && (
                <p className="mt-6 text-sm text-[#555555]">
                    Claymores players:{' '}
                    <Link href="/account#matches" rel="nofollow" className="text-[#fd80b5] underline-offset-4 hover:underline">
                        sign in to say if you can play
                    </Link>
                </p>
            )}

            {/* Cross-links */}
            <div className="mt-12 pt-8 border-t border-[#EAEAEA] grid sm:grid-cols-2 gap-4 text-sm">
                {oppSlug && (
                    <Link
                        href={`/opponents/${oppSlug}`}
                        className="block p-5 border border-[#EAEAEA] rounded-xl hover:border-[#77c3ef] transition-colors"
                    >
                        <p className="text-xs uppercase tracking-wider text-[#fd80b5] font-semibold mb-1">Head to head</p>
                        <p className="text-[#111111] font-bold">Claymores vs {opp}</p>
                        <p className="text-[#555555] text-xs mt-1">All-time record &rarr;</p>
                    </Link>
                )}
                <Link
                    href={`/standings/${match.season}`}
                    className="block p-5 border border-[#EAEAEA] rounded-xl hover:border-[#77c3ef] transition-colors"
                >
                    <p className="text-xs uppercase tracking-wider text-[#fd80b5] font-semibold mb-1">Season</p>
                    <p className="text-[#111111] font-bold">{seasonLabel(match.season)} season</p>
                    <p className="text-[#555555] text-xs mt-1">Full results &rarr;</p>
                </Link>
            </div>

            {/* CTA */}
            <div className="mt-12 text-center bg-[#F9F9F9] rounded-xl p-8">
                <h2 className="text-2xl font-claymore text-[#111111] mb-3">Watch the Claymores Play</h2>
                <p className="text-[#555555] mb-6">
                    Home matches in Orlando are free to attend. Find the next fixture and come down.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/fixtures"
                        className="inline-block bg-[#77c3ef] text-white px-8 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity"
                    >
                        Full Fixture List
                    </Link>
                    <Link
                        href="/contact"
                        className="inline-block border border-[#77c3ef] text-[#77c3ef] px-8 py-3 rounded-md font-semibold hover:bg-[#77c3ef]/10 transition-colors"
                    >
                        Join the Claymores
                    </Link>
                </div>
            </div>
        </div>
    )
}

/**
 * rugbyfl.com lists the club's own events (the Highland Games) as Claymores vs
 * Claymores. Show them as a club event: one crest, the event name, no opponent.
 */
function ClubEventPage({ match, slug, teams }: { match: SanityMatch; slug: string; teams: SanityTeam[] }) {
    const name = clubEventName(match)
    const logo = match.homeTeamLogo ?? findTeam(match.homeTeam, teams)?.logoUrl
    const dateLong = formatMatchDateLong(match.date)
    const hasEditorRecap = Array.isArray(match.recap) && match.recap.length > 0
    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <JsonLd data={sportsEventSchema(match)} />
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Fixtures', path: '/fixtures' },
                    { name, path: `/fixtures/${slug}` },
                ])}
            />
            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Fixtures', path: '/fixtures' },
                    { name, path: `/fixtures/${slug}` },
                ]}
            />
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 md:p-10">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold">
                        Club event · {seasonLabel(match.season)}
                    </p>
                    {match.status === 'cancelled' && (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider bg-[#EAEAEA] text-[#111111]">
                            CANCELLED
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-5">
                    {logo ? (
                        <img src={logo} alt="Central Florida Claymores logo" className="w-16 h-16 md:w-24 md:h-24 object-contain shrink-0" />
                    ) : (
                        <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-[#EAEAEA] shrink-0" />
                    )}
                    <h1 className="font-claymore text-3xl md:text-5xl text-[#111111] leading-tight">{name}</h1>
                </div>
                <div className="border-t border-[#EAEAEA] mt-8 pt-6 grid sm:grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[#555555] font-semibold">Date</p>
                        <p className="text-[#111111] mt-1">{dateLong}</p>
                    </div>
                    {match.kickoffTime && (
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[#555555] font-semibold">Start</p>
                            <p className="text-[#111111] mt-1">{match.kickoffTime}</p>
                        </div>
                    )}
                    {match.venue && (
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[#555555] font-semibold">Venue</p>
                            <p className="text-[#111111] mt-1">{match.venue}</p>
                        </div>
                    )}
                </div>
            </div>
            <div className="w-12 h-px bg-[#fd80b5] mt-12 mb-6" />
            {hasEditorRecap ? (
                <div className="prose prose-lg max-w-none text-[#333333] [&_h2]:font-claymore [&_h2]:text-[#111111] [&_p]:mb-5 [&_a]:text-[#77c3ef]">
                    <PortableText value={match.recap as Parameters<typeof PortableText>[0]['value']} />
                </div>
            ) : (
                <p className="text-lg text-[#555555] leading-relaxed">{autoMatchSummary(match)}</p>
            )}
            {match.note && <p className="mt-6 text-sm text-[#555555] italic">Note: {match.note}</p>}
            <div className="mt-12 text-center bg-[#F9F9F9] rounded-xl p-8">
                <h2 className="text-2xl font-claymore text-[#111111] mb-3">More Claymores Fixtures</h2>
                <p className="text-[#555555] mb-6">Home matches in Orlando are free to attend.</p>
                <Link
                    href="/fixtures"
                    className="inline-block bg-[#77c3ef] text-white font-claymore px-8 py-3 rounded-md hover:bg-[#a0d5f5] transition-colors"
                >
                    Full Fixture List
                </Link>
            </div>
        </div>
    )
}
