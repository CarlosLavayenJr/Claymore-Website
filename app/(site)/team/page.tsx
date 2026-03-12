import { client } from "@/sanity/lib/client"
import { playersQuery } from "@/sanity/lib/queries"
import type { SanityPlayer } from "@/sanity/lib/queries"
import TeamGrid from "@/components/team-grid"

export const revalidate = 0

export default async function TeamPage() {
    const players: SanityPlayer[] = await client.fetch(playersQuery)

    return (
        <main className="container mx-auto py-8 px-4">
            <h1 className="text-5xl font-bold mb-8 font-claymore text-center">Meet The Team</h1>
            {players.length === 0 ? (
                <p className="text-center text-muted-foreground">No players found. Add some in the Studio.</p>
            ) : (
                <TeamGrid players={players} />
            )}
        </main>
    )
}
