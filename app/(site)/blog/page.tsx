import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import { postsQuery, type SanityPost } from '@/sanity/lib/queries'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'News & Updates | Central Florida Claymores RFC',
    description: 'Latest news, match recaps, and season updates from the Central Florida Claymores RFC — Orlando\'s USA Rugby D3 club.',
    openGraph: {
        title: 'News & Updates | Central Florida Claymores RFC | Orlando Rugby',
        description: 'Match recaps, season previews, and club news from Orlando\'s USA Rugby D3 club.',
        url: '/blog',
    },
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default async function BlogPage() {
    const posts: SanityPost[] = await client.fetch(postsQuery)

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <div className="mb-10 text-center">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">Central Florida Claymores RFC</p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">News</h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto" />
            </div>

            {posts.length === 0 ? (
                <p className="text-center text-[#555555]">No posts yet — check back soon.</p>
            ) : (
                <div className="space-y-8">
                    {posts.map(post => (
                        <Link
                            key={post._id}
                            href={`/blog/${post.slug.current}`}
                            className="block border border-[#EAEAEA] rounded-xl overflow-hidden hover:border-[#77c3ef] transition-colors group"
                        >
                            {post.coverImageUrl && (
                                <img
                                    src={post.coverImageUrl}
                                    alt={`${post.title} — Central Florida Claymores RFC`}
                                    className="w-full h-52 object-cover"
                                    loading="lazy"
                                />
                            )}
                            <div className="p-6">
                                {post.publishedAt && (
                                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                                        {formatDate(post.publishedAt)}
                                    </p>
                                )}
                                <h2 className="text-2xl font-claymore text-[#111111] mb-2 group-hover:text-[#77c3ef] transition-colors">
                                    {post.title}
                                </h2>
                                {post.excerpt && (
                                    <p className="text-[#555555] leading-relaxed line-clamp-3">{post.excerpt}</p>
                                )}
                                <span className="inline-block mt-4 text-sm font-semibold text-[#77c3ef]">Read more &rarr;</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
