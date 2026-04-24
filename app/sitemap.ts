import type { MetadataRoute } from 'next'
import { client } from '@/sanity/lib/client'
import {
    coachesQuery,
    matchesQuery,
    playersQuery,
    postsQuery,
    teamsQuery,
    type SanityCoach,
    type SanityMatch,
    type SanityPlayer,
    type SanityPost,
    type SanityTeam,
} from '@/sanity/lib/queries'
import { matchSlug } from '@/lib/seo'
import { CITIES } from '@/lib/cities'
import { features } from '@/lib/features'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.claymoresrfc.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const [players, posts, matches, teams, coaches]: [
        SanityPlayer[],
        SanityPost[],
        SanityMatch[],
        SanityTeam[],
        SanityCoach[],
    ] = await Promise.all([
        client.fetch(playersQuery),
        client.fetch(postsQuery),
        client.fetch(matchesQuery),
        client.fetch(teamsQuery),
        features.coaches
            ? client.fetch(coachesQuery).catch(() => [] as SanityCoach[])
            : Promise.resolve([] as SanityCoach[]),
    ])

    const playerEntries: MetadataRoute.Sitemap = players.map((p) => ({
        url: `${baseUrl}/team/${p.slug}`,
        lastModified: p._updatedAt ? new Date(p._updatedAt) : new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
    }))

    const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
        url: `${baseUrl}/blog/${p.slug.current}`,
        lastModified: p._updatedAt ? new Date(p._updatedAt) : new Date(p.publishedAt),
        changeFrequency: 'monthly',
        priority: 0.7,
    }))

    const matchEntries: MetadataRoute.Sitemap = matches.map((m) => ({
        url: `${baseUrl}/fixtures/${matchSlug(m)}`,
        lastModified: m._updatedAt ? new Date(m._updatedAt) : new Date(m.date),
        changeFrequency: m.status === 'upcoming' ? 'weekly' : 'monthly',
        priority: m.status === 'upcoming' ? 0.85 : 0.65,
    }))

    const seasons = Array.from(new Set(matches.map((m) => m.season))).sort((a, b) => b - a)
    const seasonEntries: MetadataRoute.Sitemap = seasons.map((s) => ({
        url: `${baseUrl}/results/${s}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
    }))

    const opponentEntries: MetadataRoute.Sitemap = teams
        .filter((t) => t.slug && !/claymore/i.test(t.name))
        .map((t) => ({
            url: `${baseUrl}/opponents/${t.slug}`,
            lastModified: t._updatedAt ? new Date(t._updatedAt) : new Date(),
            changeFrequency: 'monthly',
            priority: 0.55,
        }))

    const coachEntries: MetadataRoute.Sitemap = coaches.map((c) => ({
        url: `${baseUrl}/coaches/${c.slug}`,
        lastModified: c._updatedAt ? new Date(c._updatedAt) : new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
    }))

    const cityEntries: MetadataRoute.Sitemap = CITIES.map((c) => ({
        url: `${baseUrl}/rugby-in/${c.slug}`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.75,
    }))

    const coachesIndex: MetadataRoute.Sitemap = features.coaches
        ? [{ url: `${baseUrl}/coaches`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.8 }]
        : []

    return [
        { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
        { url: `${baseUrl}/join`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.95 },
        { url: `${baseUrl}/about-orlando-rugby`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/fixtures`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
        { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${baseUrl}/team`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        ...coachesIndex,
        { url: `${baseUrl}/opponents`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${baseUrl}/results`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${baseUrl}/location`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.75 },
        { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
        { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
        ...cityEntries,
        ...seasonEntries,
        ...matchEntries,
        ...opponentEntries,
        ...coachEntries,
        ...postEntries,
        ...playerEntries,
    ]
}
