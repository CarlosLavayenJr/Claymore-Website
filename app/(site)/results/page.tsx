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
            <h1 className="text-5xl font-claymore text-center mb-4">Match Results</h1>
            <p className="text-center text-muted-foreground mb-12 text-lg">
                Central Florida Claymores RFC — full season history
            </p>
            <MatchResultsTable matches={matches} />
        </div>
    )
}
