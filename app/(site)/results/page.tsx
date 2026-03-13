import type { Metadata } from 'next'
import { client } from '@/sanity/lib/client'
import { matchesQuery, type SanityMatch } from '@/sanity/lib/queries'
import MatchResultsTable from '@/components/match-results-table'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Match Results & History | Central Florida Claymores RFC',
    description: 'Full match history and results for the Central Florida Claymores RFC — Orlando rugby. Scores, standings, and season records.',
    openGraph: {
        title: 'Match Results | Central Florida Claymores RFC | Orlando Rugby',
        description: 'Season-by-season match results for the Central Florida Claymores RFC.',
        url: '/results',
    },
}

export default async function ResultsPage() {
    const matches: SanityMatch[] = await client.fetch(matchesQuery)

    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <div className="mb-10 text-center">
                <p className="text-xs uppercase tracking-widest text-[#E56A9A] font-semibold mb-2">Central Florida Claymores RFC</p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">Match Results</h1>
                <div className="w-12 h-px bg-[#E56A9A] mx-auto" />
            </div>
            <MatchResultsTable matches={matches} />
        </div>
    )
}
