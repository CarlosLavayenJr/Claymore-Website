import './globals.css'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.claymoresrfc.com'),
    title: {
        default: 'Central Florida Claymores RFC | Orlando Rugby Club | USA Rugby D3',
        template: '%s | Central Florida Claymores | Orlando, FL',
    },
    description: "Central Florida Claymores RFC — Orlando's USA Rugby D3 club competing in the Florida Rugby Union since 2018. All skill levels welcome. Join us Thursdays.",
    keywords: [
        'Orlando rugby', 'Central Florida rugby', 'rugby club Orlando FL',
        'join rugby Orlando', 'rugby tryouts Orlando', 'Orlando rugby D3',
        'USA Rugby D3 Orlando', 'Florida Rugby Union', 'Central Florida Claymores',
        'rugby near Orlando', 'Orlando rugby club',
    ],
    openGraph: {
        type: 'website',
        locale: 'en_US',
        siteName: 'Central Florida Claymores RFC',
        title: 'Central Florida Claymores RFC | Orlando Rugby Club | USA Rugby D3',
        description: "Orlando's USA Rugby D3 club. All skill levels welcome. Join us Thursdays.",
        images: [{ url: '/assets/logo.png', width: 800, height: 600, alt: 'Central Florida Claymores RFC — Orlando Rugby Club Logo' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Central Florida Claymores RFC | Orlando Rugby Club',
        description: "Orlando's USA Rugby D3 club. All skill levels welcome.",
        images: ['/assets/logo.png'],
    },
    robots: { index: true, follow: true },
    verification: {
        google: 'bGoxzjpFMH2ewROECCRBboUv9wyJ9BiS6t3jrucmZ_8',
    },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <Script async src="https://www.googletagmanager.com/gtag/js?id=AW-18065227807" strategy="afterInteractive" />
                <Script id="google-ads-tag" strategy="afterInteractive">{`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', 'AW-18065227807');
                `}</Script>
            </head>
            <body className="overflow-x-hidden">{children}</body>
            <Analytics />
        </html>
    )
}
