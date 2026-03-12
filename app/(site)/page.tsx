import type { Metadata } from 'next'
import Link from 'next/link'
import RugbyHero from '@/components/Hero'
import InstagramFeed from '@/components/instafeed'
import JsonLd from '@/components/json-ld'
import { organizationSchema } from '@/lib/schema'
import TeamPhotoStrip from '@/components/team-photo-strip'

export const metadata: Metadata = {
    title: 'Central Florida Claymores RFC | Orlando Rugby Club | USA Rugby D3',
    description: "Central Florida Claymores RFC — Orlando's USA Rugby D3 club competing in the Florida Rugby Union since 2018. No experience needed. Join us Thursdays.",
    openGraph: {
        title: 'Central Florida Claymores RFC | Orlando Rugby Club | USA Rugby D3',
        description: "Orlando's USA Rugby D3 club. No experience needed. Join us Thursdays.",
        url: '/',
    },
}

export default function Home() {
    return (
        <main className="min-h-screen">
            <JsonLd data={organizationSchema} />
            <RugbyHero />

            {/* Location + CTA section — critical for local SEO H1 */}
            <section className="bg-white py-16 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-claymore mb-6">
                        Orlando&apos;s Rugby Club — Central Florida Claymores RFC
                    </h1>
                    <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                        The Central Florida Claymores RFC are Orlando&apos;s USA Rugby D3 club, competing in the Florida Rugby Union since 2018. We practice every Thursday in the Orlando area and welcome players of all skill levels — no experience required.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            href="/join"
                            className="inline-block bg-black text-white px-8 py-3 rounded-md font-semibold hover:bg-[#0066b2] transition-colors"
                        >
                            Join the Claymores
                        </Link>
                        <Link
                            href="/location"
                            className="inline-block border border-black text-black px-8 py-3 rounded-md font-semibold hover:bg-gray-100 transition-colors"
                        >
                            Find Us in Orlando
                        </Link>
                        <Link
                            href="/about-orlando-rugby"
                            className="inline-block border border-black text-black px-8 py-3 rounded-md font-semibold hover:bg-gray-100 transition-colors"
                        >
                            About Orlando Rugby
                        </Link>
                    </div>
                </div>
            </section>

            {/* From the Field */}
            <section className="py-12">
                <div className="max-w-4xl mx-auto px-4 mb-6">
                    <h2 className="text-2xl font-claymore text-center">From the Field</h2>
                </div>
                <TeamPhotoStrip count={6} />
            </section>

            <InstagramFeed />
        </main>
    )
}
