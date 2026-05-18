import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import {
    standingsIndexQuery,
    type SanityStandingsIndexEntry,
} from '@/sanity/lib/queries'
import JsonLd from '@/components/json-ld'
import Breadcrumbs from '@/components/breadcrumbs'
import LeagueTable from '@/components/league-table'
import { breadcrumbSchema, seasonYearForUrl } from '@/lib/seo'
import { ogImage } from '@/lib/og'

export const revalidate = 3600

export const metadata: Metadata = {
    title: 'Florida Rugby Union Standings | Central Florida Claymores RFC | Orlando Rugby',
    description:
        'Season-by-season Florida Rugby Union league standings featuring the Central Florida Claymores RFC — Orlando rugby in the USA Rugby D3 South competition.',
    alternates: { canonical: '/standings' },
    openGraph: {
        title: 'Florida Rugby Union Standings | Central Florida Claymores RFC',
        description:
            "Browse every season's Florida Rugby Union league table, with the Central Florida Claymores' final standings across years of Orlando rugby.",
        url: '/standings',
        images: ogImage('/standings'),
    },
}

export default async function StandingsIndexPage() {
    const seasons: SanityStandingsIndexEntry[] = await client.fetch(standingsIndexQuery)
    const current = seasons[0] ?? null
    const past = seasons.slice(1)

    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <JsonLd
                data={breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Standings', path: '/standings' },
                ])}
            />

            <Breadcrumbs
                items={[
                    { name: 'Home', path: '/' },
                    { name: 'Standings', path: '/standings' },
                ]}
            />

            <div className="mb-10 text-center">
                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-2">
                    Central Florida Claymores RFC
                </p>
                <h1 className="text-5xl md:text-6xl font-claymore text-[#111111] mb-3">
                    Florida Rugby Union Standings
                </h1>
                <div className="w-12 h-px bg-[#fd80b5] mx-auto mb-4" />
                <p className="text-[#555555] max-w-2xl mx-auto">
                    Season-by-season league tables for the Central Florida Claymores RFC and the
                    Florida Rugby Union. Pick a season below for the full standings, playoff bracket,
                    and match-by-match results.
                </p>
            </div>

            {current && (
                <section className="mb-12" aria-labelledby="current-standings-heading">
                    <div className="flex items-baseline justify-between mb-4">
                        <h2 id="current-standings-heading" className="text-xl font-claymore text-[#111111]">
                            Current Season
                        </h2>
                        <Link
                            href={`/standings/${seasonYearForUrl(current.seasonLabel)}`}
                            className="text-xs font-semibold uppercase tracking-widest text-[#fd80b5] hover:underline"
                        >
                            Season page →
                        </Link>
                    </div>
                    <LeagueTable seasonLabel={current.seasonLabel} variant="full" />
                </section>
            )}

            {past.length > 0 && (
                <section aria-labelledby="past-seasons-heading">
                    <h2 id="past-seasons-heading" className="text-xl font-claymore text-[#111111] mb-4">
                        Past Seasons
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {past.map((s) => (
                            <Link
                                key={s.seasonLabel}
                                href={`/standings/${seasonYearForUrl(s.seasonLabel)}`}
                                className="block p-5 border border-[#EAEAEA] rounded-xl bg-white hover:border-[#77c3ef] transition-colors"
                            >
                                <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-1">
                                    {s.divisionName ?? 'Florida Rugby Union'}
                                </p>
                                <p className="text-2xl font-claymore text-[#111111]">{s.seasonLabel}</p>
                                <p className="text-xs text-[#555555] mt-2">
                                    {s.teamCount} {s.teamCount === 1 ? 'team' : 'teams'}
                                    {s.claymoresPosition != null && (
                                        <>
                                            {' · '}
                                            <span className="text-[#111111] font-semibold">
                                                Claymores finished #{s.claymoresPosition}
                                            </span>
                                        </>
                                    )}
                                </p>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {seasons.length === 0 && (
                <p className="text-center text-sm text-[#555555]">Standings coming soon.</p>
            )}
        </div>
    )
}
