import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.claymoresrfc.com'

// AI *training-only* crawlers we explicitly block. These hammer the site to
// scrape pages into LLM training corpora and respect robots.txt; blocking
// them here is what keeps Edge Request usage sane. We deliberately do NOT
// block citation / real-time bots (GPTBot, ClaudeBot, OAI-SearchBot,
// PerplexityBot, Google-Extended, etc.) — those help GEO by surfacing the
// site when someone asks an AI about Orlando rugby.
const TRAINING_CRAWLERS_TO_BLOCK = [
    'Meta-ExternalAgent',
    'Bytespider',
    'CCBot',
]

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/studio', '/api/'],
            },
            ...TRAINING_CRAWLERS_TO_BLOCK.map((bot) => ({
                userAgent: bot,
                disallow: '/',
            })),
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    }
}
