import { client } from '@/sanity/lib/client'
import { playerBySlugQuery, type SanityPlayer } from '@/sanity/lib/queries'
import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'

export const alt = 'Claymores Player Profile'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const player: SanityPlayer | null = await client.fetch(playerBySlugQuery, { slug })

    if (!player) {
        return brandedImageResponse({
            eyebrow: 'Player Profile',
            title: 'Claymores Roster',
            subtitle: 'Orlando rugby — USA Rugby D3.',
        })
    }

    const facts = [player.position, player.height, player.weight].filter(Boolean).join(' · ')

    return brandedImageResponse({
        eyebrow: 'Claymores Roster',
        title: player.name,
        subtitle: facts || 'Central Florida Claymores RFC',
        badge: player.position?.toUpperCase()?.slice(0, 16),
        accent: '#77c3ef',
    })
}
