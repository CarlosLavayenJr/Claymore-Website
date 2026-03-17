import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { client } from "@/sanity/lib/client"
import { playerBySlugQuery, playerPhotosQuery } from "@/sanity/lib/queries"
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
    const player: SanityPlayer | null = await client.fetch(playerBySlugQuery, { slug })
    if (!player) notFound()

    const photos: SanityPlayerPhoto[] = player.mediaTag
        ? await client.fetch(playerPhotosQuery, { tag: player.mediaTag })
        : []

    return <PlayerProfile player={player} photos={photos} />
}
