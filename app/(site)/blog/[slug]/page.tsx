import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { client } from '@/sanity/lib/client'
import { postBySlugQuery, postsQuery, playerPhotosQuery, type SanityPost, type SanityPlayerPhoto } from '@/sanity/lib/queries'
import PostGallery from './PostGallery'
import BlogContent from './BlogContent'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import { articleSchema } from '@/lib/seo'
import { ogImage } from '@/lib/og'

export const revalidate = 3600

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
            images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : ogImage(`/blog/${slug}`),
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
        ? await client.fetch<SanityPlayerPhoto[]>(playerPhotosQuery, { tag: post.mediaTag } as Record<string, string>)
        : []

    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <JsonLd data={articleSchema(post)} />
            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'News', path: '/blog' },
                    { name: post.title, path: `/blog/${slug}` },
                ]}
            />
            <Link href="/blog" className="text-sm text-[#77c3ef] hover:underline mb-8 inline-block">&larr; Back to News</Link>

            <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                {post.publishedAt ? formatDate(post.publishedAt) : 'Central Florida Claymores RFC'}
            </p>
            <h1 className="text-4xl md:text-5xl font-claymore text-[#111111] mb-6">{post.title}</h1>
            <div className="w-12 h-px bg-[#fd80b5] mb-8" />

            <BlogContent
                coverImageUrl={post.coverImageUrl}
                coverImageAlt={post.coverImageAlt ?? `${post.title} — Central Florida Claymores RFC`}
                body={post.body ?? []}
                excerpt={post.excerpt}
            />

            {galleryPhotos.length > 0 && <PostGallery photos={galleryPhotos} />}

            <div className="mt-16 border-t border-[#EAEAEA] pt-8 text-center">
                <p className="text-[#555555] mb-4">Want to be part of the story? Join the Claymores.</p>
                <Link
                    href="/contact"
                    className="inline-block bg-[#77c3ef] text-white font-claymore text-lg px-8 py-3 rounded-md hover:bg-[#a0d5f5] transition-colors"
                >
                    Join the Club
                </Link>
            </div>
        </div>
    )
}
