import type { Metadata } from 'next'
import { client } from '@/sanity/lib/client'
import { playersQuery } from '@/sanity/lib/queries'
import type { SanityPlayer } from '@/sanity/lib/queries'
import TeamGrid from '@/components/team-grid'

export const revalidate = 0

export const metadata: Metadata = {
    title: 'Meet the Team | Central Florida Claymores',
    description: "Meet the players of the Central Florida Claymores RFC — Orlando's USA Rugby D3 club. Forwards, backs, and everyone in between. Join us Thursdays.",
    openGraph: {
        title: 'Meet the Team | Central Florida Claymores | Orlando, FL',
        description: "The players of Orlando's Central Florida Claymores RFC.",
        url: '/team',
    },
}

export default async function TeamPage() {
    const players: SanityPlayer[] = await client.fetch(playersQuery)

    return (
        <main className="container mx-auto py-8 px-4">
            <h1 className="text-5xl font-bold mb-2 font-claymore text-center">Meet the Team</h1>
            <p className="text-center text-muted-foreground mb-8">Central Florida Claymores RFC — Orlando, FL</p>
            {players.length === 0 ? (
                <p className="text-center text-muted-foreground">No players found. Add some in the Studio.</p>
            ) : (
                <TeamGrid players={players} />
            )}
        </main>
    )
}
