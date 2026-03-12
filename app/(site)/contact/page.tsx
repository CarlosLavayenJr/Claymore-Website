import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import { teamPhotosQuery, type SanityTeamPhoto } from '@/sanity/lib/queries'
import ContactForm from '@/components/contact-form'
import TeamPhotoGrid from '@/components/team-photo-grid'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Contact the Orlando Claymores RFC — Join the Team',
    description: 'Get in touch with the Central Florida Claymores RFC. Practices every Thursday at Barnett Park, Orlando. No experience required — come play rugby.',
    openGraph: {
        title: 'Contact the Orlando Claymores RFC',
        description: 'Reach out to join Orlando\'s USA Rugby D3 club. Practices every Thursday at Barnett Park.',
        url: '/contact',
    },
}

export default async function ContactPage() {
    const photos: SanityTeamPhoto[] = await client.fetch(teamPhotosQuery)

    return (
        <div className="min-h-screen">

            {/* Hero */}
            <section className="bg-black text-white py-20 px-4 text-center">
                <div className="max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-claymore mb-6">
                        Join the Claymores
                    </h1>
                    <p className="text-xl text-gray-300 mb-8">
                        Ready to play rugby in Orlando? Send us a message — we&apos;ll get back to you before the next Thursday practice.
                    </p>
                    <Link
                        href="/join"
                        className="inline-block border border-[#78c3ef] text-[#78c3ef] font-semibold px-8 py-3 rounded-md text-sm uppercase tracking-wide hover:bg-[#78c3ef] hover:text-black transition-colors"
                    >
                        Learn about joining
                    </Link>
                </div>
            </section>

            {/* Team photos — random 3, clickable lightbox */}
            {photos.length > 0 && (
                <TeamPhotoGrid photos={photos} count={3} />
            )}

            {/* Main content */}
            <div className="container mx-auto px-4 py-16 max-w-5xl">
                <div className="grid md:grid-cols-2 gap-12 items-start">

                    {/* Left — contact form */}
                    <div>
                        <h2 className="text-2xl font-claymore mb-6">Send Us a Message</h2>
                        <ContactForm />
                    </div>

                    {/* Right — club info */}
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-2xl font-claymore mb-6">Club Information</h2>
                            <dl className="space-y-4">
                                <div>
                                    <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Club</dt>
                                    <dd className="font-semibold">Central Florida Claymores RFC</dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Practice</dt>
                                    <dd className="font-semibold">Thursdays — 8:00–10:00 PM</dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Location</dt>
                                    <dd className="font-semibold">
                                        Barnett Park<br />
                                        <span className="text-muted-foreground font-normal">4801 W Colonial Dr, Orlando, FL 32808</span>
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Email</dt>
                                    <dd>
                                        <a
                                            href="mailto:claymoresrfc@gmail.com"
                                            className="text-[#78c3ef] hover:underline font-semibold"
                                        >
                                            claymoresrfc@gmail.com
                                        </a>
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">League</dt>
                                    <dd className="font-semibold">USA Rugby — Florida Rugby Union D3</dd>
                                </div>
                            </dl>
                        </div>

                        <div className="bg-muted rounded-xl p-6">
                            <p className="font-claymore text-lg mb-2">No Experience Needed</p>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                We welcome complete beginners and experienced players alike. Just show up to a Thursday practice in athletic clothes and cleats — we&apos;ll handle the rest.
                            </p>
                            <Link
                                href="/join"
                                className="inline-block mt-4 text-sm font-semibold text-[#78c3ef] hover:underline"
                            >
                                More about joining &rarr;
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
