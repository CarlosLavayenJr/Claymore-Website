import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claymoresrugby.com'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: '/studio',
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    }
}
