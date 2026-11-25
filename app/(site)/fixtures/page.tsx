import { getMatches, getTeams, getPractices } from '@/lib/claymores-api'
import type { Metadata } from 'next'
import { type SanityMatch, type SanityTeam, type SanityPractice } from '@/sanity/lib/queries'
import FixturesSchedule from '@/components/fixtures-schedule'
import { ogImage } from '@/lib/og'

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

export default async function Fixtures() {
    const [matches, teams, practices]: [SanityMatch[], SanityTeam[], SanityPractice[]] = await Promise.all([
        getMatches(),
        getTeams(),
        getPractices(),
    ])
    return (
        <div className="container mx-auto px-4 py-12 max-w-7xl">
            {/* Page header */}
            <div className="mb-10 text-center">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">Central Florida Claymores RFC</p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">Fixtures</h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto" />
                <a
                    href="webcal://www.claymoresrfc.com/calendar.ics"
                    className="mt-5 inline-flex items-center gap-2 rounded-md border border-[#77c3ef] px-5 py-2.5 font-claymore text-base text-[#77c3ef] transition-colors hover:bg-[#77c3ef] hover:text-white"
                >
                    Add all matches to your calendar
                </a>
                <p className="mt-2 text-xs text-[#555555]">
                    Kickoffs and venues update on their own. Google Calendar: add by URL{' '}
                    <span className="select-all font-mono">https://www.claymoresrfc.com/calendar.ics</span>
                </p>
            </div>

            <FixturesSchedule matches={matches} teams={teams} practices={practices} />
        </div>
    )
}
