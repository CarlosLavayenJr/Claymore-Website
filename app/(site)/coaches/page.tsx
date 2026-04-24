import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { client } from '@/sanity/lib/client'
import { coachesQuery, type SanityCoach } from '@/sanity/lib/queries'
import Breadcrumbs from '@/components/breadcrumbs'
import { features } from '@/lib/features'
import { ogImage } from '@/lib/og'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Coaches & Staff | Central Florida Claymores RFC | Orlando Rugby',
    description:
        'Meet the coaches and staff of the Central Florida Claymores RFC — the people building Orlando rugby. Coaching credentials, backgrounds, and the brains behind the Claymores.',
    alternates: { canonical: '/coaches' },
    openGraph: {
        title: 'Coaches & Staff | Central Florida Claymores RFC',
        description: 'Meet the people building Orlando rugby with the Central Florida Claymores RFC.',
        url: '/coaches',
        images: ogImage(),
    },
}

export default async function CoachesPage() {
    if (!features.coaches) notFound()
    const coaches: SanityCoach[] = await client.fetch(coachesQuery)

    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Coaches', path: '/coaches' },
                ]}
            />

            <div className="text-center mb-12">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                    Central Florida Claymores RFC
                </p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">Coaches &amp; Staff</h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto mb-4" />
                <p className="text-[#555555] max-w-2xl mx-auto">
                    The Claymores are coached and led by people who came up through the same ranks. Meet the team building
                    Orlando&apos;s USA Rugby D3 program.
                </p>
            </div>

            {coaches.length === 0 ? (
                <p className="text-center text-[#555555]">
                    Coach profiles coming soon. Add them in the Sanity Studio under <em>Coach / Staff</em>.
                </p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                    {coaches.map((coach) => (
                        <Link
                            key={coach._id}
                            href={`/coaches/${coach.slug}`}
                            className="block border border-[#EAEAEA] rounded-2xl overflow-hidden bg-white hover:border-[#77c3ef] transition-colors"
                        >
                            {coach.imageUrl ? (
                                <img
                                    src={coach.imageUrl}
                                    alt={coach.imageAlt ?? `${coach.name} — ${coach.role}, Central Florida Claymores RFC`}
                                    className="w-full h-64 object-cover"
                                />
                            ) : (
                                <div className="w-full h-64 bg-[#EAEAEA]" />
                            )}
                            <div className="p-6">
                                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-1">
                                    {coach.role}
                                </p>
                                <h2 className="text-2xl font-claymore text-[#111111] mb-2">{coach.name}</h2>
                                {coach.bio && (
                                    <p className="text-sm text-[#555555] line-clamp-3">{coach.bio}</p>
                                )}
                                <span className="inline-block mt-4 text-sm font-semibold text-[#77c3ef]">
                                    Read bio &rarr;
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <div className="mt-16 text-center bg-[#F9F9F9] rounded-xl p-8">
                <h2 className="text-2xl font-claymore text-[#111111] mb-3">Train with the Claymores</h2>
                <p className="text-[#555555] mb-6 max-w-xl mx-auto">
                    Practice every Thursday in Orlando. All skill levels welcome — our staff develop players from
                    beginners to leaders.
                </p>
                <Link
                    href="/join"
                    className="inline-block bg-[#77c3ef] text-white px-8 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity"
                >
                    Join the Club
                </Link>
            </div>
        </div>
    )
}
