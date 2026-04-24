import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import { matchesQuery, teamsQuery, type SanityMatch, type SanityTeam } from '@/sanity/lib/queries'
import Breadcrumbs from '@/components/breadcrumbs'
import { isClaymores } from '@/lib/seo'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Florida Rugby Union Opponents | Central Florida Claymores RFC',
    description:
        "Every team the Central Florida Claymores RFC have played in the Florida Rugby Union. Head-to-head records, match histories, and opponent profiles for Orlando rugby's D3 club.",
    alternates: { canonical: '/opponents' },
    openGraph: {
        title: 'Florida Rugby Union Opponents | Central Florida Claymores RFC',
        description: 'Every Florida Rugby Union opponent the Claymores have played, with head-to-head records.',
        url: '/opponents',
    },
}

interface OppRow {
    name: string
    slug: string | null
    logo: string | null
    played: number
    wins: number
    losses: number
    draws: number
}

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findTeam(name: string, teams: SanityTeam[]): SanityTeam | undefined {
    const n = normalize(name)
    return teams.find((t) => {
        const candidates = [t.name, ...(t.aliases ?? [])]
        return candidates.some((c) => {
            const cn = normalize(c)
            return cn.includes(n) || n.includes(cn)
        })
    })
}

export default async function OpponentsIndexPage() {
    const [matches, teams]: [SanityMatch[], SanityTeam[]] = await Promise.all([
        client.fetch(matchesQuery),
        client.fetch(teamsQuery),
    ])

    const byOpp = new Map<string, OppRow>()
    matches.forEach((m) => {
        if (m.status === 'cancelled' || m.status === 'upcoming') return
        const oppName = isClaymores(m.homeTeam) ? m.awayTeam : m.homeTeam
        const team = findTeam(oppName, teams)
        const key = team?.name ?? oppName
        const row =
            byOpp.get(key) ??
            ({
                name: key,
                slug: team?.slug ?? null,
                logo: team?.logoUrl ?? null,
                played: 0,
                wins: 0,
                losses: 0,
                draws: 0,
            } as OppRow)
        row.played++
        const weHome = isClaymores(m.homeTeam)
        const ours = weHome ? m.homeScore : m.awayScore
        const theirs = weHome ? m.awayScore : m.homeScore
        if (m.status === 'forfeit_us') row.losses++
        else if (m.status === 'forfeit_them') row.wins++
        else if (ours > theirs) row.wins++
        else if (ours < theirs) row.losses++
        else row.draws++
        byOpp.set(key, row)
    })

    const opponents = Array.from(byOpp.values()).sort((a, b) => b.played - a.played || a.name.localeCompare(b.name))

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Opponents', path: '/opponents' },
                ]}
            />

            <div className="text-center mb-10">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">Florida Rugby Union</p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">Our Opponents</h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto mb-4" />
                <p className="text-[#555555] max-w-2xl mx-auto">
                    Every team the Central Florida Claymores RFC have shared a pitch with. Head-to-head records, all-time
                    results, and rugby across the Florida Rugby Union.
                </p>
            </div>

            {opponents.length === 0 ? (
                <p className="text-center text-[#555555]">No matches recorded yet.</p>
            ) : (
                <div className="border border-[#EAEAEA] rounded-xl overflow-hidden divide-y divide-[#EAEAEA]">
                    {opponents.map((opp) => {
                        const Tag = opp.slug ? Link : 'div'
                        const props = opp.slug ? { href: `/opponents/${opp.slug}` } : {}
                        return (
                            // @ts-expect-error – polymorphic between Link and div
                            <Tag
                                key={opp.name}
                                {...props}
                                className={`flex items-center justify-between px-5 py-4 bg-white ${
                                    opp.slug ? 'hover:bg-[#F9F9F9] transition-colors' : ''
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    {opp.logo ? (
                                        <img src={opp.logo} alt={`${opp.name} logo`} className="w-10 h-10 object-contain shrink-0" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-[#EAEAEA] shrink-0" />
                                    )}
                                    <div>
                                        <p className="font-bold text-[#111111]">{opp.name}</p>
                                        <p className="text-xs text-[#555555]">{opp.played} matches</p>
                                    </div>
                                </div>
                                <div className="text-right text-sm font-mono text-[#111111]">
                                    <span className="text-[#77c3ef] font-bold">{opp.wins}W</span>
                                    {' · '}
                                    <span className="text-[#555555]">{opp.losses}L</span>
                                    {opp.draws > 0 && (
                                        <>
                                            {' · '}
                                            <span className="text-[#fd80b5]">{opp.draws}D</span>
                                        </>
                                    )}
                                </div>
                            </Tag>
                        )
                    })}
                </div>
            )}

            <p className="text-xs text-[#555555] text-center mt-6">
                Opponent profiles are added when a Team is created in Sanity Studio with a slug. Without a slug the
                opponent appears here read-only.
            </p>
        </div>
    )
}
