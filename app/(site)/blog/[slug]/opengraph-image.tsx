import { ImageResponse } from 'next/og'
import { client } from '@/sanity/lib/client'
import { postBySlugQuery, type SanityPost } from '@/sanity/lib/queries'

export const alt = 'Central Florida Claymores RFC News'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { slug: string } }) {
    const post: SanityPost | null = await client.fetch(postBySlugQuery, { slug: params.slug })

    const title = post?.title ?? 'Central Florida Claymores RFC'
    const date = post?.publishedAt
        ? new Date(post.publishedAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
          })
        : null

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background:
                        'radial-gradient(ellipse 80% 60% at 50% 0%, #1a3a4a 0%, #0f2535 30%, #111111 70%)',
                    color: '#fff',
                    padding: '70px 80px',
                    fontFamily: 'sans-serif',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        fontSize: 18,
                        letterSpacing: 6,
                        textTransform: 'uppercase',
                        color: '#fd80b5',
                        fontWeight: 700,
                    }}
                >
                    Claymores News {date ? `· ${date}` : ''}
                </div>

                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            fontSize: title.length > 60 ? 64 : 84,
                            lineHeight: 1.05,
                            fontWeight: 800,
                            letterSpacing: -1.5,
                            maxWidth: 1040,
                        }}
                    >
                        {title}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, color: '#77c3ef' }}>
                    <span>Central Florida Claymores RFC</span>
                    <span>claymoresrfc.com</span>
                </div>
            </div>
        ),
        { ...size },
    )
}
