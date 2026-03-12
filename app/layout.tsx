import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claymoresrugby.com'),
    title: {
        default: 'Central Florida Claymores RFC | Orlando Rugby Club',
        template: '%s | Central Florida Claymores RFC',
    },
    description: "Orlando's premier rugby club. The Central Florida Claymores RFC compete in the Florida Rugby Union. All skill levels welcome — join us, watch us play, or follow our journey.",
    keywords: ['Orlando rugby', 'Central Florida rugby', 'Orlando rugby club', 'Florida Rugby Union', 'rugby Orlando FL', 'Central Florida Claymores', 'rugby near Orlando'],
    openGraph: {
        type: 'website',
        locale: 'en_US',
        siteName: 'Central Florida Claymores RFC',
        title: 'Central Florida Claymores RFC | Orlando Rugby Club',
        description: "Orlando's premier rugby club. All skill levels welcome.",
        images: [{ url: '/assets/logo.png', width: 800, height: 600, alt: 'Central Florida Claymores RFC Logo' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Central Florida Claymores RFC | Orlando Rugby Club',
        description: "Orlando's premier rugby club. All skill levels welcome.",
        images: ['/assets/logo.png'],
    },
    robots: {
        index: true,
        follow: true,
    },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
