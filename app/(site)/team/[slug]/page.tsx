import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { client } from "@/sanity/lib/client"
import { playerBySlugQuery, playerPhotosQuery, playersQuery } from "@/sanity/lib/queries"
import type { SanityPlayer, SanityPlayerPhoto } from "@/sanity/lib/queries"

import PlayerProfile from "./player-profile"

export const revalidate = 0

interface Props {
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const player: SanityPlayer | null = await client.fetch(playerBySlugQuery, { slug })
    if (!player) return {}
    return {
        title: `${player.name} | Central Florida Claymores`,
        description: player.description || `${player.name} — ${player.position} for the Central Florida Claymores RFC.`,
        openGraph: {
            title: `${player.name} | Central Florida Claymores`,
            images: player.imageUrl ? [player.imageUrl] : [],
        },
    }
}

export default async function PlayerPage({ params }: Props) {
    const { slug } = await params

    const [player, allPlayers]: [SanityPlayer | null, SanityPlayer[]] = await Promise.all([
        client.fetch(playerBySlugQuery, { slug }),
        client.fetch(playersQuery),
    ])

    if (!player) notFound()

    const photos: SanityPlayerPhoto[] = player.mediaTag
        ? await client.fetch(playerPhotosQuery, { tag: player.mediaTag } as Record<string, string>)
        : []

    const currentIndex = allPlayers.findIndex((p) => p.slug === slug)
    const nextPlayer = allPlayers[(currentIndex + 1) % allPlayers.length] ?? null

    return <PlayerProfile player={player} photos={photos} nextPlayer={nextPlayer} />
}
