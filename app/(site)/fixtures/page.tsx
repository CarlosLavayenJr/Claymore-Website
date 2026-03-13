import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import { matchesQuery, type SanityMatch } from '@/sanity/lib/queries'

export const revalidate = 3600

export const metadata: Metadata = {
    title: '2025 Fixtures & Schedule | Central Florida Claymores RFC',
    description: '2025 match schedule and upcoming fixtures for the Central Florida Claymores RFC. Follow Orlando rugby all season long.',
    openGraph: {
        title: '2025 Fixtures & Schedule | Central Florida Claymores | Orlando, FL',
        description: '2025 fixtures for the Central Florida Claymores RFC — Orlando rugby.',
        url: '/fixtures',
    },
}

function isClaymores(name: string) {
    return name.includes('Claymores') || name.includes('IR/Claymores')
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default async function Fixtures() {
    const matches: SanityMatch[] = await client.fetch(matchesQuery)
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">

                {/* Left — Google Calendar */}
                <div>
                    <h2 className="text-2xl font-claymore text-[#111111] mb-4">Match Calendar</h2>
                    <div className="rounded-xl overflow-hidden border border-[#EAEAEA]" style={{ aspectRatio: '4/3' }}>
                        <iframe
                            src="https://calendar.google.com/calendar/embed?src=claymoresrfc%40gmail.com&ctz=America%2FNew_York&showTitle=0&showNav=1&showPrint=0&showTabs=0&showCalendars=0"
                            className="w-full h-full border-0"
                            title="Central Florida Claymores RFC 2025 Match Schedule — Orlando Rugby"
                        />
                    </div>
                </div>

                {/* Right — Upcoming fixtures */}
                <div>
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
                                return (
                                    <div key={m._id} className="flex items-center justify-between px-5 py-4 bg-white hover:bg-[#F9F9F9] transition-colors">
                                        <div>
                                            <p className="text-sm font-semibold text-[#111111]">{opponent}</p>
                                            <p className="text-xs text-[#555555] mt-0.5">{isHome ? 'Home' : 'Away'}</p>
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
