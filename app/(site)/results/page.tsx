import type { Metadata } from 'next'
import { Suspense } from 'react'
import { client } from '@/sanity/lib/client'
import {
    matchesQuery,
    teamsQuery,
    seasonDivisionsQuery,
    type SanityMatch,
    type SanityTeam,
    type SanitySeasonDivision,
} from '@/sanity/lib/queries'
import MatchResultsTable from '@/components/match-results-table'
import { ogImage } from '@/lib/og'
import { buildDivisionsBySeason } from '@/lib/divisions'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Match Results & History | Central Florida Claymores RFC',
    description: 'Full match history and results for the Central Florida Claymores RFC — Orlando rugby. Scores, standings, and season records.',
    alternates: { canonical: '/results' },
    openGraph: {
        title: 'Match Results | Central Florida Claymores RFC | Orlando Rugby',
        description: 'Season-by-season match results for the Central Florida Claymores RFC.',
        url: '/results',
        images: ogImage(),
    },
}

export default async function ResultsPage() {
    const [matches, teams, seasonDivisions]: [SanityMatch[], SanityTeam[], SanitySeasonDivision[]] = await Promise.all([
        client.fetch(matchesQuery),
        client.fetch(teamsQuery),
        client.fetch(seasonDivisionsQuery),
    ])
    const divisionsBySeason = buildDivisionsBySeason(seasonDivisions)

    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <div className="mb-10 text-center">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">Central Florida Claymores RFC</p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">Match Results</h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto" />
            </div>
            <Suspense fallback={null}>
                <MatchResultsTable matches={matches} teams={teams} divisionsBySeason={divisionsBySeason} />
            </Suspense>
        </div>
    )
}
