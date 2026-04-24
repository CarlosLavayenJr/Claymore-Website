import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import { organizationSchema } from '@/lib/schema'
import { breadcrumbSchema } from '@/lib/seo'
import { CITIES, getCity } from '@/lib/cities'

export const dynamicParams = false

export function generateStaticParams() {
    return CITIES.map((c) => ({ city: c.slug }))
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ city: string }>
}): Promise<Metadata> {
    const { city } = await params
    const c = getCity(city)
    if (!c) return {}
    const title = `Rugby in ${c.name}, FL — Central Florida Claymores RFC`
    const description = `Looking for a rugby club near ${c.name}? The Central Florida Claymores RFC are the USA Rugby D3 club for the ${c.name} area — practice every Thursday in Orlando, ${c.driveMinutes} minutes ${c.direction} of ${c.name}.`
    return {
        title,
        description,
        alternates: { canonical: `/rugby-in-${city}` },
        openGraph: {
            title,
            description,
            url: `/rugby-in-${city}`,
        },
    }
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
    const { city } = await params
    const c = getCity(city)
    if (!c) notFound()

    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <JsonLd data={organizationSchema} />
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: `Rugby in ${c.name}`, path: `/rugby-in-${city}` },
                ])}
            />

            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: `Rugby in ${c.name}`, path: `/rugby-in-${city}` },
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

            <section className="prose prose-lg max-w-none text-[#333333] mb-10">
                <h2 className="font-claymore text-3xl text-[#111111] mt-10 mb-4">
                    The closest rugby club to {c.name}
                </h2>
                <p>
                    The Central Florida Claymores RFC are Orlando&apos;s USA Rugby Division 3 club, founded in 2018, and
                    one of the most active rugby programs in the Florida Rugby Union. We draw players from across Central
                    Florida — including {c.name} and the surrounding area — and welcome anyone who wants to learn the
                    game, regardless of experience level.
                </p>
                <p>
                    Practice is every Thursday, 8–10pm, at Barnett Park in Orlando. From {c.name}, the drive is roughly{' '}
                    {c.driveMinutes} minutes {c.direction} — a manageable trip for a serious club rugby program.
                </p>

                <h2 className="font-claymore text-3xl text-[#111111] mt-10 mb-4">
                    Why {c.name} players join the Claymores
                </h2>
                <ul>
                    <li>
                        <strong>Real competitive rugby.</strong> The Claymores compete in USA Rugby D3 through the Florida
                        Rugby Union, with state-final experience as recently as 2023.
                    </li>
                    <li>
                        <strong>No experience required.</strong> Our coaches develop players from absolute beginners into
                        contributors. If you&apos;ve never touched a rugby ball — that&apos;s fine.
                    </li>
                    <li>
                        <strong>Player-built culture.</strong> The club was founded and is run by players. Everyone earns
                        their spot, and the community extends far beyond Thursday nights.
                    </li>
                    <li>
                        <strong>Year-round play.</strong> Central Florida&apos;s climate means we train all year and play
                        through fall, winter, and spring.
                    </li>
                </ul>

                <h2 className="font-claymore text-3xl text-[#111111] mt-10 mb-4">
                    Getting to practice from {c.name}
                </h2>
                <p>
                    Barnett Park is at <strong>4801 W Colonial Dr, Orlando, FL 32808</strong>. From {c.name}, you&apos;ll
                    head {c.direction} into Orlando — most players in the {c.name} area pass landmarks like{' '}
                    {c.landmarks.slice(0, 2).join(' or ')} on the way. Free parking is available at Barnett Park.
                </p>
                <p>
                    Show up to a Thursday practice in athletic clothes and cleats if you have them. We&apos;ll handle the
                    rest. Or reach out beforehand and we&apos;ll meet you in the parking lot.
                </p>
            </section>

            <div className="mt-12 text-center bg-[#F9F9F9] rounded-xl p-8">
                <h2 className="text-2xl font-claymore text-[#111111] mb-3">Play Rugby in {c.name}</h2>
                <p className="text-[#555555] mb-6 max-w-xl mx-auto">
                    The Claymores are the rugby club for {c.name}. Come to a Thursday practice and see what Orlando rugby
                    is all about.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
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
                        Practice Info
                    </Link>
                </div>
            </div>

            {/* Cross-link to other city pages */}
            <div className="mt-10 text-center text-sm text-[#555555]">
                <p className="mb-3 uppercase tracking-widest text-xs text-[#fd80b5] font-semibold">
                    Rugby across Central Florida
                </p>
                <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                    {CITIES.filter((other) => other.slug !== c.slug).map((other) => (
                        <li key={other.slug}>
                            <Link
                                href={`/rugby-in-${other.slug}`}
                                className="text-[#77c3ef] hover:underline"
                            >
                                Rugby in {other.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
