import { client } from '@/sanity/lib/client'
import { postBySlugQuery, type SanityPost } from '@/sanity/lib/queries'
import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'

export const alt = 'Central Florida Claymores RFC — News'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const post: SanityPost | null = await client.fetch(postBySlugQuery, { slug })

    const title = post?.title ?? "Central Florida Claymores RFC"
    const date = post?.publishedAt
        ? new Date(post.publishedAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
          })
        : null

    return brandedImageResponse({
        eyebrow: date ? `Claymores News · ${date}` : 'Claymores News',
        title,
        subtitle: post?.excerpt ?? 'Orlando Rugby News & Match Reports',
    })
}
