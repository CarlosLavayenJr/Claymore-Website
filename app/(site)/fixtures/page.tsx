import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import {
    matchesQuery,
    teamsQuery,
    practicesQuery,
    type SanityMatch,
    type SanityTeam,
    type SanityPractice,
} from '@/sanity/lib/queries'
import MatchCalendar from '@/components/match-calendar'
import MatchTypeBadge from '@/components/match-type-badge'
import { matchSlug } from '@/lib/seo'
import { ogImage } from '@/lib/og'
import { upcomingPracticeInstances, type PracticeInstance } from '@/lib/practices'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Fixtures & Schedule | Central Florida Claymores RFC',
    description: 'Full match schedule and results for the Central Florida Claymores RFC. Upcoming fixtures and past results for Orlando rugby.',
    alternates: { canonical: '/fixtures' },
    openGraph: {
        title: 'Fixtures & Schedule | Central Florida Claymores | Orlando, FL',
        description: 'Fixtures and results for the Central Florida Claymores RFC — Orlando rugby.',
        url: '/fixtures',
        images: ogImage(),
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

type UpcomingItem =
    | { kind: 'match'; date: string; match: SanityMatch }
    | { kind: 'practice'; date: string; instance: PracticeInstance }

const MAX_UPCOMING = 10

export default async function Fixtures() {
    const [matches, teams, practices]: [SanityMatch[], SanityTeam[], SanityPractice[]] = await Promise.all([
        client.fetch(matchesQuery),
        client.fetch(teamsQuery),
        client.fetch(practicesQuery),
    ])
    const upcomingMatches = matches.filter(m => m.status === 'upcoming').sort((a, b) => a.date.localeCompare(b.date))
    const upcomingPractices = upcomingPracticeInstances(practices, MAX_UPCOMING, 60)

    const upcomingItems: UpcomingItem[] = [
        ...upcomingMatches.map<UpcomingItem>(m => ({ kind: 'match', date: m.date, match: m })),
        ...upcomingPractices.map<UpcomingItem>(p => ({ kind: 'practice', date: p.date, instance: p })),
    ]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, MAX_UPCOMING)

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
                    <h2 className="text-2xl font-claymore text-[#111111] mb-4">Claymore Calendar</h2>
                    <MatchCalendar matches={matches} teams={teams} practices={practices} />
                </div>

                {/* Right — Upcoming matches & events (hidden on mobile, calendar list covers it) */}
                <div className="hidden sm:block">
                    <h2 className="text-2xl font-claymore text-[#111111] mb-4">Matches & Events</h2>
                    {upcomingItems.length === 0 ? (
                        <div className="border border-[#EAEAEA] rounded-xl p-8 text-center text-[#555555]">
                            No upcoming matches or events scheduled.
                        </div>
                    ) : (
                        <div className="border border-[#EAEAEA] rounded-xl overflow-hidden divide-y divide-[#EAEAEA]">
                            {upcomingItems.map(item => {
                                if (item.kind === 'match') {
                                    const m = item.match
                                    const opponent = isClaymores(m.homeTeam) ? m.awayTeam : m.homeTeam
                                    const isHome = isClaymores(m.homeTeam)
                                    const logo = findTeamLogo(opponent, teams)
                                    return (
                                        <Link
                                            key={`m-${m._id}`}
                                            href={`/fixtures/${matchSlug(m)}`}
                                            className="flex items-center justify-between px-5 py-4 bg-white hover:bg-[#F9F9F9] transition-colors"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {logo
                                                    ? <img src={logo} alt={`${opponent} logo`} className="w-8 h-8 object-contain shrink-0" />
                                                    : <div className="w-8 h-8 rounded-full bg-[#EAEAEA] shrink-0" />}
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-[#111111] flex items-center gap-2 flex-wrap">
                                                        <span className="truncate">{opponent}</span>
                                                        <MatchTypeBadge matchType={m.matchType} size="compact" />
                                                    </p>
                                                    <p className="text-xs text-[#555555] mt-0.5">{isHome ? 'Home' : 'Away'}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-medium text-[#77c3ef]">{formatDate(m.date)}</p>
                                            </div>
                                        </Link>
                                    )
                                }
                                const p = item.instance.practice
                                return (
                                    <div
                                        key={item.instance.key}
                                        className="flex items-center justify-between px-5 py-4 bg-white"
                                    >
                                        <div className="flex items-center gap-3">
                                            {p.iconUrl
                                                ? <img src={p.iconUrl} alt={p.iconAlt ?? p.title} className="w-8 h-8 object-contain shrink-0" />
                                                : <div className="w-8 h-8 rounded-full bg-[#EAEAEA] shrink-0" />}
                                            <div>
                                                <p className="text-sm font-semibold text-[#111111]">{p.title}</p>
                                                <p className="text-xs text-[#fd80b5] uppercase tracking-widest font-semibold mt-0.5">
                                                    Practice{p.time ? ` · ${p.time}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-[#77c3ef]">{formatDate(item.date)}</p>
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
