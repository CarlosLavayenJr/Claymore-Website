import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claymoresrugby.com'

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
        { url: `${baseUrl}/join`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.95 },
        { url: `${baseUrl}/about-orlando-rugby`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/fixtures`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
        { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${baseUrl}/team`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${baseUrl}/location`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
        { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    ]
}
