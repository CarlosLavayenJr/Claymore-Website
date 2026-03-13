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
                            className="inline-block bg-[#77c3ef] text-white px-8 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity"
                        >
                            Join the Claymores
                        </Link>
                        <Link
                            href="/location"
                            className="inline-block border border-[#77c3ef] text-[#77c3ef] px-8 py-3 rounded-md font-semibold hover:bg-[#77c3ef]/10 transition-colors"
                        >
                            Find Us in Orlando
                        </Link>
                        <Link
                            href="/about-orlando-rugby"
                            className="inline-block border border-[#77c3ef] text-[#77c3ef] px-8 py-3 rounded-md font-semibold hover:bg-[#77c3ef]/10 transition-colors"
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

            {/* Join the Club */}
            <section className="bg-white py-20 px-4 border-t border-[#EAEAEA]">
                <div className="max-w-3xl mx-auto text-center">
                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-3">Central Florida Claymores RFC</p>
                    <h2 className="text-4xl md:text-5xl font-claymore text-[#111111] mb-4">Join the Club</h2>
                    <div className="w-12 h-px bg-[#fd80b5] mx-auto mb-6" />
                    <p className="text-lg text-[#555555] mb-8 max-w-xl mx-auto">
                        No experience needed. We welcome players of all skill levels — come out to a practice and see what Orlando rugby is all about.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            href="/join"
                            className="inline-block bg-[#77c3ef] text-white px-10 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity"
                        >
                            Get Started
                        </Link>
                        <Link
                            href="/location"
                            className="inline-block border border-[#77c3ef] text-[#77c3ef] px-10 py-3 rounded-md font-semibold hover:bg-[#77c3ef]/10 transition-colors"
                        >
                            Practice Info
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    )
}
