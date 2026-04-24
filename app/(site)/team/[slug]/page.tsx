import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { client } from "@/sanity/lib/client"
import { playerBySlugQuery, playerPhotosQuery, playersQuery } from "@/sanity/lib/queries"
import type { SanityPlayer, SanityPlayerPhoto } from "@/sanity/lib/queries"
import JsonLd from "@/components/json-ld"
import { athleteSchema, breadcrumbSchema } from "@/lib/seo"

import PlayerProfile from "./player-profile"

export const revalidate = 0

interface Props {
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const player: SanityPlayer | null = await client.fetch(playerBySlugQuery, { slug })
    if (!player) return {}
    const description = player.description
        || `${player.name} plays ${player.position} for the Central Florida Claymores RFC — Orlando's USA Rugby D3 club competing in the Florida Rugby Union.`
    return {
        title: `${player.name} | Orlando Rugby | Central Florida Claymores RFC`,
        description,
        alternates: { canonical: `/team/${slug}` },
        openGraph: {
            title: `${player.name} | Central Florida Claymores RFC`,
            description,
            url: `/team/${slug}`,
            images: player.imageUrl
                ? [{ url: player.imageUrl, width: 800, height: 800, alt: `${player.name} — Central Florida Claymores RFC Orlando Rugby` }]
                : [],
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

    return (
        <>
            <JsonLd data={athleteSchema(player)} />
            <JsonLd
                data={breadcrumbSchema([
                    { name: "Home", path: "/" },
                    { name: "Team", path: "/team" },
                    { name: player.name, path: `/team/${slug}` },
                ])}
            />
            <PlayerProfile player={player} photos={photos} nextPlayer={nextPlayer} />
        </>
    )
}
