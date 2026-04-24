import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PortableText } from 'next-sanity'
import { client } from '@/sanity/lib/client'
import { matchesQuery, type SanityMatch } from '@/sanity/lib/queries'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import {
    autoMatchSummary,
    breadcrumbSchema,
    claymoresScore,
    formatMatchDateLong,
    isClaymores,
    isHomeMatch,
    matchOutcome,
    matchSlug,
    opponentOf,
    seasonLabel,
    sportsEventSchema,
} from '@/lib/seo'
import { ogImage } from '@/lib/og'

export const revalidate = 3600

interface Params {
    params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
    const matches: SanityMatch[] = await client.fetch(matchesQuery)
    return matches.map((m) => ({ slug: matchSlug(m) }))
}

async function getMatch(slug: string): Promise<SanityMatch | null> {
    const matches: SanityMatch[] = await client.fetch(matchesQuery)
    return matches.find((m) => matchSlug(m) === slug) ?? null
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params
    const match = await getMatch(slug)
    if (!match) return {}
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

export default async function MatchPage({ params }: Params) {
    const { slug } = await params
    const match = await getMatch(slug)
    if (!match) notFound()

    const opp = opponentOf(match)
    const oppSlug = isHomeMatch(match) ? match.awayTeamSlug : match.homeTeamSlug
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
                    { name: `vs ${opp}`, path: `/fixtures/${slug}` },
                ]}
            />

            {/* Header card */}
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 md:p-10">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold">
                        {match.competition ?? 'Florida Rugby Union'} · {seasonLabel(match.season)}
                    </p>
                    <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider"
                        style={{ backgroundColor: outcomeChip.bg, color: outcomeChip.fg }}
                    >
                        {outcomeChip.label}
                    </span>
                </div>

                {/* Score line / matchup */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 my-6">
                    <div className="text-center">
                        {match.homeTeamLogo ? (
                            <img
                                src={match.homeTeamLogo}
                                alt={`${match.homeTeam} logo`}
                                className="w-16 h-16 md:w-24 md:h-24 mx-auto object-contain"
                            />
                        ) : (
                            <div className="w-16 h-16 md:w-24 md:h-24 mx-auto rounded-full bg-[#EAEAEA]" />
                        )}
                        <p className="mt-3 text-base md:text-lg font-bold text-[#111111]">{clean(match.homeTeam)}</p>
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
                        {match.awayTeamLogo ? (
                            <img
                                src={match.awayTeamLogo}
                                alt={`${match.awayTeam} logo`}
                                className="w-16 h-16 md:w-24 md:h-24 mx-auto object-contain"
                            />
                        ) : (
                            <div className="w-16 h-16 md:w-24 md:h-24 mx-auto rounded-full bg-[#EAEAEA]" />
                        )}
                        <p className="mt-3 text-base md:text-lg font-bold text-[#111111]">{clean(match.awayTeam)}</p>
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
                    href={`/results/${match.season}`}
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
                        href="/join"
                        className="inline-block border border-[#77c3ef] text-[#77c3ef] px-8 py-3 rounded-md font-semibold hover:bg-[#77c3ef]/10 transition-colors"
                    >
                        Join the Claymores
                    </Link>
                </div>
            </div>
        </div>
    )
}
