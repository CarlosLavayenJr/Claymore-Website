import type { Metadata } from 'next'
import Link from 'next/link'
import RugbyHero from '@/components/Hero'
import InstagramFeed from '@/components/instafeed'
import JsonLd from '@/components/json-ld'
import { organizationSchema } from '@/lib/schema'
import TeamPhotoStrip from '@/components/team-photo-strip'
import UpcomingEvents from '@/components/upcoming-events'
import LeagueTable from '@/components/league-table'
import { ogImage } from '@/lib/og'
import { getPracticeSchedule } from '@/lib/practice-schedule'
import { client } from '@/sanity/lib/client'
import {
    matchesQuery,
    practicesQuery,
    teamsQuery,
    type SanityMatch,
    type SanityPractice,
    type SanityTeam,
} from '@/sanity/lib/queries'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
    const s = await getPracticeSchedule()
    // Use `absolute` to bypass the root layout's title template — otherwise
    // " | Central Florida Claymores | Orlando, FL" gets appended and the
    // homepage title blows past Google's ~60 char SERP limit.
    const title = 'Central Florida Claymores RFC | Orlando Rugby Club'
    return {
        title: { absolute: title },
        description: `Central Florida Claymores RFC — Orlando's USA Rugby D3 club competing in the Florida Rugby Union since 2018. No experience needed. Join us ${s.weekday}s.`,
        alternates: { canonical: '/' },
        openGraph: {
            title,
            description: `Orlando's USA Rugby D3 club. No experience needed. Join us ${s.weekday}s.`,
            url: '/',
            images: ogImage(),
        },
    }
}

export default async function Home() {
    const [schedule, matches, practices, teams]: [
        Awaited<ReturnType<typeof getPracticeSchedule>>,
        SanityMatch[],
        SanityPractice[],
        SanityTeam[],
    ] = await Promise.all([
        getPracticeSchedule(),
        client.fetch(matchesQuery),
        client.fetch(practicesQuery),
        client.fetch(teamsQuery),
    ])

    return (
        <main className="min-h-screen">
            <JsonLd data={organizationSchema} />
            <RugbyHero />

            {/* Location + CTA section — critical for local SEO H1 */}
            <section className="bg-white py-16">
                <div className="px-4 sm:px-6 lg:px-32">
                    <div className="flex flex-col lg:flex-row gap-8 lg:items-start lg:justify-between">
                        {/* League standings (compact) — desktop only */}
                        <div className="hidden lg:block w-96 shrink-0">
                            <LeagueTable variant="compact" />
                        </div>

                        {/* Centered hero text + CTAs (matches the original section layout) */}
                        <div className="flex-1 flex justify-center">
                            <div className="max-w-4xl text-center">
                                <h1 className="text-4xl md:text-5xl font-claymore mb-6">
                                    Orlando&apos;s Rugby Club — Central Florida Claymores RFC
                                </h1>
                                <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                                    The Central Florida Claymores RFC are Orlando&apos;s USA Rugby D3 club, competing in the Florida Rugby Union since 2018. We practice every {schedule.weekday} in the Orlando area and welcome players of all skill levels — no experience required.
                                </p>
                                <p className="text-sm text-[#555555] mb-8 max-w-xl mx-auto">
                                    <strong className="text-[#111111]">{schedule.seasonLabel}:</strong> {schedule.weekday}s {schedule.time} at {schedule.venueName}.{' '}
                                    <Link href="/fixtures" className="text-[#fd80b5] hover:underline">{schedule.seasonalNote}</Link>
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
                        </div>

                        {/* Upcoming events widget — desktop only */}
                        <div className="hidden lg:block w-96 shrink-0">
                            <UpcomingEvents matches={matches} practices={practices} teams={teams} />
                        </div>
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

            {/* Mobile-only upcoming events placement */}
            <section className="lg:hidden px-4 mb-12">
                <div className="max-w-sm mx-auto">
                    <UpcomingEvents matches={matches} practices={practices} teams={teams} />
                </div>
            </section>

            {/* Mobile-only league table placement — full variant since vertical scroll handles overflow */}
            <section className="lg:hidden px-4 mb-12">
                <div className="max-w-2xl mx-auto">
                    <LeagueTable variant="full" />
                </div>
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
                            href="/contact"
                            className="inline-block bg-[#77c3ef] text-white font-claymore text-lg px-10 py-3 rounded-md hover:bg-[#a0d5f5] transition-colors"
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
