import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import { matchesQuery, teamsQuery, type SanityMatch, type SanityTeam } from '@/sanity/lib/queries'
import MatchCalendar from '@/components/match-calendar'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Fixtures & Schedule | Central Florida Claymores RFC',
    description: 'Full match schedule and results for the Central Florida Claymores RFC. Upcoming fixtures and past results for Orlando rugby.',
    alternates: { canonical: '/fixtures' },
    openGraph: {
        title: 'Fixtures & Schedule | Central Florida Claymores | Orlando, FL',
        description: 'Fixtures and results for the Central Florida Claymores RFC — Orlando rugby.',
        url: '/fixtures',
    },
}

function isClaymores(name: string) {
    return name.includes('Claymores') || name.includes('IR/Claymores')
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function findTeamLogo(name: string, teams: SanityTeam[]): string | null {
    const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const n = normalized(name)
    for (const team of teams) {
        const candidates = [team.name, ...(team.aliases ?? [])]
        if (candidates.some(alias => n.includes(normalized(alias)) || normalized(alias).includes(n))) {
            return team.logoUrl ?? null
        }
    }
    return null
}

export default async function Fixtures() {
    const [matches, teams]: [SanityMatch[], SanityTeam[]] = await Promise.all([
        client.fetch(matchesQuery),
        client.fetch(teamsQuery),
    ])
    const upcoming = matches.filter(m => m.status === 'upcoming').sort((a, b) => a.date.localeCompare(b.date))

    return (
        <div className="container mx-auto px-4 py-12 max-w-7xl">
            {/* Page header */}
            <div className="mb-10 text-center">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">Central Florida Claymores RFC</p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">Fixtures</h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto" />
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-10 items-start">

                {/* Left — custom calendar */}
                <div>
                    <h2 className="text-2xl font-claymore text-[#111111] mb-4">Match Calendar</h2>
                    <MatchCalendar matches={matches} teams={teams} />
                </div>

                {/* Right — Upcoming fixtures (hidden on mobile, calendar list covers it) */}
                <div className="hidden sm:block">
                    <h2 className="text-2xl font-claymore text-[#111111] mb-4">Upcoming Matches</h2>
                    {upcoming.length === 0 ? (
                        <div className="border border-[#EAEAEA] rounded-xl p-8 text-center text-[#555555]">
                            No upcoming matches scheduled.
                        </div>
                    ) : (
                        <div className="border border-[#EAEAEA] rounded-xl overflow-hidden divide-y divide-[#EAEAEA]">
                            {upcoming.map(m => {
                                const opponent = isClaymores(m.homeTeam) ? m.awayTeam : m.homeTeam
                                const isHome = isClaymores(m.homeTeam)
                                const logo = findTeamLogo(opponent, teams)
                                return (
                                    <div key={m._id} className="flex items-center justify-between px-5 py-4 bg-white hover:bg-[#F9F9F9] transition-colors">
                                        <div className="flex items-center gap-3">
                                            {logo
                                                ? <img src={logo} alt={opponent} className="w-8 h-8 object-contain shrink-0" />
                                                : <div className="w-8 h-8 rounded-full bg-[#EAEAEA] shrink-0" />}
                                            <div>
                                                <p className="text-sm font-semibold text-[#111111]">{opponent}</p>
                                                <p className="text-xs text-[#555555] mt-0.5">{isHome ? 'Home' : 'Away'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-[#77c3ef]">{formatDate(m.date)}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <p className="text-xs text-[#555555] mt-4 text-center">
                        Full season history on the{' '}
                        <Link href="/results" className="text-[#fd80b5] hover:underline font-semibold">Results page</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
