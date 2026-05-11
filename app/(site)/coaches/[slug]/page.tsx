import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { client } from '@/sanity/lib/client'
import { coachBySlugQuery, coachesQuery, type SanityCoach } from '@/sanity/lib/queries'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import { breadcrumbSchema, coachSchema } from '@/lib/seo'
import { features } from '@/lib/features'
import { ogImage } from '@/lib/og'
import { getPracticeSchedule } from '@/lib/practice-schedule'

export const revalidate = 3600

interface Params {
    params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
    if (!features.coaches) return []
    const coaches: SanityCoach[] = await client.fetch(coachesQuery)
    return coaches.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params
    const coach: SanityCoach | null = await client.fetch(coachBySlugQuery, { slug })
    if (!coach) return {}
    const description =
        coach.bio?.slice(0, 200) ??
        `${coach.name} — ${coach.role} for the Central Florida Claymores RFC, Orlando's USA Rugby D3 club.`
    return {
        title: `${coach.name} — ${coach.role} | Central Florida Claymores RFC`,
        description,
        alternates: { canonical: `/coaches/${slug}` },
        openGraph: {
            title: `${coach.name} — ${coach.role} | Central Florida Claymores RFC`,
            description,
            url: `/coaches/${slug}`,
            images: coach.imageUrl ? [{ url: coach.imageUrl }] : ogImage(`/coaches/${slug}`),
        },
    }
}

export default async function CoachPage({ params }: Params) {
    if (!features.coaches) notFound()
    const { slug } = await params
    const [coach, schedule]: [SanityCoach | null, Awaited<ReturnType<typeof getPracticeSchedule>>] = await Promise.all([
        client.fetch(coachBySlugQuery, { slug }),
        getPracticeSchedule(),
    ])
    if (!coach) notFound()

    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <JsonLd data={coachSchema(coach)} />
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Coaches', path: '/coaches' },
                    { name: coach.name, path: `/coaches/${slug}` },
                ])}
            />

            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Coaches', path: '/coaches' },
                    { name: coach.name, path: `/coaches/${slug}` },
                ]}
            />

            <div className="grid sm:grid-cols-[200px_1fr] gap-8 items-start mb-10">
                {coach.imageUrl ? (
                    <img
                        src={coach.imageUrl}
                        alt={coach.imageAlt ?? `${coach.name} — ${coach.role}`}
                        className="w-full sm:w-48 aspect-square object-cover rounded-2xl"
                    />
                ) : (
                    <div className="w-full sm:w-48 aspect-square bg-[#EAEAEA] rounded-2xl" />
                )}
                <div>
                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">{coach.role}</p>
                    <h1 className="text-4xl md:text-5xl font-claymore text-[#111111] mb-4">{coach.name}</h1>
                    <div className="w-12 h-px bg-[#fd80b5] mb-4" />
                    <p className="text-sm text-[#555555]">
                        {coach.role} · Central Florida Claymores RFC · Orlando, FL
                    </p>
                </div>
            </div>

            {coach.bio && (
                <section className="mb-10">
                    <p className="text-lg text-[#333333] leading-relaxed whitespace-pre-line">{coach.bio}</p>
                </section>
            )}

            {coach.credentials && coach.credentials.length > 0 && (
                <section className="mb-10">
                    <h2 className="text-2xl font-claymore text-[#111111] mb-4">Credentials &amp; Background</h2>
                    <ul className="space-y-2 text-[#555555]">
                        {coach.credentials.map((c, i) => (
                            <li key={i} className="flex gap-3">
                                <span className="text-[#fd80b5] shrink-0 mt-1">•</span>
                                <span>{c}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="mt-12 text-center bg-[#F9F9F9] rounded-xl p-8">
                <h2 className="text-2xl font-claymore text-[#111111] mb-3">
                    Train with {coach.name.split(' ')[0]} and the Claymores
                </h2>
                <p className="text-[#555555] mb-6">
                    Practice every {schedule.weekday} at {schedule.venueName}, {schedule.venueCity}. All skill levels welcome.
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
