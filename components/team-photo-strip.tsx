import { client } from '@/sanity/lib/client'
import { teamPhotosQuery, type SanityTeamPhoto } from '@/sanity/lib/queries'
import TeamPhotoGrid from '@/components/team-photo-grid'

interface Props {
    count?: number
}

export default async function TeamPhotoStrip({ count = 4 }: Props) {
    const photos: SanityTeamPhoto[] = await client.fetch(teamPhotosQuery)
    if (photos.length === 0) return null
    return <TeamPhotoGrid photos={photos} count={count} />
}
