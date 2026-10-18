import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import { organizationSchema } from '@/lib/schema'
import { breadcrumbSchema, metaDescription } from '@/lib/seo'
import { CITIES, directionsUrl, getCity, nearbyCities, travelDirection, type City } from '@/lib/cities'
import { ogImage } from '@/lib/og'
import { getPracticeSchedule, type PracticeSchedule } from '@/lib/practice-schedule'

export const dynamicParams = false

export function generateStaticParams() {
    return CITIES.map((c) => ({ city: c.slug }))
}

function routeText(c: City): string {
    const r = c.routes
    if (r.length === 0) return ''
    if (r.length === 1) return r[0]
    return `${r.slice(0, -1).join(', ')} and ${r[r.length - 1]}`
}

function buildCityFaqs(c: City, s: PracticeSchedule) {
    return [
        {
            question: `How far is rugby practice from ${c.name}?`,
            answer: `${s.venueName} is about ${c.driveMiles} miles from ${c.name} — roughly ${c.driveMinutes} minutes without traffic${c.routes.length ? `, mostly via ${routeText(c)}` : ''}.`,
        },
        {
            question: `When do the Claymores practice?`,
            answer: `${s.seasonLabel}: every ${s.weekday}, ${s.time}, at ${s.venueName} (${s.venueAddress}). ${s.seasonalNote}`,
        },
        {
            question: `Do I need rugby experience to join from ${c.name}?`,
            answer: `No. Most new players start with no experience. Come to a ${s.weekday} practice in athletic clothes and cleats if you have them, and the coaches will teach you the basics.`,
        },
    ]
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ city: string }>
}): Promise<Metadata> {
    const { city } = await params
    const c = getCity(city)
    if (!c) return {}
    const s = await getPracticeSchedule()
    const title = `Rugby Club Near ${c.name}, FL`
    const description = metaDescription(
        `Looking for a rugby club near ${c.name}? The Central Florida Claymores RFC practice every ${s.weekday} at ${s.venueName}, about ${c.driveMinutes} minutes from ${c.name}. No experience needed.`,
    )
    return {
        title,
        description,
        alternates: { canonical: `/rugby-in/${city}` },
        openGraph: {
            title,
            description,
            url: `/rugby-in/${city}`,
            images: ogImage(`/rugby-in/${city}`),
        },
    }
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
    const { city } = await params
    const c = getCity(city)
    if (!c) notFound()
    const schedule = await getPracticeSchedule()
    const faqs = buildCityFaqs(c, schedule)
    const nearby = nearbyCities(c)
    const destination = `${schedule.venueName}, ${schedule.venueAddress}`

    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <JsonLd data={organizationSchema} />
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: `Rugby in ${c.name}`, path: `/rugby-in/${city}` },
                ])}
            />
            <JsonLd
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'FAQPage',
                    mainEntity: faqs.map((f) => ({
                        '@type': 'Question',
                        name: f.question,
                        acceptedAnswer: { '@type': 'Answer', text: f.answer },
                    })),
                }}
            />

            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: `Rugby in ${c.name}`, path: `/rugby-in/${city}` },
                ]}
            />

            <div className="text-center mb-10">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                    Central Florida Claymores RFC
                </p>
                <h1 className="text-4xl md:text-5xl font-claymore text-[#111111] mb-3">
                    Rugby in {c.name}, Florida
                </h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto mb-4" />
                <p className="text-lg text-[#555555] max-w-2xl mx-auto">{c.intro}</p>
            </div>

            {/* At-a-glance facts — the part that's genuinely different per city */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10 text-center">
                {[
                    { label: 'Drive to practice', value: `${c.driveMinutes} min` },
                    { label: 'Distance', value: `${c.driveMiles} mi` },
                    { label: 'Head', value: travelDirection(c) },
                    { label: 'County', value: c.county.replace(' County', '') },
                ].map((item) => (
                    <div key={item.label} className="bg-[#F9F9F9] rounded-lg px-3 py-4">
                        <dt className="text-[10px] uppercase tracking-widest text-[#555555] font-semibold mb-1">{item.label}</dt>
                        <dd className="text-xl font-bold text-[#111111] capitalize">{item.value}</dd>
                    </div>
                ))}
            </dl>

            <section className="prose prose-lg max-w-none text-[#333333] mb-10">
                <h2 className="font-claymore text-3xl text-[#111111] mt-10 mb-4">
                    Getting to practice from {c.name}
                </h2>
                <p>
                    Practice is at <strong>{schedule.venueName}</strong>, {schedule.venueAddress}. {c.name} sits{' '}
                    {c.position} of the field, so you&apos;ll head {travelDirection(c)}: the drive is about{' '}
                    {c.driveMiles} miles and roughly {c.driveMinutes} minutes without traffic
                    {c.routes.length > 0 && <>, mostly via {routeText(c)}</>}.
                </p>
                <p>
                    <strong>{schedule.seasonLabel}:</strong> every {schedule.weekday}, {schedule.time}.{' '}
                    <Link href="/fixtures" className="text-[#77c3ef] underline underline-offset-2">{schedule.seasonalNote}</Link>
                </p>
                <p className="not-prose">
                    <a
                        href={directionsUrl(c, destination)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block border border-[#77c3ef] text-[#77c3ef] px-6 py-2.5 rounded-md font-semibold hover:bg-[#77c3ef]/10 transition-colors"
                    >
                        Directions from {c.name} &rarr;
                    </a>
                </p>

                <h2 className="font-claymore text-3xl text-[#111111] mt-10 mb-4">
                    Club rugby for {c.name} players
                </h2>
                <p>
                    The Central Florida Claymores RFC are Orlando&apos;s USA Rugby Division 3 club, founded in 2018 and
                    competing in the Florida Rugby Union. Whether you&apos;re near {c.landmarks[0]} or{' '}
                    {c.landmarks[1]}, you don&apos;t need experience to start — coaches teach the basics from your first{' '}
                    {schedule.weekday}, and the club reached the state final as recently as 2023.
                </p>

                <h2 className="font-claymore text-3xl text-[#111111] mt-10 mb-4">
                    {c.name} rugby FAQ
                </h2>
                {faqs.map((f) => (
                    <div key={f.question}>
                        <h3 className="text-lg font-bold text-[#111111] mb-1">{f.question}</h3>
                        <p>{f.answer}</p>
                    </div>
                ))}
            </section>

            <div className="mt-12 text-center bg-[#F9F9F9] rounded-xl p-8">
                <h2 className="text-2xl font-claymore text-[#111111] mb-3">Play Rugby Near {c.name}</h2>
                <p className="text-[#555555] mb-6 max-w-xl mx-auto">
                    Send us a message and we&apos;ll meet you at your first {schedule.weekday} practice.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/contact"
                        className="inline-block bg-[#77c3ef] text-white font-claymore text-lg px-8 py-3 rounded-md hover:bg-[#a0d5f5] transition-colors"
                    >
                        Join the Claymores
                    </Link>
                    <Link
                        href="/location"
                        className="inline-block border border-[#77c3ef] text-[#77c3ef] px-8 py-3 rounded-md font-semibold hover:bg-[#77c3ef]/10 transition-colors"
                    >
                        Practice Info
                    </Link>
                </div>
            </div>

            {/* Cross-link to the nearest city pages (not all of them — keeps each page distinct) */}
            <div className="mt-10 text-center text-sm text-[#555555]">
                <p className="mb-3 uppercase tracking-widest text-xs text-[#fd80b5] font-semibold">
                    Rugby near {c.name}
                </p>
                <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                    {nearby.map((other) => (
                        <li key={other.slug}>
                            <Link href={`/rugby-in/${other.slug}`} className="text-[#77c3ef] hover:underline">
                                Rugby in {other.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
