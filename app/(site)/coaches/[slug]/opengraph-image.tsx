import { client } from '@/sanity/lib/client'
import { coachBySlugQuery, type SanityCoach } from '@/sanity/lib/queries'
import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'

export const alt = 'Claymores Coach Profile'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const coach: SanityCoach | null = await client.fetch(coachBySlugQuery, { slug })

    if (!coach) {
        return brandedImageResponse({
            eyebrow: 'Coaches & Staff',
            title: 'Claymores Coaching Staff',
            subtitle: 'Orlando rugby — coaches and staff.',
        })
    }

    return brandedImageResponse({
        eyebrow: 'Claymores Coaching Staff',
        title: coach.name,
        subtitle: coach.role,
        accent: '#77c3ef',
    })
}
