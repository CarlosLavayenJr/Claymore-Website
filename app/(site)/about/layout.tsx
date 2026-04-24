import type { Metadata } from 'next'
import { ogImage } from '@/lib/og'

export const metadata: Metadata = {
    title: 'About the Central Florida Claymores RFC | Orlando Rugby',
    description:
        "The story of the Central Florida Claymores — Orlando's USA Rugby D3 club. Coaches, history, and how rugby grew in Central Florida since 2018.",
    keywords: [
        'Orlando rugby club history',
        'Central Florida rugby',
        'Claymores RFC about',
        'Orlando rugby coaches',
        'USA Rugby D3 Orlando',
    ],
    alternates: { canonical: '/about' },
    openGraph: {
        type: 'website',
        title: 'About the Central Florida Claymores RFC | Orlando Rugby',
        description:
            "The story of the Central Florida Claymores — Orlando's USA Rugby D3 club since 2018.",
        url: '/about',
        images: ogImage(),
    },
    twitter: {
        card: 'summary_large_image',
        title: 'About the Central Florida Claymores RFC',
        description: "The story of Orlando's USA Rugby D3 club since 2018.",
    },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children
}
