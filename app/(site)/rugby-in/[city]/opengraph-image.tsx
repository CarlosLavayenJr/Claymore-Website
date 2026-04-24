import { CITIES } from '@/lib/cities'
import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'

export const alt = 'Rugby near you in Central Florida'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ city: string }> }) {
    const { city: citySlug } = await params
    const city = CITIES.find((c) => c.slug === citySlug)

    if (!city) {
        return brandedImageResponse({
            eyebrow: 'Rugby in Central Florida',
            title: 'Rugby Near You',
            subtitle: 'Central Florida Claymores RFC — Orlando.',
        })
    }

    return brandedImageResponse({
        eyebrow: `Rugby in ${city.name}`,
        title: `Play Rugby in ${city.name}`,
        subtitle: `${city.driveMinutes} min from ${city.fullName} to practice at Barnett Park, Orlando.`,
        footerRight: 'Practice every Thursday',
    })
}
