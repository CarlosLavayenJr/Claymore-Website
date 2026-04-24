import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { client } from '@/sanity/lib/client'
import {
    matchesQuery,
    teamBySlugQuery,
    teamsQuery,
    type SanityMatch,
    type SanityTeam,
} from '@/sanity/lib/queries'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import {
    breadcrumbSchema,
    formatMatchDateLong,
    isClaymores,
    matchSlug,
    seasonLabel,
    sportsTeamSchema,
} from '@/lib/seo'

export const revalidate = 3600

interface Params {
    params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
    const teams: SanityTeam[] = await client.fetch(teamsQuery)
    return teams.filter((t) => t.slug && !isClaymores(t.name)).map((t) => ({ slug: t.slug as string }))
}

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function teamMatches(team: SanityTeam, match: SanityMatch): boolean {
    const candidates = [team.name, ...(team.aliases ?? [])].map(normalize)
    const home = normalize(match.homeTeam)
    const away = normalize(match.awayTeam)
    return candidates.some((c) => home.includes(c) || c.includes(home) || away.includes(c) || c.includes(away))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params
    const team: SanityTeam | null = await client.fetch(teamBySlugQuery, { slug })
    if (!team) return {}
    const title = `${team.name} vs Central Florida Claymores RFC | Florida Rugby Union`
    const description = `Head-to-head record, match history, and results between the Central Florida Claymores RFC (Orlando) and ${team.name}${
        team.city ? ` (${team.city})` : ''
    } in the Florida Rugby Union.`
    return {
        title,
        description,
        alternates: { canonical: `/opponents/${slug}` },
        openGraph: { title, description, url: `/opponents/${slug}` },
    }
}

export default async function OpponentPage({ params }: Params) {
    const { slug } = await params
    const [team, allMatches]: [SanityTeam | null, SanityMatch[]] = await Promise.all([
        client.fetch(teamBySlugQuery, { slug }),
        client.fetch(matchesQuery),
    ])
    if (!team) notFound()

    const matches = allMatches
        .filter((m) => teamMatches(team, m))
        .sort((a, b) => b.date.localeCompare(a.date))

    let wins = 0,
        losses = 0,
        draws = 0,
        pf = 0,
        pa = 0
    matches.forEach((m) => {
        if (m.status === 'cancelled' || m.status === 'upcoming') return
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
    const upcoming = matches.filter((m) => m.status === 'upcoming')

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <JsonLd data={sportsTeamSchema(team)} />
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Opponents', path: '/opponents' },
                    { name: team.name, path: `/opponents/${slug}` },
                ])}
            />

            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Opponents', path: '/opponents' },
                    { name: team.name, path: `/opponents/${slug}` },
                ]}
            />

            {/* Header */}
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 md:p-10 flex flex-col md:flex-row gap-6 items-center">
                {team.logoUrl && (
                    <img
                        src={team.logoUrl}
                        alt={team.logoAlt ?? `${team.name} logo`}
                        className="w-24 h-24 md:w-32 md:h-32 object-contain shrink-0"
                    />
                )}
                <div className="flex-1 text-center md:text-left">
                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                        Florida Rugby Union opponent
                    </p>
                    <h1 className="font-claymore text-3xl md:text-4xl text-[#111111] leading-tight">
                        {team.name} vs Central Florida Claymores RFC
                    </h1>
                    {team.city && <p className="text-[#555555] mt-2 text-sm">Based in {team.city}</p>}
                    {team.website && (
                        <a
                            href={team.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-3 text-sm text-[#77c3ef] hover:underline"
                        >
                            Official site &rarr;
                        </a>
                    )}
                </div>
            </div>

            {/* Head to head stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-[#EAEAEA] border border-[#EAEAEA] rounded-xl overflow-hidden mt-8">
                {[
                    { label: 'Wins', value: wins, accent: 'text-[#77c3ef]' },
                    { label: 'Losses', value: losses, accent: 'text-[#555555]' },
                    { label: 'Draws', value: draws, accent: 'text-[#fd80b5]' },
                    { label: 'PF', value: pf, accent: 'text-[#111111]' },
                    { label: 'PA', value: pa, accent: 'text-[#111111]' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className="bg-white py-4 text-center">
                        <div className={`text-2xl font-bold font-claymore ${accent}`}>{value}</div>
                        <div className="text-xs uppercase tracking-widest text-[#555555] mt-1">{label}</div>
                    </div>
                ))}
            </div>

            {team.description && (
                <section className="mt-10">
                    <h2 className="font-claymore text-2xl text-[#111111] mb-3">About {team.name}</h2>
                    <p className="text-[#555555] leading-relaxed whitespace-pre-line">{team.description}</p>
                </section>
            )}

            {/* All-time results */}
            <section className="mt-10">
                <h2 className="font-claymore text-2xl text-[#111111] mb-4">
                    All-Time Results vs {team.name} ({played} played)
                </h2>
                {matches.length === 0 ? (
                    <p className="text-[#555555] text-sm">No matches recorded yet.</p>
                ) : (
                    <div className="border border-[#EAEAEA] rounded-xl overflow-hidden divide-y divide-[#EAEAEA]">
                        {matches.map((m) => {
                            const weHome = isClaymores(m.homeTeam)
                            const ours = weHome ? m.homeScore : m.awayScore
                            const theirs = weHome ? m.awayScore : m.homeScore
                            const result =
                                m.status === 'upcoming'
                                    ? 'UP'
                                    : m.status === 'cancelled'
                                    ? '—'
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
                            return (
                                <Link
                                    key={m._id}
                                    href={`/fixtures/${matchSlug(m)}`}
                                    className="flex items-center justify-between px-5 py-4 bg-white hover:bg-[#F9F9F9] transition-colors"
                                >
                                    <div>
                                        <p className="text-sm text-[#111111] font-semibold">{formatMatchDateLong(m.date)}</p>
                                        <p className="text-xs text-[#555555] mt-0.5">
                                            {seasonLabel(m.season)} · {weHome ? 'Home' : 'Away'}
                                            {m.competition ? ` · ${m.competition}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {m.status === 'played' && (
                                            <span className="font-mono text-[#111111] font-semibold">
                                                {ours}–{theirs}
                                            </span>
                                        )}
                                        <span
                                            className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${resultColor}`}
                                        >
                                            {result}
                                        </span>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                )}
            </section>

            {upcoming.length > 0 && (
                <section className="mt-10">
                    <h2 className="font-claymore text-2xl text-[#111111] mb-4">Upcoming vs {team.name}</h2>
                    <div className="border border-[#EAEAEA] rounded-xl overflow-hidden divide-y divide-[#EAEAEA]">
                        {upcoming.map((m) => (
                            <Link
                                key={m._id}
                                href={`/fixtures/${matchSlug(m)}`}
                                className="block px-5 py-4 bg-white hover:bg-[#F9F9F9] transition-colors"
                            >
                                <p className="text-sm text-[#111111] font-semibold">{formatMatchDateLong(m.date)}</p>
                                <p className="text-xs text-[#555555] mt-0.5">
                                    {isClaymores(m.homeTeam) ? 'Home' : 'Away'}
                                    {m.competition ? ` · ${m.competition}` : ''}
                                </p>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <div className="mt-12 text-center bg-[#F9F9F9] rounded-xl p-8">
                <h2 className="text-2xl font-claymore text-[#111111] mb-3">Catch the Claymores in Orlando</h2>
                <p className="text-[#555555] mb-6">
                    The Central Florida Claymores RFC compete year-round in the Florida Rugby Union — see who&apos;s next on
                    the schedule.
                </p>
                <Link
                    href="/fixtures"
                    className="inline-block bg-[#77c3ef] text-white px-8 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity"
                >
                    See the Fixture List
                </Link>
            </div>
        </div>
    )
}
