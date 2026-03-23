import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PortableText } from 'next-sanity'
import { client } from '@/sanity/lib/client'
import { postBySlugQuery, postsQuery, playerPhotosQuery, type SanityPost, type SanityPlayerPhoto } from '@/sanity/lib/queries'
import PostGallery from './PostGallery'

export const revalidate = 3600

const portableTextComponents = {
    types: {
        image: ({ value }: { value: { asset?: { url?: string }; alt?: string; caption?: string } }) => {
            if (!value.asset?.url) return null
            return (
                <figure className="my-8">
                    <img
                        src={value.asset.url}
                        alt={value.alt ?? ''}
                        className="w-full rounded-lg"
                    />
                    {value.caption && (
                        <figcaption className="text-center text-sm text-gray-500 mt-2">{value.caption}</figcaption>
                    )}
                </figure>
            )
        },
    },
}

export async function generateStaticParams() {
    const posts: SanityPost[] = await client.fetch(postsQuery)
    return posts.map(p => ({ slug: p.slug.current }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    const post: SanityPost | null = await client.fetch(postBySlugQuery, { slug })
    if (!post) return {}
    return {
        title: `${post.title} | Central Florida Claymores RFC`,
        description: post.excerpt ?? `${post.title} — Central Florida Claymores RFC Orlando rugby news.`,
        alternates: {
            canonical: `/blog/${slug}`,
        },
        openGraph: {
            title: post.title,
            description: post.excerpt ?? undefined,
            url: `/blog/${slug}`,
            images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined,
        },
    }
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const post: SanityPost | null = await client.fetch(postBySlugQuery, { slug })
    if (!post) notFound()

    const galleryPhotos: SanityPlayerPhoto[] = post.mediaTag
        ? await client.fetch<SanityPlayerPhoto[]>(playerPhotosQuery, { tag: post.mediaTag })
        : []

    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <Link href="/blog" className="text-sm text-[#77c3ef] hover:underline mb-8 inline-block">&larr; Back to News</Link>

            {post.coverImageUrl && (
                <img
                    src={post.coverImageUrl}
                    alt={`${post.title} — Central Florida Claymores RFC`}
                    className="w-full h-72 object-cover rounded-xl mb-8"
                />
            )}

            <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                {post.publishedAt ? formatDate(post.publishedAt) : 'Central Florida Claymores RFC'}
            </p>
            <h1 className="text-4xl md:text-5xl font-claymore text-[#111111] mb-6">{post.title}</h1>
            <div className="w-12 h-px bg-[#fd80b5] mb-8" />

            {post.body && post.body.length > 0 ? (
                <div className="prose prose-lg max-w-none text-[#333333] [&_h2]:font-claymore [&_h2]:text-[#111111] [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:mb-5 [&_a]:text-[#77c3ef]">
                    <PortableText value={post.body as Parameters<typeof PortableText>[0]['value']} components={portableTextComponents} />
                </div>
            ) : post.excerpt ? (
                <p className="text-[#555555] leading-relaxed text-lg">{post.excerpt}</p>
            ) : null}

            {galleryPhotos.length > 0 && <PostGallery photos={galleryPhotos} />}

            <div className="mt-16 border-t border-[#EAEAEA] pt-8 text-center">
                <p className="text-[#555555] mb-4">Want to be part of the story? Join the Claymores.</p>
                <Link
                    href="/join"
                    className="inline-block bg-[#77c3ef] text-white px-8 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity"
                >
                    Join the Club
                </Link>
            </div>
        </div>
    )
}
