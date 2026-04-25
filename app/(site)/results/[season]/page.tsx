import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { client } from '@/sanity/lib/client'
import { matchesQuery, teamsQuery, type SanityMatch, type SanityTeam } from '@/sanity/lib/queries'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import {
    breadcrumbSchema,
    formatMatchDateLong,
    isClaymores,
    matchSlug,
    seasonLabel,
} from '@/lib/seo'
import { ogImage } from '@/lib/og'

export const revalidate = 3600

interface Params {
    params: Promise<{ season: string }>
}

export async function generateStaticParams() {
    const matches: SanityMatch[] = await client.fetch(matchesQuery)
    const seasons = Array.from(new Set(matches.map((m) => m.season)))
    return seasons.map((s) => ({ season: String(s) }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { season } = await params
    const seasonNum = Number(season)
    if (!Number.isFinite(seasonNum)) return {}
    const label = seasonLabel(seasonNum)
    return {
        title: `${label} Season Results | Central Florida Claymores RFC | Orlando Rugby`,
        description: `Full ${label} season match results, standings, and fixtures for the Central Florida Claymores RFC — Orlando's USA Rugby D3 club competing in the Florida Rugby Union.`,
        alternates: { canonical: `/results/${season}` },
        openGraph: {
            title: `${label} Season Results | Central Florida Claymores RFC`,
            description: `Match-by-match results from the Claymores' ${label} season in the Florida Rugby Union.`,
            url: `/results/${season}`,
            images: ogImage(`/results/${season}`),
        },
    }
}

export default async function SeasonPage({ params }: Params) {
    const { season } = await params
    const seasonNum = Number(season)
    if (!Number.isFinite(seasonNum)) notFound()

    const [allMatches, teams]: [SanityMatch[], SanityTeam[]] = await Promise.all([
        client.fetch(matchesQuery),
        client.fetch(teamsQuery),
    ])
    const matches = allMatches
        .filter((m) => m.season === seasonNum)
        .sort((a, b) => a.date.localeCompare(b.date))

    if (matches.length === 0) notFound()

    let wins = 0,
        losses = 0,
        draws = 0,
        pf = 0,
        pa = 0,
        upcoming = 0
    matches.forEach((m) => {
        if (m.status === 'cancelled') return
        if (m.status === 'upcoming') {
            upcoming++
            return
        }
        const weHome = isClaymores(m.homeTeam)
        const ours = weHome ? m.homeScore : m.awayScore
        const theirs = weHome ? m.awayScore : m.homeScore
        if (m.status === 'forfeit_us') {
            losses++
            pa += 20
        } else if (m.status === 'forfeit_them') {
            wins++
            pf += 20
        } else {
            pf += ours
            pa += theirs
            if (ours > theirs) wins++
            else if (ours < theirs) losses++
            else draws++
        }
    })

    const played = wins + losses + draws
    const label = seasonLabel(seasonNum)

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    function findTeam(name: string): SanityTeam | null {
        const n = normalize(name)
        for (const t of teams) {
            const candidates = [t.name, ...(t.aliases ?? [])]
            if (candidates.some(a => n.includes(normalize(a)) || normalize(a).includes(n))) return t
        }
        return null
    }

    // Find prev/next seasons that exist
    const allSeasons = Array.from(new Set(allMatches.map((m) => m.season))).sort((a, b) => a - b)
    const idx = allSeasons.indexOf(seasonNum)
    const prevSeason = idx > 0 ? allSeasons[idx - 1] : null
    const nextSeason = idx >= 0 && idx < allSeasons.length - 1 ? allSeasons[idx + 1] : null

    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Results', path: '/results' },
                    { name: `${label} Season`, path: `/results/${season}` },
                ])}
            />

            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Results', path: '/results' },
                    { name: `${label} Season`, path: `/results/${season}` },
                ]}
            />

            <div className="text-center mb-10">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                    Central Florida Claymores RFC
                </p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">{label} Season</h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto mb-4" />
                <p className="text-[#555555] max-w-2xl mx-auto">
                    Match-by-match results for the Central Florida Claymores RFC in the {label} Florida Rugby Union season.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-[#EAEAEA] border border-[#EAEAEA] rounded-xl overflow-hidden mb-10">
                {[
                    { label: 'Wins', value: wins, accent: 'text-[#77c3ef]' },
                    { label: 'Losses', value: losses, accent: 'text-[#555555]' },
                    { label: 'Draws', value: draws, accent: 'text-[#fd80b5]' },
                    { label: 'Played', value: played, accent: 'text-[#111111]' },
                    { label: 'PF', value: pf, accent: 'text-[#111111]' },
                    { label: 'PA', value: pa, accent: 'text-[#111111]' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className="bg-white py-4 text-center">
                        <div className={`text-2xl font-bold font-claymore ${accent}`}>{value}</div>
                        <div className="text-xs uppercase tracking-widest text-[#555555] mt-1">{label}</div>
                    </div>
                ))}
            </div>

            {/* Match list */}
            <div className="border border-[#EAEAEA] rounded-xl overflow-hidden divide-y divide-[#EAEAEA]">
                {matches.map((m) => {
                    const weHome = isClaymores(m.homeTeam)
                    const opp = weHome ? m.awayTeam : m.homeTeam
                    const ours = weHome ? m.homeScore : m.awayScore
                    const theirs = weHome ? m.awayScore : m.homeScore
                    const result =
                        m.status === 'upcoming'
                            ? null
                            : m.status === 'cancelled'
                            ? 'X'
                            : m.status === 'forfeit_us'
                            ? 'L'
                            : m.status === 'forfeit_them'
                            ? 'W'
                            : ours > theirs
                            ? 'W'
                            : ours < theirs
                            ? 'L'
                            : 'D'
                    const resultColor =
                        result === 'W'
                            ? 'bg-[#77c3ef]/15 text-[#77c3ef] border-[#77c3ef]/30'
                            : result === 'L'
                            ? 'bg-[#111111]/5 text-[#555555] border-[#EAEAEA]'
                            : result === 'D'
                            ? 'bg-[#fd80b5]/15 text-[#fd80b5] border-[#fd80b5]/30'
                            : 'bg-[#EAEAEA]/50 text-[#555555] border-[#EAEAEA]'

                    const oppSlug = (weHome ? m.awayTeamSlug : m.homeTeamSlug) ?? findTeam(opp)?.slug
                    const oppLogo = (weHome ? m.awayTeamLogo : m.homeTeamLogo) ?? findTeam(opp)?.logoUrl

                    return (
                        <div key={m._id} className="relative flex items-center justify-between px-5 py-4 bg-white hover:bg-[#F9F9F9] transition-colors cursor-pointer">
                            {/* Full-row link to fixture page */}
                            <Link href={`/fixtures/${matchSlug(m)}`} className="absolute inset-0 cursor-pointer" aria-label={`View fixture details`} />

                            <div className="flex items-center gap-3 relative z-10">
                                {oppSlug ? (
                                    <Link href={`/opponents/${oppSlug}`} className="shrink-0 hover:opacity-75 transition-opacity">
                                        {oppLogo
                                            ? <img src={oppLogo} alt={opp} className="w-8 h-8 object-contain" />
                                            : <div className="w-8 h-8 rounded-full bg-[#EAEAEA]" />}
                                    </Link>
                                ) : oppLogo ? (
                                    <img src={oppLogo} alt={opp} className="w-8 h-8 object-contain shrink-0" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-[#EAEAEA] shrink-0" />
                                )}
                                <div>
                                    <p className="text-sm font-semibold text-[#111111]">
                                        Claymores {weHome ? 'vs' : '@'}{' '}
                                        {oppSlug
                                            ? <Link href={`/opponents/${oppSlug}`} className="text-[#77c3ef] hover:underline">{opp}</Link>
                                            : opp}
                                    </p>
                                    <p className="text-xs text-[#555555] mt-0.5">{formatMatchDateLong(m.date)}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 relative z-10 pointer-events-none">
                                {m.status === 'played' && (
                                    <span className="font-mono text-[#111111] font-semibold">
                                        {ours}–{theirs}
                                    </span>
                                )}
                                {m.status === 'upcoming' && (
                                    <span className="text-xs uppercase tracking-widest text-[#77c3ef]">Upcoming</span>
                                )}
                                {result && (
                                    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${resultColor}`}>
                                        {result}
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {upcoming > 0 && (
                <p className="text-xs text-[#555555] text-center mt-4">
                    {upcoming} upcoming {upcoming === 1 ? 'match' : 'matches'} in this season — see the{' '}
                    <Link href="/fixtures" className="text-[#fd80b5] hover:underline font-semibold">
                        fixtures page
                    </Link>{' '}
                    for full details.
                </p>
            )}

            {/* Season nav */}
            <div className="mt-12 flex justify-between items-center">
                {prevSeason ? (
                    <Link
                        href={`/results/${prevSeason}`}
                        className="text-sm text-[#77c3ef] hover:underline"
                    >
                        &larr; {seasonLabel(prevSeason)} Season
                    </Link>
                ) : (
                    <div />
                )}
                <Link href="/results" className="text-sm text-[#555555] hover:text-[#fd80b5]">
                    All Results
                </Link>
                {nextSeason ? (
                    <Link
                        href={`/results/${nextSeason}`}
                        className="text-sm text-[#77c3ef] hover:underline"
                    >
                        {seasonLabel(nextSeason)} Season &rarr;
                    </Link>
                ) : (
                    <div />
                )}
            </div>
        </div>
    )
}
