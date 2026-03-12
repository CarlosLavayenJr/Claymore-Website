import type { Metadata } from 'next'
import RugbyHero from '@/components/Hero'
import InstagramFeed from '@/components/instafeed'
import JsonLd from '@/components/json-ld'

export const metadata: Metadata = {
    title: 'Orlando Rugby Club | Central Florida Claymores RFC',
    description: "The Central Florida Claymores RFC are Orlando's premier rugby club, competing in the Florida Rugby Union. New players of all experience levels welcome. Join us today.",
    openGraph: {
        title: 'Orlando Rugby Club | Central Florida Claymores RFC',
        description: "Orlando's premier rugby club. Join us today.",
        url: '/',
    },
}

const sportsTeamSchema = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: 'Central Florida Claymores RFC',
    sport: 'Rugby',
    url: 'https://claymoresrugby.com',
    logo: 'https://claymoresrugby.com/assets/logo.png',
    foundingDate: '2018',
    location: {
        '@type': 'Place',
        name: 'Orlando, Florida',
        address: {
            '@type': 'PostalAddress',
            addressLocality: 'Orlando',
            addressRegion: 'FL',
            addressCountry: 'US',
        },
    },
    email: 'centrolfloridaclaymores@gmail.com',
    memberOf: {
        '@type': 'SportsOrganization',
        name: 'Florida Rugby Union',
    },
    sameAs: [
        'https://facebook.com',
        'https://instagram.com',
    ],
}

export default function Home() {
    return (
        <main className="min-h-screen">
            <JsonLd data={sportsTeamSchema} />
            <RugbyHero />
            <InstagramFeed />
        </main>
    )
}
